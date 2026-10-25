import { useMemo } from 'react';
import { ENGINES } from '../../core/devices/registry.ts';
import type { DeviceId } from '../../core/devices/types.ts';
import { CHANNEL_OPTIONS, channelLabel } from '../settings/SettingsDialog.tsx';
import { send, sendManual, useStore } from '../store.ts';
import { manualChannel } from './manual.ts';
import { ManualBar } from './ManualBar.tsx';
import { DEVICE_VIEWS } from './views.ts';

/**
 * Панель процессора: заголовок с моделью, прошивкой, MIDI-каналом и
 * индикатором входящих сообщений, под ним — строка ручного управления и
 * изображение устройства с нажимаемыми футсвитчами. Ручные действия подаются
 * в монитор на канале устройства (при Omni — на канале 1).
 */
export function DevicePanel({ id }: { id: DeviceId }) {
  const engine = ENGINES[id];
  const state = useStore((s) => s.devices[id]);
  const channel = useStore((s) => s.config.devices[id].channel);
  const activity = useStore((s) => s.activity[id]);
  const View = DEVICE_VIEWS[id];
  const control = useMemo(() => ({ channel: manualChannel(channel), send: sendManual }), [channel]);
  return (
    <div className={`device-panel dev-${id}`}>
      <div className="device-head">
        <span key={activity} className={`midi-led${activity ? ' flash' : ''}`} title="Входящее MIDI для устройства" />
        <span className="device-title">
          {engine.vendor} {engine.model}
        </span>
        <span className="device-fw">{engine.firmware}</span>
        <label className="device-channel" title="MIDI-канал устройства">
          канал{' '}
          <select
            value={channel === undefined ? '' : String(channel)}
            disabled={channel === undefined}
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
        <button
          className="device-reset"
          onClick={() => send({ type: 'resetDevice', device: id })}
          title="Вернуть устройство в состояние после включения"
        >
          Сброс
        </button>
      </div>
      <ManualBar id={id} state={state} control={control} />
      <div className="device-body">
        <View state={state} control={control} />
      </div>
    </div>
  );
}
