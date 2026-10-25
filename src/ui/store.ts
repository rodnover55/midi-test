/**
 * Состояние страницы: монитор MIDI-потока, работающий прямо в браузере, и
 * входные порты Web MIDI API.
 */

import { useSyncExternalStore } from 'react';
import type { AppConfig } from '../core/config.ts';
import { CONFIG_VERSION, LOG_LIMIT_RANGE, migrateConfig, normalizeConfig, parseChannel } from '../core/config.ts';
import { ENGINES } from '../core/devices/registry.ts';
import type { ChannelSetting, DeviceId, DeviceSettings, DeviceStateBase } from '../core/devices/types.ts';
import { resolveSettings } from '../core/devices/types.ts';
import type { LogEntry, MonitorOptions, RealtimeStats } from '../core/monitor.ts';
import { Monitor } from '../core/monitor.ts';
import type { MidiBytes } from './devices/manual.ts';
import { MANUAL_PORT } from './devices/manual.ts';

/** Входной MIDI-порт, видимый браузеру. */
export interface PortStatus {
  /** Имя порта; по нему запоминается выбор пользователя. */
  name: string;
  /** Производитель, если браузер его сообщает, иначе пустая строка. */
  manufacturer: string;
  /** Включён ли порт в настройках. */
  enabled: boolean;
  /** Подключён ли порт сейчас (порт отключённого устройства остаётся в списке до перезагрузки страницы). */
  connected: boolean;
}

/**
 * Доступ к MIDI: `pending` — ждём разрешения браузера, `granted` — порты
 * слушаются, `denied` — пользователь или браузер отказал, `unsupported` —
 * браузер не поддерживает Web MIDI API или страница открыта не по https и не
 * с localhost.
 */
export type MidiAccessState = 'pending' | 'granted' | 'denied' | 'unsupported';

/** Снимок состояния страницы. */
export interface StoreState {
  access: MidiAccessState;
  /** Текст ошибки доступа к MIDI или null. */
  midiError: string | null;
  config: AppConfig;
  ports: PortStatus[];
  devices: Record<DeviceId, DeviceStateBase>;
  /** Журнал от старых записей к новым. */
  log: readonly LogEntry[];
  realtime: RealtimeStats;
  /** Номер последней записи журнала, адресованной устройству; 0 — не было. */
  activity: Record<DeviceId, number>;
}

/** Действие пользователя со страницы. */
export type Command =
  | { type: 'setDeviceChannel'; device: DeviceId; channel: ChannelSetting }
  /** Полный набор настроек; становится и текущим, и сохранённым. */
  | { type: 'setDeviceSettings'; device: DeviceId; settings: DeviceSettings }
  | { type: 'resetDevice'; device: DeviceId }
  | { type: 'setPortEnabled'; port: string; enabled: boolean }
  | { type: 'setLogRealtime'; enabled: boolean }
  | { type: 'setLogLimit'; limit: number }
  | { type: 'clearLog' };

const CONFIG_KEY = 'midi-test.config';

function loadConfig(): AppConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
  } catch {
    raw = undefined;
  }
  return normalizeConfig(migrateConfig(raw), ENGINES);
}

function monitorOptions(c: AppConfig): MonitorOptions {
  return { devices: c.devices, logRealtime: c.log.realtime, logLimit: c.log.limit };
}

const initialConfig = loadConfig();
const monitor = new Monitor(ENGINES, monitorOptions(initialConfig));

let state: StoreState = {
  access: 'pending',
  midiError: null,
  config: initialConfig,
  ports: [],
  devices: { ...monitor.states() },
  log: [],
  realtime: monitor.realtime(),
  activity: { qc: 0, hxstomp: 0 },
};

const listeners = new Set<() => void>();
let midiAccess: MIDIAccess | null = null;

function setState(next: Partial<StoreState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Возвращает часть состояния страницы и перерисовывает компонент при её
 * изменении.
 *
 * @param select функция выбора части состояния; должна возвращать тот же
 *   объект, пока эта часть не изменилась, иначе компонент перерисовывается
 *   бесконечно.
 */
export function useStore<T>(select: (s: StoreState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

// Сообщения копятся и показываются раз в кадр: поток MIDI Clock не должен
// перерисовывать страницу на каждом импульсе.
let pendingEntries: LogEntry[] = [];
let pendingDevices = false;
let frameRequested = false;

function scheduleFlush(): void {
  if (frameRequested) {
    return;
  }
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    flush();
  });
}

function flush(): void {
  const next: Partial<StoreState> = { realtime: monitor.realtime() };
  if (pendingEntries.length > 0) {
    next.log = [...monitor.log()];
    let activity = state.activity;
    for (const entry of pendingEntries) {
      for (const target of entry.targets) {
        activity = { ...activity, [target.device]: entry.id };
      }
    }
    next.activity = activity;
    pendingEntries = [];
  }
  if (pendingDevices) {
    next.devices = { ...monitor.states() };
    pendingDevices = false;
  }
  setState(next);
}

function ingest(port: string, bytes: number[], time: number): void {
  const result = monitor.process({ port, bytes, time });
  if (result.entry) {
    pendingEntries.push(result.entry);
  }
  if (result.changed.length > 0) {
    pendingDevices = true;
  }
  scheduleFlush();
}

function receive(port: string, event: MIDIMessageEvent): void {
  if (event.data) {
    ingest(port, Array.from(event.data), performance.timeOrigin + event.timeStamp);
  }
}

/**
 * Подаёт в монитор сообщения ручного управления по порядку, как полученные
 * сейчас с порта {@link MANUAL_PORT}: они меняют состояние устройств и
 * пишутся в журнал. На MIDI-выходы ничего не отправляется.
 */
export function sendManual(messages: readonly MidiBytes[]): void {
  const time = performance.timeOrigin + performance.now();
  for (const bytes of messages) {
    ingest(MANUAL_PORT, [...bytes], time);
  }
}

/** Подписывает включённые порты на приём, снимает подписку с выключенных и обновляет список портов. */
function syncPorts(): void {
  if (!midiAccess) {
    return;
  }
  const ports: PortStatus[] = [];
  for (const input of midiAccess.inputs.values()) {
    const name = input.name ?? input.id;
    const enabled = state.config.midi.ports[name] ?? true;
    input.onmidimessage = enabled ? (event) => receive(name, event) : null;
    ports.push({ name, manufacturer: input.manufacturer ?? '', enabled, connected: input.state === 'connected' });
  }
  ports.sort((a, b) => a.name.localeCompare(b.name));
  setState({ ports });
}

/**
 * Запрашивает доступ к MIDI и начинает слушать входные порты, в том числе
 * подключённые позже. Принимаются и SysEx, если браузер их разрешил.
 * Повторный вызов ничего не делает.
 */
export async function startMidi(): Promise<void> {
  if (midiAccess || state.access === 'unsupported') {
    return;
  }
  if (typeof navigator.requestMIDIAccess !== 'function') {
    setState({
      access: 'unsupported',
      midiError: 'Браузер не поддерживает Web MIDI API или страница открыта не по https и не с localhost.',
    });
    return;
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess({ sysex: true });
  } catch {
    try {
      access = await navigator.requestMIDIAccess();
    } catch (error) {
      setState({ access: 'denied', midiError: `Доступ к MIDI не получен: ${String(error)}` });
      return;
    }
  }
  midiAccess = access;
  access.onstatechange = () => syncPorts();
  setState({ access: 'granted', midiError: null });
  syncPorts();
}

function updateConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, version: CONFIG_VERSION }));
  const changed = monitor.configure(monitorOptions(config));
  setState({
    config,
    devices: changed.length > 0 ? { ...monitor.states() } : state.devices,
    log: [...monitor.log()],
  });
}

/** Выполняет действие пользователя; недопустимые значения игнорируются. */
export function send(command: Command): void {
  const config = state.config;
  switch (command.type) {
    case 'setDeviceChannel': {
      const channel = parseChannel(command.channel);
      if (channel !== null) {
        updateConfig({
          ...config,
          devices: { ...config.devices, [command.device]: { ...config.devices[command.device], channel } },
        });
      }
      return;
    }
    case 'setDeviceSettings': {
      const settings = resolveSettings(ENGINES[command.device].settings, command.settings);
      updateConfig({
        ...config,
        devices: { ...config.devices, [command.device]: { ...config.devices[command.device], settings } },
      });
      // Настройки, равные сохранённым, монитор не применяет повторно, а
      // MIDI-сообщения могли их изменить — применяются явно.
      monitor.applyDeviceSettings(command.device, settings);
      setState({ devices: { ...monitor.states() } });
      return;
    }
    case 'resetDevice':
      monitor.resetDevice(command.device);
      setState({ devices: { ...monitor.states() } });
      return;
    case 'setPortEnabled':
      updateConfig({ ...config, midi: { ...config.midi, ports: { ...config.midi.ports, [command.port]: command.enabled } } });
      syncPorts();
      return;
    case 'setLogRealtime':
      updateConfig({ ...config, log: { ...config.log, realtime: command.enabled } });
      return;
    case 'setLogLimit': {
      const limit = Math.round(command.limit);
      if (Number.isFinite(limit) && limit >= LOG_LIMIT_RANGE.min && limit <= LOG_LIMIT_RANGE.max) {
        updateConfig({ ...config, log: { ...config.log, limit } });
      }
      return;
    }
    case 'clearLog':
      monitor.clearLog();
      pendingEntries = [];
      setState({ log: [] });
      return;
  }
}
