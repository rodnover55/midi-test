import { ClockTracker } from './clock.ts';
import type { DeviceConfig } from './config.ts';
import type {
  ClockInfo,
  CommandDescription,
  DeviceEngine,
  DeviceId,
  DeviceSettings,
  DeviceStateBase,
} from './devices/types.ts';
import { DEVICE_IDS, resolveSettings } from './devices/types.ts';
import type { MidiMessage } from './midi.ts';
import { describeMessage, isChannelMessage, parseMidi } from './midi.ts';

/** MIDI-сообщение в том виде, в каком его получил входной порт. */
export interface RawMidiEvent {
  /** Время получения, миллисекунды Unix-времени с дробной частью. */
  time: number;
  /** Идентификатор входного порта. */
  port: string;
  bytes: number[];
}

/** Команда, которую сообщение выполнило на конкретном устройстве. */
export interface TargetDescription extends CommandDescription {
  device: DeviceId;
}

/** Запись журнала мониторинга. */
export interface LogEntry {
  /** Номер записи, растёт с каждой записью с запуска монитора. */
  id: number;
  /** Время получения, миллисекунды Unix-времени с дробной частью. */
  time: number;
  /** Миллисекунды от предыдущей записи журнала; null у первой записи. */
  delta: number | null;
  port: string;
  bytes: number[];
  message: MidiMessage;
  /** Общее описание сообщения без привязки к устройству. */
  summary: string;
  /**
   * Команды на устройствах, которым адресовано сообщение. Пусто, если канал
   * не назначен ни одному устройству или сообщение некорректно.
   */
  targets: TargetDescription[];
}

/** Сводка по сообщениям реального времени, которые не обязательно пишутся в журнал. */
export interface RealtimeStats {
  clock: ClockInfo & {
    /** Время последнего импульса Timing Clock или null. */
    lastTime: number | null;
  };
  activeSensing: {
    count: number;
    lastTime: number | null;
  };
}

/** Параметры работы монитора. */
export interface MonitorOptions {
  devices: Record<DeviceId, DeviceConfig>;
  /** Писать ли в журнал каждый Timing Clock и Active Sensing. */
  logRealtime: boolean;
  /** Наибольшее число записей журнала. */
  logLimit: number;
}

/** Последствия обработки одного сообщения. */
export interface ProcessResult {
  /** Новая запись журнала или null, если сообщение только подсчитано. */
  entry: LogEntry | null;
  /** Устройства, состояние которых изменилось. */
  changed: DeviceId[];
}

/**
 * Монитор MIDI-потока: разбирает входящие сообщения, передаёт их моделям
 * устройств согласно их MIDI-каналам, хранит состояние устройств и журнал.
 *
 * Сообщения канала получают устройства, слушающие этот канал или все каналы;
 * системные сообщения — все устройства; некорректные — никто. Timing Clock и
 * Active Sensing при выключенной записи реального времени только
 * подсчитываются, но устройствам передаются всегда.
 */
export class Monitor {
  private readonly engines: Record<DeviceId, DeviceEngine>;
  private options: MonitorOptions;
  private readonly deviceStates = {} as Record<DeviceId, DeviceStateBase>;
  private entries: LogEntry[] = [];
  private nextId = 1;
  private lastLoggedTime: number | null = null;
  private readonly clock = new ClockTracker();
  private activeSensing = { count: 0, lastTime: null as number | null };

  /**
   * Создаёт монитор с устройствами в начальном состоянии и пустым журналом.
   *
   * @param engines модель для каждого устройства.
   * @param options каналы и настройки устройств, параметры журнала;
   *   объект копируется.
   */
  constructor(engines: Record<DeviceId, DeviceEngine>, options: MonitorOptions) {
    this.engines = engines;
    this.options = structuredClone(options);
    for (const id of DEVICE_IDS) {
      this.deviceStates[id] = engines[id].createState(this.fullSettings(id, options.devices[id].settings));
    }
  }

  /**
   * Обрабатывает полученное сообщение: обновляет состояние устройств, MIDI
   * Clock и журнал.
   *
   * @param event сообщение; время должно не убывать от вызова к вызову.
   */
  process(event: RawMidiEvent): ProcessResult {
    const message = parseMidi(event.bytes);
    switch (message.kind) {
      case 'clock':
        this.clock.tick(event.time);
        break;
      case 'start':
      case 'continue':
        this.clock.start();
        break;
      case 'stop':
        this.clock.stop();
        break;
      case 'activeSensing':
        this.activeSensing = { count: this.activeSensing.count + 1, lastTime: event.time };
        break;
      default:
        break;
    }
    const context = { time: event.time, clock: this.clock.info() };
    const targets: TargetDescription[] = [];
    const changed: DeviceId[] = [];
    for (const id of this.recipients(message)) {
      const before = this.deviceStates[id];
      const result = this.engines[id].handle(before, message, context);
      this.deviceStates[id] = result.state;
      if (result.state !== before) {
        changed.push(id);
      }
      targets.push({ device: id, ...result.description });
    }
    const quiet = (message.kind === 'clock' || message.kind === 'activeSensing') && !this.options.logRealtime;
    if (quiet) {
      return { entry: null, changed };
    }
    const entry: LogEntry = {
      id: this.nextId++,
      time: event.time,
      delta: this.lastLoggedTime === null ? null : event.time - this.lastLoggedTime,
      port: event.port,
      bytes: [...event.bytes],
      message,
      summary: describeMessage(message),
      targets,
    };
    this.lastLoggedTime = event.time;
    this.entries.push(entry);
    this.trimLog();
    return { entry, changed };
  }

  /** Устройства, которым адресовано сообщение, в порядке отображения. */
  private recipients(message: MidiMessage): DeviceId[] {
    if (message.kind === 'invalid') {
      return [];
    }
    if (!isChannelMessage(message)) {
      return [...DEVICE_IDS];
    }
    return DEVICE_IDS.filter((id) => {
      const channel = this.options.devices[id].channel;
      return channel === 'omni' || channel === message.channel;
    });
  }

  private trimLog(): void {
    const limit = this.options.logLimit;
    // Удаление пачкой: не сдвигать массив на каждом сообщении.
    if (this.entries.length > limit + Math.max(1, Math.floor(limit / 10))) {
      this.entries = this.entries.slice(this.entries.length - limit);
    }
  }

  private fullSettings(id: DeviceId, settings: DeviceSettings | undefined): DeviceSettings {
    return resolveSettings(this.engines[id].settings, settings);
  }

  /** Возвращает текущее состояние каждого устройства. */
  states(): Readonly<Record<DeviceId, DeviceStateBase>> {
    return this.deviceStates;
  }

  /**
   * Возвращает журнал от старых записей к новым, не больше заданного
   * размера журнала.
   */
  log(): readonly LogEntry[] {
    const limit = this.options.logLimit;
    return this.entries.length > limit ? this.entries.slice(this.entries.length - limit) : this.entries;
  }

  /** Возвращает сводку по MIDI Clock и Active Sensing. */
  realtime(): RealtimeStats {
    return {
      clock: { ...this.clock.info(), lastTime: this.clock.lastTickTime() },
      activeSensing: { ...this.activeSensing },
    };
  }

  /**
   * Применяет новые каналы, настройки устройств и параметры журнала.
   *
   * Изменённые настройки устройства применяются к его текущему состоянию;
   * журнал при уменьшении размера укорачивается со стороны старых записей.
   *
   * @returns устройства, состояние которых изменилось.
   */
  configure(options: MonitorOptions): DeviceId[] {
    const previous = this.options;
    this.options = structuredClone(options);
    const changed: DeviceId[] = [];
    for (const id of DEVICE_IDS) {
      const settings = this.fullSettings(id, options.devices[id].settings);
      if (JSON.stringify(settings) !== JSON.stringify(this.fullSettings(id, previous.devices[id].settings))) {
        this.deviceStates[id] = this.engines[id].applySettings(this.deviceStates[id], settings);
        changed.push(id);
      }
    }
    if (this.entries.length > options.logLimit) {
      this.entries = this.entries.slice(this.entries.length - options.logLimit);
    }
    return changed;
  }

  /**
   * Применяет настройки к текущему состоянию устройства, даже если они равны
   * сохранённым: так отменяются изменения настроек, сделанные MIDI-сообщениями.
   *
   * @param settings значения настроек; отсутствующие и недопустимые
   *   заменяются значениями по умолчанию.
   */
  applyDeviceSettings(id: DeviceId, settings: DeviceSettings): void {
    this.deviceStates[id] = this.engines[id].applySettings(this.deviceStates[id], this.fullSettings(id, settings));
  }

  /** Возвращает устройство в начальное состояние с сохранёнными настройками. */
  resetDevice(id: DeviceId): void {
    this.deviceStates[id] = this.engines[id].createState(this.fullSettings(id, this.options.devices[id].settings));
  }

  /** Удаляет все записи журнала; номера новых записей продолжают расти. */
  clearLog(): void {
    this.entries = [];
    this.lastLoggedTime = null;
  }
}
