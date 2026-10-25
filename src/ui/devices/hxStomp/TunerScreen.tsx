/**
 * Экран Tuner HX Stomp (тип Fine) в координатах экрана 320 × 240 px.
 */

import type { HxTunerPage } from '../../../core/devices/hxStomp/engine.ts';
import { TUNER_PAGES } from '../../../core/devices/hxStomp/engine.ts';
import { KNOB_COLUMNS, ValueBar } from './EditScreen.tsx';
import { TuningFork } from './icons.tsx';
import { SCREEN, splitLabel, UNKNOWN_TEXT } from './look.ts';
import { fitSize, ScreenText, WEIGHT } from './text.tsx';

/** Цвета сегментов шкалы точной настройки слева направо. */
const FINE_SCALE: readonly string[] = ['#5a5a5a', '#6d6d6d', '#808080', '#808080', '#6d6d6d', '#5a5a5a'];

/** Цвета сегментов грубой шкалы слева направо. */
const COARSE_SCALE: readonly string[] = [
  '#333333',
  '#464646',
  '#5a5a5a',
  '#6d6d6d',
  '#808080',
  '#808080',
  '#6d6d6d',
  '#5a5a5a',
  '#464646',
  '#333333',
];

/** Наибольшая ширина названия параметра в колонке, px. */
const NAME_WIDTH = 100;

/** Название параметра Tuner над ручкой: в строку, а длинное — в две строки мельче. */
function ParameterName({ cx, name }: { cx: number; name: string }) {
  const single = fitSize(name, 28.9, WEIGHT.light, NAME_WIDTH);
  const lines = splitLabel(name);
  if (single >= 21 || lines.length === 1) {
    return <ScreenText x={cx} y={229.2} text={name} size={single} weight={WEIGHT.light} fill={SCREEN.text} />;
  }
  return (
    <g>
      {lines.map((line, i) => (
        <ScreenText
          key={i}
          x={cx}
          y={i === 0 ? 211 : 233}
          text={line}
          size={22.2}
          weight={WEIGHT.light}
          fill={SCREEN.text}
          maxWidth={NAME_WIDTH}
        />
      ))}
    </g>
  );
}

/**
 * Экран Tuner: нота и показания настройки зависят от звука и неизвестны —
 * вместо ноты прочерк, стрелки погашены, шкалы без указателей. Ниже —
 * отметка страницы настроек, заголовок «Tuner» и названия настроек страницы
 * `page` над Knob 1–3; их значения — глобальные настройки, неизвестные
 * модели.
 */
export function TunerScreen({ page }: { page: HxTunerPage }) {
  const names = TUNER_PAGES[page - 1] ?? [];
  const pageWidth = 320 / TUNER_PAGES.length;
  return (
    <g>
      <ScreenText x={160} y={57} text="–" size={66.7} weight={WEIGHT.thin} fill={SCREEN.gray} />
      <path
        d="M102.2 18.7L115.9 32.3L102.2 45.9M217.7 18.7L204 32.3L217.7 45.9"
        fill="none"
        stroke={SCREEN.track}
        strokeWidth={1.4}
      />
      {FINE_SCALE.map((color, k) => (
        <rect key={k} x={71.5 + 30.04 * k} y={64.2} width={27.2} height={7.1} fill={color} />
      ))}
      {COARSE_SCALE.map((color, k) => (
        <rect key={k} x={11.5 + 30.04 * k} y={78} width={27.2} height={36.3} fill={color} />
      ))}

      <line x1={0} y1={122.6} x2={320} y2={122.6} stroke={SCREEN.secondary} strokeOpacity={0.45} strokeWidth={1.16} />
      <line
        x1={(page - 1) * pageWidth}
        y1={122.6}
        x2={page * pageWidth}
        y2={122.6}
        stroke={SCREEN.secondary}
        strokeWidth={2.31}
      />
      <TuningFork x={10.6} y={131.1} />
      <ScreenText
        x={41.4}
        y={152.1}
        text="Tuner"
        size={28.9}
        weight={WEIGHT.light}
        fill={SCREEN.secondary}
        anchor="start"
      />
      {KNOB_COLUMNS.map((column, i) => {
        const cx = (column.x0 + column.x1) / 2;
        const name = names[i];
        if (name === undefined) {
          return null;
        }
        return (
          <g key={i}>
            <ScreenText x={cx} y={179.7} text={UNKNOWN_TEXT} size={22.2} weight={WEIGHT.regular} fill={SCREEN.gray} />
            <ValueBar x0={column.x0} x1={column.x1} y={189.4} value={null} />
            <ParameterName cx={cx} name={name} />
          </g>
        );
      })}
    </g>
  );
}
