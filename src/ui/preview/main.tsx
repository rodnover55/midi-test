/**
 * Страница предпросмотра устройства: /preview.html?device=qc&midi=B1 2B 02;C1 05
 *
 * Параметры адреса:
 * - `device` — `qc` или `hxstomp`;
 * - `midi` — последовательность сообщений (см. parseSequence);
 * - `channel` — канал устройства, 1–16 или `omni`; по умолчанию канал по
 *   умолчанию устройства;
 * - `gap` — интервал между сообщениями, мс, по умолчанию 100;
 * - `width` — ширина изображения, px, по умолчанию 1000;
 * - `settings` — настройки устройства в JSON;
 * - `log` — `0`, чтобы не показывать описания сообщений.
 *
 * Сообщения воспроизводятся с условного момента START; часы модели на странице
 * идут от времени последнего сообщения.
 */

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_CHANNELS, parseChannel } from '../../core/config.ts';
import { ENGINES } from '../../core/devices/registry.ts';
import type { DeviceId } from '../../core/devices/types.ts';
import { DEVICE_IDS } from '../../core/devices/types.ts';
import type { ModelClock } from '../devices/modelClock.ts';
import { ModelClockContext } from '../devices/modelClock.ts';
import { DEVICE_ASPECT, DEVICE_VIEWS } from '../devices/views.ts';
import '../styles.css';
import { parseSequence, replay } from '../../core/replay.ts';

/** Момент первого воспроизводимого сообщения. */
const START = Date.UTC(2026, 0, 1, 12);

function Preview() {
  const params = new URLSearchParams(location.search);
  const device = (DEVICE_IDS as readonly string[]).includes(params.get('device') ?? '')
    ? (params.get('device') as DeviceId)
    : 'qc';
  const channel = parseChannel(params.get('channel')) ?? DEFAULT_CHANNELS[device];
  const width = Number(params.get('width')) || 1000;
  const gap = Number(params.get('gap')) || 100;
  let error: string | null = null;
  let result = null;
  let lastTime = START;
  try {
    const settings = params.get('settings') ? JSON.parse(params.get('settings')!) : undefined;
    const messages = parseSequence(params.get('midi') ?? '');
    lastTime = START + Math.max(0, messages.length - 1) * gap;
    result = replay(device, messages, { channel, gap, start: START, settings });
  } catch (e) {
    error = String(e);
  }
  const clock = useMemo<ModelClock>(() => {
    const mounted = performance.now();
    return () => lastTime + performance.now() - mounted;
  }, [lastTime]);
  const View = DEVICE_VIEWS[device];
  return (
    <div style={{ padding: 16, width: width + 32 }}>
      <div className={`device-panel dev-${device}`} style={{ width, height: Math.round(width / DEVICE_ASPECT[device]) + 48 }}>
        <div className="device-head">
          <span className="device-title">
            {ENGINES[device].vendor} {ENGINES[device].model}
          </span>
          <span className="device-fw">{ENGINES[device].firmware}</span>
        </div>
        <div className="device-body" data-testid="device-body">
          {result && (
            <ModelClockContext.Provider value={clock}>
              <View state={result.state} />
            </ModelClockContext.Provider>
          )}
        </div>
      </div>
      {error && <pre className="error">{error}</pre>}
      {result && params.get('log') !== '0' && (
        <ol className="mono" style={{ fontSize: 12 }}>
          {result.steps.map((s, i) => (
            <li key={i}>
              {s.hex} — {s.description ? `${s.description.text} [${s.description.effect}]` : 'другой канал'}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
