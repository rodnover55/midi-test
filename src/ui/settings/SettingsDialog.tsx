import { useEffect } from 'react';
import { LOG_LIMIT_RANGE } from '../../core/config.ts';
import { ENGINES } from '../../core/devices/registry.ts';
import type { ChannelSetting, DeviceId, DeviceSettings, SettingDef, SettingValue } from '../../core/devices/types.ts';
import { DEVICE_IDS } from '../../core/devices/types.ts';
import { send, useStore } from '../store.ts';

/** Варианты MIDI-канала для выпадающего списка. */
export const CHANNEL_OPTIONS: readonly ChannelSetting[] = ['omni', ...Array.from({ length: 16 }, (_, i) => i + 1)];

/** Возвращает подпись канала: `1`–`16` или `Omni`. */
export function channelLabel(channel: ChannelSetting): string {
  return channel === 'omni' ? 'Omni' : String(channel);
}

function formatSetting(def: SettingDef, value: SettingValue | undefined): string {
  if (def.type === 'boolean') {
    return value ? 'вкл.' : 'выкл.';
  }
  if (def.type === 'select') {
    return def.options.find((o) => o.value === value)?.label ?? String(value);
  }
  return String(value);
}

function SettingField({
  def,
  value,
  current,
  onChange,
}: {
  def: SettingDef;
  value: SettingValue;
  current: SettingValue | undefined;
  onChange(value: SettingValue): void;
}) {
  const differs = current !== undefined && current !== value;
  let control;
  switch (def.type) {
    case 'boolean':
      control = <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case 'select':
      control = (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      control = (
        <input
          type="number"
          min={def.min}
          max={def.max}
          value={Number(value)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= def.min && n <= def.max) {
              onChange(n);
            }
          }}
        />
      );
      break;
  }
  return (
    <label className="setting">
      <span className="setting-label">
        {def.label}
        {def.hint && <span className="hint">{def.hint}</span>}
        {differs && <span className="hint warn">Сейчас на устройстве: {formatSetting(def, current)} (изменено MIDI)</span>}
      </span>
      {control}
    </label>
  );
}

function DeviceSection({ id }: { id: DeviceId }) {
  const engine = ENGINES[id];
  const config = useStore((s) => s.config.devices[id]);
  const current = useStore((s) => s.devices[id]?.settings);
  if (!config) {
    return null;
  }
  const update = (key: string, value: SettingValue) => {
    const settings: DeviceSettings = { ...config.settings, [key]: value };
    send({ type: 'setDeviceSettings', device: id, settings });
  };
  return (
    <fieldset>
      <legend>
        {engine.vendor} {engine.model} · {engine.firmware}
      </legend>
      <label className="setting">
        <span className="setting-label">
          MIDI-канал
          <span className="hint">Канал, на котором устройство принимает сообщения; Omni — все каналы.</span>
        </span>
        <select
          value={String(config.channel)}
          onChange={(e) =>
            send({
              type: 'setDeviceChannel',
              device: id,
              channel: e.target.value === 'omni' ? 'omni' : Number(e.target.value),
            })
          }
        >
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={String(c)}>
              {channelLabel(c)}
            </option>
          ))}
        </select>
      </label>
      {engine.settings.map((def) => (
        <SettingField
          key={def.key}
          def={def}
          value={config.settings[def.key]}
          current={current?.[def.key]}
          onChange={(v) => update(def.key, v)}
        />
      ))}
    </fieldset>
  );
}

/**
 * Окно настроек: входные MIDI-порты, каналы и настройки процессоров, запись
 * журнала. Изменения применяются сразу и сохраняются в браузере.
 */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const ports = useStore((s) => s.ports);
  const midiError = useStore((s) => s.midiError);
  const log = useStore((s) => s.config.log);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Настройки" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Настройки</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>
        <fieldset>
          <legend>MIDI-входы</legend>
          {midiError && <p className="error">{midiError}</p>}
          <p className="hint">
            Монитор слушает включённые входы. Чтобы видеть поток из DAW без MIDI-интерфейса, направьте её MIDI-выход в
            «Midi Through». Если браузер показывает и собственный выход DAW, не включайте оба порта сразу, иначе каждое
            сообщение придёт дважды.
          </p>
          {ports.length === 0 && <p className="muted">Входных портов нет.</p>}
          {ports.map((p) => (
            <label key={p.name} className="setting">
              <span className="setting-label">
                {p.name}
                {p.manufacturer && <span className="tag">{p.manufacturer}</span>}
                <span className="hint">{!p.connected ? 'отключён' : p.enabled ? 'слушается' : 'выключен'}</span>
              </span>
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => send({ type: 'setPortEnabled', port: p.name, enabled: e.target.checked })}
              />
            </label>
          ))}
        </fieldset>
        {DEVICE_IDS.map((id) => (
          <DeviceSection key={id} id={id} />
        ))}
        {log && (
          <fieldset>
            <legend>Журнал</legend>
            <label className="setting">
              <span className="setting-label">
                Записывать Timing Clock и Active Sensing
                <span className="hint">
                  Эти сообщения идут десятками в секунду. Когда запись выключена, они только подсчитываются и
                  показываются в заголовке.
                </span>
              </span>
              <input
                type="checkbox"
                checked={log.realtime}
                onChange={(e) => send({ type: 'setLogRealtime', enabled: e.target.checked })}
              />
            </label>
            <label className="setting">
              <span className="setting-label">
                Размер журнала, записей
                <span className="hint">
                  От {LOG_LIMIT_RANGE.min} до {LOG_LIMIT_RANGE.max}; старые записи удаляются.
                </span>
              </span>
              <input
                type="number"
                min={LOG_LIMIT_RANGE.min}
                max={LOG_LIMIT_RANGE.max}
                step={100}
                defaultValue={log.limit}
                onBlur={(e) => send({ type: 'setLogLimit', limit: Number(e.target.value) })}
              />
            </label>
          </fieldset>
        )}
      </div>
    </div>
  );
}
