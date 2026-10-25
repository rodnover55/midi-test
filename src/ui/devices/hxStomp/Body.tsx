/**
 * Корпус HX Stomp в виде строго сверху: силуэт с гайками разъёмов, верхняя
 * панель, ступень и секция футсвитчей, рамка экрана, ручки, кнопки, надписи и
 * логотипы. Координаты — миллиметры от левого верхнего угла габарита
 * 178 × 126 мм вместе с гайками разъёмов.
 */

import { memo } from 'react';
import { LINE6_LOGO, MODEL_LOGO } from './logos.ts';

/** Габарит корпуса с гайками разъёмов, мм: viewBox изображения. */
export const BODY_SIZE = { width: 178, height: 126 } as const;

/** Активная область экрана 320 × 240 px на панели, мм. */
export const SCREEN_RECT = { x: 31.54, y: 16.66, width: 48.96, height: 36.72 } as const;

/** Центры футсвитчей FS1–FS3, мм. */
export const FOOTSWITCH_X: readonly number[] = [23.03, 89.02, 155.0];

/** Высота центров футсвитчей, мм. */
export const FOOTSWITCH_Y = 104.1;

const LABEL = '#e6e6e8';
const PANEL_FONT =
  "'Trade Gothic Next Cond', 'TradeGothic LT CondEighteen', 'Liberation Sans Narrow', 'Nimbus Sans Narrow', " +
  "'Arial Narrow', 'Roboto Condensed', 'DejaVu Sans Condensed', sans-serif";

/** Силуэт корпуса: задние углы скруглены на 4 мм, передние — на 6 мм. */
const SHELL =
  'M8.02 4.02H169.99A4 4 0 0 1 173.99 8.02V119.99A6 6 0 0 1 167.99 125.99H10.02A6 6 0 0 1 4.02 119.99V8.02' +
  'A4 4 0 0 1 8.02 4.02Z';

/** Гайки разъёмов на задней стенке: левый край, мм. */
const REAR_JACKS: readonly number[] = [55.64, 76.13, 98.13, 120.12, 142.12];

/** Гайки разъёмов на правой стенке: верхний край, мм. */
const RIGHT_JACKS: readonly number[] = [45.14, 67.14, 89.13];

const JACK_LENGTH = 15.75;
const JACK_DEPTH = 4.02;
const KNOB_R = 6.375;
const KNOB_TOP_R = 5.78;
const BUTTON_CORNER = 0.76;
const BUTTON_CONCAVE = 7;

/** Записывает число для атрибута `d`: не больше трёх знаков после точки, без конечных нулей. */
function n(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

/** Блики конического верха ручки: секторы по 15° с яркостью по направлению света сверху слева. */
const KNOB_SHEEN = Array.from({ length: 24 }, (_, i) => {
  const a0 = (i * Math.PI) / 12;
  const a1 = ((i + 1) * Math.PI) / 12;
  const light = Math.cos((a0 + a1) / 2 - (5 * Math.PI) / 4) ** 2;
  const r = KNOB_TOP_R;
  const from = `${n(r * Math.cos(a0))} ${n(r * Math.sin(a0))}`;
  const to = `${n(r * Math.cos(a1))} ${n(r * Math.sin(a1))}`;
  return {
    d: `M0 0L${from}A${r} ${r} 0 0 1 ${to}Z`,
    opacity: 0.012 + 0.1 * light,
  };
});

/**
 * Возвращает контур кнопки плашки: прямоугольник со скруглёнными углами,
 * у которого край, обращённый к ручке, вогнут по дуге вокруг ручки.
 *
 * @param side `right` — ручка справа от кнопки, `left` — слева.
 * @param kx центр ручки по горизонтали.
 * @param ky центр ручки по вертикали.
 */
function buttonPath(x0: number, y0: number, x1: number, y1: number, side: 'left' | 'right', kx: number, ky: number) {
  const r = BUTTON_CORNER;
  const R = BUTTON_CONCAVE;
  const top = `M${n(x0 + r)} ${n(y0)}H${n(x1 - r)}A${r} ${r} 0 0 1 ${n(x1)} ${n(y0 + r)}`;
  if (side === 'right') {
    const dy = Math.sqrt(R * R - (kx - x1) ** 2);
    return (
      `${top}V${n(ky - dy)}A${R} ${R} 0 0 0 ${n(x1)} ${n(ky + dy)}V${n(y1 - r)}A${r} ${r} 0 0 1 ${n(x1 - r)} ${n(y1)}` +
      `H${n(x0 + r)}A${r} ${r} 0 0 1 ${n(x0)} ${n(y1 - r)}V${n(y0 + r)}A${r} ${r} 0 0 1 ${n(x0 + r)} ${n(y0)}Z`
    );
  }
  const dy = Math.sqrt(R * R - (x0 - kx) ** 2);
  return (
    `${top}V${n(y1 - r)}A${r} ${r} 0 0 1 ${n(x1 - r)} ${n(y1)}H${n(x0 + r)}A${r} ${r} 0 0 1 ${n(x0)} ${n(y1 - r)}` +
    `V${n(ky + dy)}A${R} ${R} 0 0 0 ${n(x0)} ${n(ky - dy)}V${n(y0 + r)}A${r} ${r} 0 0 1 ${n(x0 + r)} ${n(y0)}Z`
  );
}

/**
 * Скобка под рядом кнопок, обозначающая сочетание двух кнопок: две дуги,
 * сходящиеся к надписи или значку посередине.
 *
 * @param top верх дуг, мм.
 * @param bottom горизонтальная часть дуг, мм.
 */
function Bracket({ top, bottom }: { top: number; bottom: number }) {
  const bend = bottom - top;
  return (
    <path
      d={
        `M104.7 ${top}V${n(bottom - bend * 0.6)}Q104.7 ${bottom} ${n(104.7 + bend)} ${bottom}H113.97` +
        `M120.99 ${bottom}H${n(130.26 - bend)}Q130.26 ${bottom} 130.26 ${n(bottom - bend * 0.6)}V${top}`
      }
      fill="none"
      stroke={LABEL}
      strokeWidth={0.24}
    />
  );
}

/** Надпись панели узким гротеском; `width` — ширина надписи на корпусе. */
function PanelLabel({ x, y, width, text }: { x: number; y: number; width: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={3.1}
      fontWeight={700}
      textAnchor="middle"
      textLength={width}
      lengthAdjust="spacingAndGlyphs"
      fill={LABEL}
      fontFamily={PANEL_FONT}
    >
      {text}
    </text>
  );
}

/**
 * Ручка: чёрная, глянцевая, с коническим верхом.
 *
 * @param pointer рисовать ли белую риску «на 12 часов» — она есть только у
 *   ручки VOLUME.
 */
function Knob({ cx, cy, pointer = false }: { cx: number; cy: number; pointer?: boolean }) {
  return (
    <g>
      <circle cx={cx + 0.25} cy={cy + 0.7} r={KNOB_R + 0.2} fill="#000" opacity={0.75} filter="url(#hx-soft)" />
      <circle cx={cx} cy={cy} r={KNOB_R} fill="url(#hx-knob-skirt)" stroke="#050506" strokeWidth={0.12} />
      <circle cx={cx} cy={cy} r={KNOB_TOP_R} fill="url(#hx-knob-top)" />
      <g transform={`translate(${cx} ${cy})`}>
        {KNOB_SHEEN.map((w, i) => (
          <path key={i} d={w.d} fill="#fff" opacity={w.opacity} />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={KNOB_TOP_R} fill="none" stroke="url(#hx-knob-rim)" strokeWidth={0.22} />
      <circle cx={cx} cy={cy} r={0.55} fill="#2a2a2e" />
      {pointer && <rect x={cx - 0.5} y={cy - 5.76} width={1} height={3.76} rx={0.15} fill="#f2f2f2" />}
    </g>
  );
}

/** Гайка разъёма 1/4": хромированный выступ за краем корпуса. */
function Jack({ x, y, vertical }: { x: number; y: number; vertical: boolean }) {
  const width = vertical ? JACK_DEPTH : JACK_LENGTH;
  const height = vertical ? JACK_LENGTH : JACK_DEPTH;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={0.7}
        fill={vertical ? 'url(#hx-nut-v)' : 'url(#hx-nut-h)'}
        stroke="#3a3a3d"
        strokeWidth={0.15}
      />
      {vertical ? (
        <path
          d={`M${x} ${y + 4.6}H${x + width}M${x} ${y + height - 4.6}H${x + width}`}
          stroke="#55555a"
          strokeWidth={0.18}
          opacity={0.7}
        />
      ) : (
        <path
          d={`M${x + 4.6} ${y}V${y + height}M${x + width - 4.6} ${y}V${y + height}`}
          stroke="#55555a"
          strokeWidth={0.18}
          opacity={0.7}
        />
      )}
    </g>
  );
}

/** Общие градиенты и фильтры изображения: id начинаются с `hx-`. */
export const HxDefs = memo(function HxDefs() {
  const chrome = (
    <>
      <stop offset="0" stopColor="#48484c" />
      <stop offset="0.12" stopColor="#9c9ca0" />
      <stop offset="0.26" stopColor="#5e5e62" />
      <stop offset="0.42" stopColor="#dcdce0" />
      <stop offset="0.56" stopColor="#6c6c70" />
      <stop offset="0.72" stopColor="#b2b2b6" />
      <stop offset="0.87" stopColor="#58585c" />
      <stop offset="1" stopColor="#3a3a3e" />
    </>
  );
  return (
    <defs>
      <linearGradient id="hx-shell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#222226" />
        <stop offset="0.035" stopColor="#161619" />
        <stop offset="0.5" stopColor="#141417" />
        <stop offset="0.93" stopColor="#1c1c21" />
        <stop offset="1" stopColor="#34343a" />
      </linearGradient>
      <linearGradient id="hx-shell-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
        <stop offset="0.027" stopColor="#fff" stopOpacity="0.07" />
        <stop offset="0.03" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.97" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.973" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="hx-face" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor="#141417" />
        <stop offset="0.45" stopColor="#0c0c0f" />
        <stop offset="1" stopColor="#101013" />
      </linearGradient>
      <linearGradient id="hx-step" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#050408" />
        <stop offset="0.32" stopColor="#0b0a0e" />
        <stop offset="0.345" stopColor="#2c2c33" />
        <stop offset="0.42" stopColor="#0f0e13" />
        <stop offset="1" stopColor="#121116" />
      </linearGradient>
      <linearGradient id="hx-fsw-face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#36363c" />
        <stop offset="0.5" stopColor="#2f2f34" />
        <stop offset="1" stopColor="#2b2b30" />
      </linearGradient>
      <linearGradient id="hx-bezel" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#7a7a7d" />
        <stop offset="0.45" stopColor="#4a4a4d" />
        <stop offset="1" stopColor="#18181b" />
      </linearGradient>
      <linearGradient id="hx-glass" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
        <stop offset="0.42" stopColor="#fff" stopOpacity="0.015" />
        <stop offset="0.43" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="hx-button" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3d3e45" />
        <stop offset="0.25" stopColor="#323339" />
        <stop offset="1" stopColor="#2b2c31" />
      </linearGradient>
      <radialGradient id="hx-knob-skirt" cx="0.5" cy="0.45" r="0.55">
        <stop offset="0" stopColor="#26262a" />
        <stop offset="0.85" stopColor="#121215" />
        <stop offset="1" stopColor="#0a0a0c" />
      </radialGradient>
      <radialGradient id="hx-knob-top" cx="0.5" cy="0.5" r="0.5" fx="0.38" fy="0.32">
        <stop offset="0" stopColor="#242428" />
        <stop offset="0.7" stopColor="#161619" />
        <stop offset="1" stopColor="#0f0f11" />
      </radialGradient>
      <linearGradient id="hx-knob-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6a6a70" />
        <stop offset="0.5" stopColor="#1a1a1d" />
        <stop offset="1" stopColor="#000" />
      </linearGradient>
      <linearGradient id="hx-nut-h" x1="0" y1="0" x2="1" y2="0">
        {chrome}
      </linearGradient>
      <linearGradient id="hx-nut-v" x1="0" y1="0" x2="0" y2="1">
        {chrome}
      </linearGradient>
      <radialGradient id="hx-cap" cx="0.5" cy="0.5" r="0.5" fx="0.4" fy="0.36">
        <stop offset="0" stopColor="#d6d3d6" />
        <stop offset="0.5" stopColor="#a8a4a8" />
        <stop offset="0.85" stopColor="#7e7a7e" />
        <stop offset="1" stopColor="#555155" />
      </radialGradient>
      <radialGradient id="hx-ring-off" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.64" stopColor="#4a4a50" />
        <stop offset="0.8" stopColor="#3a3a3e" />
        <stop offset="1" stopColor="#2e2e32" />
      </radialGradient>
      <filter id="hx-sparkle" x="0" y="0" width="178" height="126" filterUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="4.5" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  14 0 0 0 -9.4" />
        <feComposite in2="SourceAlpha" operator="in" />
      </filter>
      <filter id="hx-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="0.45" />
      </filter>
      <filter id="hx-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="1.1" />
      </filter>
      <filter id="hx-bloom" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.6" />
      </filter>
      <clipPath id="hx-shell-clip">
        <path d={SHELL} />
      </clipPath>
    </defs>
  );
});

/**
 * Неизменный корпус HX Stomp: всё, кроме содержимого экрана и LED-колец
 * футсвитчей. Пользуется градиентами и фильтрами {@link HxDefs}, которые
 * должны быть в том же SVG.
 */
export const HxBody = memo(function HxBody() {
  return (
    <g>
      {/* Гайки разъёмов и выключатель питания за краями корпуса */}
      {REAR_JACKS.map((x) => (
        <Jack key={x} x={x} y={0} vertical={false} />
      ))}
      {RIGHT_JACKS.map((y) => (
        <Jack key={y} x={173.99} y={y} vertical />
      ))}
      <Jack x={0} y={89.13} vertical />
      <rect x={20.09} y={0.25} width={3.86} height={4.2} rx={0.4} fill="#2a2a2e" stroke="#46464b" strokeWidth={0.15} />

      {/* Силуэт со скошенной кромкой */}
      <path d={SHELL} fill="url(#hx-shell)" />
      <path d={SHELL} fill="url(#hx-shell-side)" />
      <path d={SHELL} fill="#000" filter="url(#hx-sparkle)" opacity={0.28} />
      <path d={SHELL} fill="none" stroke="#000" strokeWidth={0.25} opacity={0.8} />

      {/* Ступень перед секцией футсвитчей */}
      <g clipPath="url(#hx-shell-clip)">
        <rect x={4.02} y={78.6} width={169.97} height={8.9} fill="url(#hx-step)" />
      </g>
      <line x1={10.78} y1={81.62} x2={167.23} y2={81.62} stroke="#3a3a42" strokeWidth={0.2} opacity={0.8} />

      {/* Верхняя панель */}
      <rect x={8.54} y={8.54} width={160.93} height={70.98} rx={0.25} fill="url(#hx-face)" />
      <rect
        x={8.54}
        y={8.54}
        width={160.93}
        height={70.98}
        rx={0.25}
        fill="#000"
        filter="url(#hx-sparkle)"
        opacity={0.42}
      />
      <rect
        x={8.54}
        y={8.54}
        width={160.93}
        height={70.98}
        rx={0.25}
        fill="none"
        stroke="#3a3a41"
        strokeWidth={0.2}
        opacity={0.9}
      />
      <line x1={10.73} y1={78.98} x2={167.29} y2={78.98} stroke="#000" strokeWidth={0.35} />

      {/* Лицевая грань секции футсвитчей */}
      <rect x={8.5} y={86.69} width={161} height={34.9} rx={6.2} fill="url(#hx-fsw-face)" />
      <rect x={8.5} y={86.69} width={161} height={34.9} rx={6.2} fill="#000" filter="url(#hx-sparkle)" opacity={0.3} />
      <rect x={8.5} y={86.69} width={161} height={34.9} rx={6.2} fill="none" stroke="#45454c" strokeWidth={0.2} />

      {/* Рамка экрана и окно LCD */}
      <rect x={28.23} y={13.35} width={55.56} height={43.32} rx={3.85} fill="url(#hx-bezel)" />
      <rect
        x={28.38}
        y={13.5}
        width={55.26}
        height={43.02}
        rx={3.7}
        fill="none"
        stroke="#6a6a6f"
        strokeWidth={0.2}
        opacity={0.6}
      />
      <rect x={30.84} y={15.96} width={50.35} height={38.11} rx={1.25} fill="#000" stroke="#0a0a0a" strokeWidth={0.3} />

      {/* Ручки под экраном */}
      <Knob cx={31.02} cy={68.01} />
      <Knob cx={56.01} cy={68.01} />
      <Knob cx={81.01} cy={68.01} />

      {/* Плашки кнопок с Upper Knob и Lower Knob */}
      {[15.51, 40.87].map((y) => (
        <g key={y}>
          <rect
            x={96.83}
            y={y + 0.45}
            width={41.26}
            height={13.45}
            rx={0.8}
            fill="#000"
            opacity={0.7}
            filter="url(#hx-soft)"
          />
          <rect
            x={96.63}
            y={y}
            width={41.26}
            height={13.45}
            rx={0.8}
            fill="#1a1a1d"
            stroke="#2e2e33"
            strokeWidth={0.2}
          />
        </g>
      ))}
      {[
        buttonPath(97.2, 15.98, 112.88, 28.49, 'right', 117.26, 22.24),
        buttonPath(121.9, 15.98, 137.31, 28.49, 'left', 117.26, 22.24),
        buttonPath(97.2, 41.34, 112.62, 53.85, 'right', 117.26, 47.59),
        buttonPath(121.9, 41.34, 137.31, 53.85, 'left', 117.26, 47.59),
      ].map((d) => (
        <path key={d} d={d} fill="url(#hx-button)" stroke="#4a4b52" strokeWidth={0.15} />
      ))}
      <Knob cx={117.26} cy={22.24} />
      <Knob cx={117.26} cy={47.59} />

      {/* Надписи кнопок и скобки сочетаний */}
      <path
        d="M101.58 20.05L103.575 18.2L105.57 20.05M102.2 19.45V21.68H104.95V19.45M103.1 21.68V20.55H104.05V21.68"
        fill="none"
        stroke={LABEL}
        strokeWidth={0.3}
        strokeLinejoin="round"
      />
      <PanelLabel x={103.63} y={25.85} width={5.3} text="VIEW" />
      <PanelLabel x={130.41} y={22.67} width={7.95} text="ACTION" />
      <Bracket top={29.03} bottom={31.73} />
      <PanelLabel x={117.42} y={32.75} width={5.3} text="SAVE" />
      <path d="M100.54 46.27L99.25 47.49L100.54 48.71Z" fill={LABEL} />
      <PanelLabel x={104.96} y={48.65} width={5.83} text="PAGE" />
      <PanelLabel x={130.41} y={48.65} width={5.83} text="PAGE" />
      <path d="M134.29 46.27L135.59 47.49L134.29 48.71Z" fill={LABEL} />
      <Bracket top={54.63} bottom={57.33} />
      <path d="M115.79 56.15H119.14M115.79 57.33H119.14M115.79 58.5H119.14" stroke={LABEL} strokeWidth={0.36} />

      {/* VOLUME */}
      <PanelLabel x={152.68} y={22.67} width={9.01} text="VOLUME" />
      <Knob cx={152.78} cy={34.95} pointer />

      {/* Логотипы */}
      <g fill="#c8c8ca">
        {LINE6_LOGO.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="#dedddf">
        {MODEL_LOGO.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </g>
  );
});
