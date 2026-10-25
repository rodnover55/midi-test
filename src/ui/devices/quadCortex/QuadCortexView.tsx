import { useId } from 'react';
import type { QuadCortexState } from '../../../core/devices/quadCortex/engine.ts';
import { quadCortexAt, readQuadCortexSettings } from '../../../core/devices/quadCortex/engine.ts';
import { BANK_UP, Body, BodyDefs, COLUMN_X, Glare, Led, LED_ROW_Y } from './Body.tsx';
import type { LedLight } from './leds.ts';
import { quadCortexLeds, tempoBlink, tempoLit } from './leds.ts';
import { FONT } from './palette.ts';
import './QuadCortexView.css';
import { Screen } from './screens/Screen.tsx';
import { statusText } from './status.ts';
import { useModelTime } from './useModelTime.ts';

const TEMPO_OFF: LedLight = { color: '#FFFFFF', level: 'off' };

/**
 * Изображение Quad Cortex в текущем состоянии: корпус в масштабе
 * (`viewBox` в миллиметрах), экран по верхнему открытому экрану модели,
 * светодиоды по режиму и состоянию футсвитчей, мигание TEMPO в темп модели;
 * под изображением — строка состояния на русском.
 *
 * Рисует SVG с классом `device-svg` и строку состояния: родитель —
 * flex-колонка, SVG занимает оставшуюся высоту и вписывается в неё с
 * сохранением пропорций. Между сообщениями изображение пересчитывается на
 * текущий момент (`quadCortexAt`): закрывается окно Tempo, идёт запись
 * петли и т. п.
 */
export function QuadCortexView({ state }: { state: QuadCortexState }) {
  const now = useModelTime(state);
  const p = `qc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const shown = quadCortexAt(state, now);
  const settings = readQuadCortexSettings(shown.settings);
  const leds = quadCortexLeds(shown, settings);
  const blink = tempoBlink(shown.tempo);
  const tempo: LedLight = blink !== null && tempoLit(blink, now) ? { color: blink.color, level: 'on' } : TEMPO_OFF;
  const status = statusText(shown, now);
  return (
    <>
      <svg
        className="device-svg"
        viewBox="0 0 290 195"
        preserveAspectRatio="xMidYMid meet"
        fontFamily={FONT}
        role="img"
        aria-label={`Quad Cortex: ${status}`}
      >
        <BodyDefs p={p} />
        <Body p={p} />
        <Screen state={shown} settings={settings} now={now} />
        <Glare p={p} />
        <Led p={p} x={BANK_UP.x} y={BANK_UP.ledY} light={leds.bankUp} />
        {LED_ROW_Y.flatMap((y, row) =>
          COLUMN_X.map((x, column) => {
            const light =
              column < 4 ? leds.footswitches[row * 4 + column] : row === 0 ? leds.bankDown : tempo;
            return <Led key={`${row}-${column}`} p={p} x={x} y={y} light={light} />;
          }),
        )}
      </svg>
      <div className="qc-status">{status}</div>
    </>
  );
}
