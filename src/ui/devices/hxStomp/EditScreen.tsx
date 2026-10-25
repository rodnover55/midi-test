/**
 * Edit view HX Stomp в координатах экрана 320 × 240 px: строка пресета,
 * схема сигнала и инспектор выбранного блока со значениями над Knob 1–3.
 */

import type { HxStompState } from '../../../core/devices/hxStomp/engine.ts';
import { BypassPanel, EditedMark, measuredWidth } from './PlayScreen.tsx';
import { SCREEN, UNKNOWN_TEXT } from './look.ts';
import { ScreenText, WEIGHT } from './text.tsx';

/** Колонки параметров над Knob 1–3: края полоски значения, px. */
export const KNOB_COLUMNS: readonly { x0: number; x1: number }[] = [
  { x0: 6.4, x1: 99.9 },
  { x0: 112.9, x1: 206.3 },
  { x0: 219.4, x1: 312.8 },
];

/** Центры восьми позиций блоков схемы сигнала, px. */
const BLOCK_CENTERS: readonly number[] = Array.from({ length: 8 }, (_, k) => 41 + 34 * k);

/** Толщина полоски значения, px. */
const BAR_HEIGHT = 3.4;

/**
 * Полоска значения параметра: дорожка и, при известном значении, заливка до
 * положения ручки с маркером на нём.
 *
 * @param x0 левый край полоски.
 * @param x1 правый край полоски.
 * @param y середина полоски по вертикали.
 * @param value положение ручки 0–127; null — неизвестно, только дорожка.
 */
export function ValueBar({ x0, x1, y, value }: { x0: number; x1: number; y: number; value: number | null }) {
  const top = y - BAR_HEIGHT / 2;
  const at = value === null ? null : x0 + ((x1 - x0) * value) / 127;
  return (
    <g>
      <rect x={x0} y={top} width={x1 - x0} height={BAR_HEIGHT} fill={SCREEN.track} />
      {at !== null && (
        <>
          <rect x={x0} y={top} width={at - x0} height={BAR_HEIGHT} fill="#fff" fillOpacity={0.4} />
          <rect
            x={Math.min(Math.max(at - 4.5, x0), x1 - 9)}
            y={y - 2.3}
            width={9}
            height={4.6}
            fill={SCREEN.text}
          />
        </>
      )}
    </g>
  );
}

/**
 * Edit view: номер пресета, прочерк вместо неизвестного имени и значок «E»,
 * схема сигнала из пустых позиций (блоки пресета неизвестны), инспектор с
 * прочерками вместо неизвестных имени блока, параметров и их значений и
 * полосками положений Knob 1–3, заданных CC75–CC77. При All Bypass вместо
 * инспектора — сообщение All Bypass.
 */
export function EditScreen({ state }: { state: HxStompState }) {
  const preset = state.preset;
  const number = preset ? preset.label : UNKNOWN_TEXT;
  const nameX = 2.7 + measuredWidth(number, 28.9, WEIGHT.bold) + 7.5;
  const nameWidth = measuredWidth(UNKNOWN_TEXT, 28.9, WEIGHT.light);
  return (
    <g>
      <ScreenText
        x={2.7}
        y={28}
        text={number}
        size={28.9}
        weight={WEIGHT.bold}
        fill={preset ? SCREEN.text : SCREEN.gray}
        anchor="start"
      />
      <ScreenText
        x={nameX}
        y={28}
        text={UNKNOWN_TEXT}
        size={28.9}
        weight={WEIGHT.light}
        fill={SCREEN.gray}
        anchor="start"
      />
      {state.edited && <EditedMark x={nameX + nameWidth + 3} y={7} height={10} />}

      <line x1={19.6} y1={59.8} x2={300.2} y2={59.8} stroke={SCREEN.gray} strokeWidth={2.3} />
      <circle cx={12.2} cy={59.8} r={7.6} fill={SCREEN.ink} stroke={SCREEN.gray} strokeWidth={2.3} />
      <circle cx={307.6} cy={59.8} r={7.6} fill={SCREEN.ink} stroke={SCREEN.gray} strokeWidth={2.3} />
      {BLOCK_CENTERS.map((cx) => (
        <rect
          key={cx}
          x={cx - 10.2}
          y={49.6}
          width={20.4}
          height={20.4}
          rx={3}
          fill="#000"
          stroke={SCREEN.track}
          strokeWidth={2}
        />
      ))}

      <line x1={0} y1={120} x2={320} y2={120} stroke="#fff" strokeOpacity={0.4} strokeWidth={1.16} />
      {state.allBypass ? (
        <BypassPanel state={state} />
      ) : (
        <g>
          <ScreenText
            x={39.7}
            y={148.2}
            text={UNKNOWN_TEXT}
            size={28.9}
            weight={WEIGHT.light}
            fill={SCREEN.gray}
            anchor="start"
          />
          {KNOB_COLUMNS.map((column, i) => {
            const cx = (column.x0 + column.x1) / 2;
            return (
              <g key={i}>
                <ScreenText
                  x={cx}
                  y={177.3}
                  text={UNKNOWN_TEXT}
                  size={22.2}
                  weight={WEIGHT.regular}
                  fill={SCREEN.gray}
                />
                <ValueBar x0={column.x0} x1={column.x1} y={188.5} value={state.knobs[i] ?? null} />
                <ScreenText x={cx} y={231.3} text={UNKNOWN_TEXT} size={28.9} weight={WEIGHT.light} fill={SCREEN.gray} />
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}
