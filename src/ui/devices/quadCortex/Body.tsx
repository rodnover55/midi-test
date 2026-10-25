/**
 * Корпус Quad Cortex в миллиметрах (вид сверху, `viewBox="0 0 290 195"`):
 * панель, стекло экрана, ручка VOLUME, кнопка питания, надписи, футсвитчи и
 * светодиоды. Координаты — по векторному чертежу «Hardware Dimensions»
 * руководства Quad Cortex 4.1.1.
 */

import { memo } from 'react';
import type { LedLight } from './leds.ts';
import { dimLensColor, LED_BEZEL } from './leds.ts';

/** Центры футсвитчей по горизонтали, мм: A/E, B/F, C/G, D/H, BANK DOWN/TEMPO. */
export const COLUMN_X = [17, 81, 145, 209, 273] as const;

/** Центры футсвитчей верхнего (A–D, BANK DOWN) и нижнего (E–H, TEMPO) рядов по вертикали, мм. */
export const ROW_Y = [137.51, 183.3] as const;

/** Центры светодиодов верхнего и нижнего рядов по вертикали, мм. */
export const LED_ROW_Y = [125.63, 171.43] as const;

/** Центр футсвитча BANK UP, мм. */
export const BANK_UP = { x: 273, y: 65, ledY: 53 } as const;

/** Окно интерфейса 800×480 на стекле экрана, мм. */
export const SCREEN_WINDOW = { x: 67.56, y: 22.64, width: 154.87, height: 86.72 } as const;

const CONNECTORS = [
  [45.52, 11.64],
  [158.23, 11.64],
  [175.96, 11.64],
  [193.16, 11.64],
  [210.88, 11.64],
  [225.7, 24.08],
  [252.42, 24.08],
] as const;

const LETTERS_TOP = [
  ['A', 29.77],
  ['B', 93.84],
  ['C', 157.83],
  ['D', 221.86],
] as const;

const LETTERS_BOTTOM = [
  ['E', 29.84],
  ['F', 93.84],
  ['G', 157.97],
  ['H', 221.85],
] as const;

const NUT = '8.08,0 4.04,7 -4.04,7 -8.08,0 -4.04,-7 4.04,-7';

const NUT_FACE = '6.7,0 3.35,5.8 -3.35,5.8 -6.7,0 -3.35,-5.8 3.35,-5.8';

/**
 * Перевод координат векторного чертежа «Hardware Dimensions» (пиксели при
 * 96 dpi) в миллиметры корпуса — для путей, взятых с чертежа как есть.
 */
const DRAWING_TO_MM = 'translate(-0.1217 1.1635) scale(0.2645833)';

/**
 * Знак Neural DSP («кардиограмма») перед надписью QUADCORTEX в координатах
 * чертежа «Hardware Dimensions»; в миллиметрах — 3,10 × 4,00 с левым верхним
 * углом (241,43; 24,09).
 */
const NEURAL_DSP_MARK =
  'M924.42 93.1992L920.655 93.0325C920.387 93.0325 920.159 93.2219 920.102 93.4912L919.394 97.4405' +
  'C919.388 97.4765 919.356 97.5032 919.32 97.5032C919.283 97.5019 919.251 97.4752 919.246 97.4379' +
  'L917.778 87.0885C917.739 86.8472 917.548 86.6712 917.268 86.6712H917.263' +
  'C917.03 86.6899 916.843 86.8659 916.81 87.0952L915.927 93.1525' +
  'C915.886 93.1379 915.84 93.1339 915.772 93.1272L913.222 93.1992' +
  'C913.072 93.2032 912.951 93.3259 912.954 93.4752L912.956 93.7379' +
  'C912.966 93.8805 913.084 93.9925 913.227 93.9939L915.439 94.0659L915.876 95.2525' +
  'C915.936 95.4139 916.083 95.5232 916.359 95.5232C916.379 95.5232 916.398 95.5219 916.419 95.5205' +
  'C916.582 95.4712 916.7 95.3272 916.723 95.1552L917.218 91.2165' +
  'C917.223 91.1779 917.255 91.1499 917.292 91.1499C917.331 91.1499 917.363 91.1779 917.368 91.2152' +
  'L918.671 101.29C918.71 101.569 918.94 101.771 919.218 101.771L919.284 101.767' +
  'C919.52 101.738 919.711 101.561 919.759 101.327L919.786 101.191' +
  'C919.915 100.562 920.115 99.5059 920.367 98.1192L921.143 94.1432L924.422 93.9939' +
  'C924.567 93.9872 924.682 93.8672 924.682 93.7205V93.4725' +
  'C924.682 93.3245 924.567 93.2045 924.42 93.1992Z';

/** Белый шелкографии: мелкий текст на корпусе. */
const PRINT = '#ECECEE';

/**
 * Определения градиентов, фильтров и обрезки для корпуса и светодиодов.
 *
 * @param p префикс идентификаторов, уникальный в документе; остальные части
 *   корпуса ссылаются на определения через тот же префикс.
 */
export function BodyDefs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}-bevel-x`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#F4F3F6" />
        <stop offset="0.004" stopColor="#B9B8BC" />
        <stop offset="0.03" stopColor="#3A393E" />
        <stop offset="0.97" stopColor="#3A393E" />
        <stop offset="0.996" stopColor="#A5A5A8" />
        <stop offset="1" stopColor="#BDBDC1" />
      </linearGradient>
      <linearGradient id={`${p}-bevel-y`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#050407" stopOpacity="1" />
        <stop offset="0.006" stopColor="#050407" stopOpacity="0.9" />
        <stop offset="0.03" stopColor="#050407" stopOpacity="0" />
        <stop offset="0.97" stopColor="#2A292E" stopOpacity="0" />
        <stop offset="0.993" stopColor="#2A292E" stopOpacity="0.95" />
        <stop offset="1" stopColor="#020204" stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${p}-band`} x1="0" y1="120.72" x2="0" y2="125.22" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#403E43" />
        <stop offset="1" stopColor="#2D2C31" />
      </linearGradient>
      <radialGradient id={`${p}-light`} cx="145" cy="40" r="190" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.03" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-steel`} cx="0.42" cy="0.36" r="0.7">
        <stop offset="0" stopColor="#48474C" />
        <stop offset="0.55" stopColor="#1A191D" />
        <stop offset="1" stopColor="#0B0B0E" />
      </radialGradient>
      <linearGradient id={`${p}-rim`} x1="0" y1="0.2" x2="1" y2="0.8">
        <stop offset="0" stopColor="#F2F1F4" />
        <stop offset="0.25" stopColor="#5A595E" />
        <stop offset="0.6" stopColor="#202024" />
        <stop offset="0.88" stopColor="#8A898E" />
        <stop offset="1" stopColor="#D6D5D9" />
      </linearGradient>
      <linearGradient id={`${p}-nut`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#A3A2A7" />
        <stop offset="0.5" stopColor="#6A696E" />
        <stop offset="1" stopColor="#3E3D42" />
      </linearGradient>
      <linearGradient id={`${p}-nut-edge`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F6F5F8" />
        <stop offset="0.5" stopColor="#A9A8AD" />
        <stop offset="1" stopColor="#5E5D62" />
      </linearGradient>
      <linearGradient id={`${p}-chamfer`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#66646A" />
        <stop offset="0.012" stopColor="#363439" />
        <stop offset="0.988" stopColor="#363439" />
        <stop offset="1" stopColor="#88868B" />
      </linearGradient>
      <radialGradient id={`${p}-knob`} cx="0.42" cy="0.36" r="0.75">
        <stop offset="0" stopColor="#48464B" />
        <stop offset="1" stopColor="#3E3C41" />
      </radialGradient>
      <linearGradient id={`${p}-knob-bevel`} x1="0" y1="0.3" x2="1" y2="0.7">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.3" stopColor="#B9B8BC" />
        <stop offset="0.55" stopColor="#7D7D81" />
        <stop offset="0.8" stopColor="#B4B3B8" />
        <stop offset="1" stopColor="#E9E8EC" />
      </linearGradient>
      <radialGradient id={`${p}-lens`} cx="0.42" cy="0.38" r="0.65">
        <stop offset="0" stopColor="#B5B4B8" />
        <stop offset="1" stopColor="#8D8C91" />
      </radialGradient>
      <linearGradient id={`${p}-glare`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.07" />
        <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <filter id={`${p}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.8" />
      </filter>
      <filter id={`${p}-glow`} x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="1.25" />
      </filter>
      <filter id={`${p}-soft`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.35" />
      </filter>
      <clipPath id={`${p}-face`}>
        <rect x="1.2" y="6.2" width="287.59" height="187.86" rx="8.8" />
      </clipPath>
    </defs>
  );
}

/**
 * Неподвижные части корпуса: разъёмы сзади, панель, стекло экрана, кнопка
 * питания, ручка VOLUME, плашка QUADCORTEX, надписи и футсвитчи без
 * светодиодов. Экран и светодиоды рисуются поверх отдельно.
 *
 * @param p префикс идентификаторов из {@link BodyDefs}.
 */
export const Body = memo(function Body({ p }: { p: string }) {
  return (
    <g>
      <g fill="#1A191E">
        {CONNECTORS.map(([x, width]) => (
          <rect key={x} x={x} y="1.3" width={width} height="4.4" rx="0.6" />
        ))}
      </g>
      <rect x="0" y="5" width="290" height="190" rx="10" fill={`url(#${p}-bevel-x)`} />
      <rect x="0" y="5" width="290" height="190" rx="10" fill={`url(#${p}-bevel-y)`} />
      <g clipPath={`url(#${p}-face)`}>
        <rect x="0" y="0" width="290" height="120.72" fill="#403E43" />
        <rect x="0" y="120.72" width="290" height="4.5" fill={`url(#${p}-band)`} />
        <rect x="0" y="125.22" width="290" height="70" fill="#2D2C31" />
        <rect x="0" y="0" width="290" height="195" fill={`url(#${p}-light)`} />
      </g>
      <rect
        x="1.2"
        y="6.2"
        width="287.59"
        height="187.86"
        rx="8.8"
        fill="none"
        stroke="#6E6D72"
        strokeWidth="0.3"
        opacity="0.7"
      />
      <rect x="65.66" y="20.74" width="158.67" height="90.52" rx="1.6" fill={`url(#${p}-chamfer)`} />
      <rect x="66.76" y="21.84" width="156.47" height="88.32" rx="0.8" fill="#000" />
      <PowerButton />
      <VolumeKnob p={p} />
      <Logo />
      <Markings />
      <g>
        <Footswitch p={p} x={BANK_UP.x} y={BANK_UP.y} />
        {ROW_Y.flatMap((y) => COLUMN_X.map((x) => <Footswitch key={`${x}-${y}`} p={p} x={x} y={y} />))}
      </g>
    </g>
  );
});

/** Блик на стекле экрана поверх изображения интерфейса. */
export function Glare({ p }: { p: string }) {
  const { x, y, width, height } = SCREEN_WINDOW;
  return <rect x={x} y={y} width={width} height={height} fill={`url(#${p}-glare)`} pointerEvents="none" />;
}

/**
 * Светодиод над футсвитчем: линза в тёмном ободке. Горящий светит цветом с
 * белым центром и ореолом, тусклый — линзой цвета свечения на 30 % яркости
 * без ореола (см. `dimLensColor`), негорящий — матовой светло-серой линзой.
 *
 * @param p префикс идентификаторов из {@link BodyDefs}.
 * @param x центр, мм.
 * @param y центр, мм.
 */
export function Led({ p, x, y, light }: { p: string; x: number; y: number; light: LedLight }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {light.level === 'on' && <circle r="3.6" fill={light.color} opacity="0.9" filter={`url(#${p}-glow)`} />}
      <circle r="2.55" fill={LED_BEZEL} />
      {light.level === 'off' && <circle r="1.98" fill={`url(#${p}-lens)`} />}
      {light.level === 'dim' && <circle r="1.98" fill={dimLensColor(light.color)} />}
      {light.level === 'on' && (
        <>
          <circle r="1.98" fill={light.color} />
          <circle r="1.35" fill="#FFFFFF" opacity="0.7" filter={`url(#${p}-soft)`} />
          <circle cx="-0.4" cy="-0.45" r="0.6" fill="#FFFFFF" opacity="0.9" />
        </>
      )}
      <circle r="2.25" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="0.25" />
    </g>
  );
}

function Footswitch({ p, x, y }: { p: string; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0.5" cy="1.3" rx="8.4" ry="7.9" fill="#000" opacity="0.5" filter={`url(#${p}-blur)`} />
      <polygon
        points={NUT}
        fill={`url(#${p}-nut)`}
        stroke={`url(#${p}-nut-edge)`}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <polygon points={NUT_FACE} fill="none" stroke="#C9C8CC" strokeOpacity="0.4" strokeWidth="0.2" />
      <circle r="6.55" fill="#0E0D11" opacity="0.7" />
      <circle r="6" fill={`url(#${p}-steel)`} />
      <circle r="5.15" fill="none" stroke="#3E3D42" strokeWidth="1.1" strokeDasharray="0.3 0.3" />
      <circle r="4.5" fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="0.25" />
      <circle r="5.9" fill="none" stroke={`url(#${p}-rim)`} strokeWidth="0.45" />
      <ellipse cx="-2" cy="-2.3" rx="1.7" ry="0.8" transform="rotate(-38 -2 -2.3)" fill="#FFFFFF" opacity="0.16" />
    </g>
  );
}

function PowerButton() {
  return (
    <g>
      <rect x="25.56" y="22.6" width="9" height="9" rx="2.56" fill="none" stroke="#56555A" strokeWidth="0.25" />
      <rect x="25.56" y="22.3" width="9" height="9" rx="2.56" fill="#403E43" stroke="#151418" strokeWidth="0.3" />
      <g fill="none" stroke="#A3A2A6" strokeWidth="0.3" strokeLinecap="round">
        <path d="M28.95 25.0 A2.45 2.45 0 1 0 31.17 25.0" />
        <path d="M30.06 24.1 V26.75" />
      </g>
    </g>
  );
}

function VolumeKnob({ p }: { p: string }) {
  return (
    <g>
      <circle cx="30.4" cy="62.2" r="16.6" fill="#000" opacity="0.45" filter={`url(#${p}-blur)`} />
      <circle cx="30" cy="61" r="16.25" fill="#050508" />
      <circle cx="30" cy="61" r="15.6" fill="#2A292E" />
      <circle cx="30" cy="61" r="15.2" fill={`url(#${p}-knob-bevel)`} />
      <circle cx="30" cy="61" r="14.6" fill="#252429" />
      <circle cx="30" cy="61" r="14.4" fill={`url(#${p}-knob)`} />
      <path d="M30 46.25 V50.95" stroke="#050508" strokeWidth="0.45" strokeLinecap="round" />
    </g>
  );
}

function Logo() {
  return (
    <g>
      <rect x="239.35" y="22.6" width="34.54" height="7.23" rx="1.5" fill="none" stroke="#4A494E" strokeWidth="0.25" />
      <rect
        x="239.35"
        y="22.3"
        width="34.54"
        height="7.23"
        rx="1.5"
        fill="#403E43"
        stroke="#1D1C1F"
        strokeWidth="0.3"
      />
      <path d={NEURAL_DSP_MARK} transform={DRAWING_TO_MM} fill={PRINT} />
      <text
        x="245.96"
        y="27.33"
        fontSize="3.68"
        fontWeight="500"
        fill={PRINT}
        textLength="25.4"
        lengthAdjust="spacingAndGlyphs"
      >
        QUADCORTEX
      </text>
    </g>
  );
}

function Markings() {
  return (
    <g>
      <g fill={PRINT} fontWeight="500">
        <text x="29.84" y="86.96" fontSize="2.87" textAnchor="middle" textLength="11.9" lengthAdjust="spacingAndGlyphs">
          VOLUME
        </text>
        <text x="272.75" y="159.25" fontSize="2.88" textAnchor="middle" textLength="10" lengthAdjust="spacingAndGlyphs">
          TEMPO
        </text>
        <text
          x="273.03"
          y="163.16"
          fontSize="2.55"
          textAnchor="middle"
          textLength="16.7"
          lengthAdjust="spacingAndGlyphs"
        >
          HOLD: TUNER
        </text>
        <text x="249.3" y="161.3" fontSize="2.82" textLength="8.15" lengthAdjust="spacingAndGlyphs">
          MODE
        </text>
      </g>
      <g fill="none" stroke={PRINT} strokeWidth="0.35">
        <polyline points="271.33,46.10 273.03,44.03 274.73,46.10" />
        <polyline points="271.27,116.19 272.98,118.25 274.68,116.19" />
      </g>
      <g fill="none" stroke={PRINT} strokeWidth="0.25">
        <path d="M257.85 137.6 H252.91 A2.94 2.94 0 0 0 249.97 140.54 V154.6" />
        <path d="M249.97 166.0 V180.36 A2.94 2.94 0 0 0 252.91 183.3 H257.85" />
        <path d="M249.31 156.96 H250.63 M249.97 156.27 V157.64 M249.31 163.65 H250.63 M249.97 162.96 V164.33" />
      </g>
      <g fontWeight="300" fontSize="10.59" fill="#FFFFFF">
        {LETTERS_TOP.map(([letter, x]) => (
          <text key={letter} x={x} y="141.21">
            {letter}
          </text>
        ))}
        {LETTERS_BOTTOM.map(([letter, x]) => (
          <text key={letter} x={x} y="187.31">
            {letter}
          </text>
        ))}
      </g>
    </g>
  );
}
