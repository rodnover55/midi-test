/**
 * Значки экрана HX Stomp в координатах экрана 320 × 240 px: камера снапшота,
 * футсвитч с кольцом, шевроны, указатели банка, камертон Tuner,
 * предупреждение All Bypass.
 */

import type { IconRing } from './look.ts';
import { SCREEN } from './look.ts';
import { WEIGHT } from './text.tsx';

/** Ширина значка камеры, px. */
export const CAMERA_WIDTH = 56.9;

/** Центр объектива камеры по горизонтали от левого края значка, px. */
const LENS_X = 32.35;

/** Контур корпуса камеры с выступом над объективом в рамке 56.9 × 35.9 px. */
const CAMERA_BODY =
  'M3.6 5.2H19.6L23.6 0.6Q24.1 0 24.8 0H39.9Q40.6 0 41.1 0.6L45.1 5.2H53.3A3.6 3.6 0 0 1 56.9 8.8V32.3' +
  'A3.6 3.6 0 0 1 53.3 35.9H3.6A3.6 3.6 0 0 1 0 32.3V8.8A3.6 3.6 0 0 1 3.6 5.2Z';

/** Свойства значка камеры. */
export interface CameraProps {
  /** Левый край значка. */
  x: number;
  /** Верх значка. */
  y: number;
  /** Цвет обводки и «вспышки». */
  stroke: string;
  strokeWidth: number;
  /** Надпись в объективе: номер снапшота или прочерк. */
  label: string;
  labelColor: string;
  labelSize: number;
  /** Базовая линия надписи. */
  labelBaseline: number;
  /** Залит ли объектив белым: так отмечен выбранный снапшот в режиме Snapshot. */
  filled?: boolean;
}

/** Значок камеры с номером снапшота в объективе. */
export function Camera(props: CameraProps) {
  const { x, y, stroke, strokeWidth, label, labelColor, labelSize, labelBaseline, filled } = props;
  return (
    <g>
      <g transform={`translate(${x} ${y})`}>
        <path d={CAMERA_BODY} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        <rect x={4} y={2.4} width={6.2} height={2.6} fill={stroke} />
        <circle
          cx={LENS_X}
          cy={19.15}
          r={16.75}
          fill={filled ? SCREEN.text : 'none'}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
      <text
        x={x + LENS_X}
        y={labelBaseline}
        fontSize={labelSize}
        fontWeight={WEIGHT.bold}
        fill={labelColor}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

const ICON_LINE = SCREEN.secondary;

/** Кольцо значка футсвитча: наружный и внутренний эллипсы. */
function ringPath(cx: number): string {
  const outer = { rx: 24, ry: 12.85, cy: 218.9 };
  const inner = { rx: 14.6, ry: 7, cy: 215.6 };
  const ellipse = (e: { rx: number; ry: number; cy: number }) =>
    `M${cx - e.rx} ${e.cy}a${e.rx} ${e.ry} 0 1 0 ${2 * e.rx} 0a${e.rx} ${e.ry} 0 1 0 ${-2 * e.rx} 0Z`;
  return ellipse(outer) + ellipse(inner);
}

/**
 * Значок футсвитча в нижней половине Play view: «цилиндр» на кольце цвета
 * `ring`.
 *
 * @param cx центр значка по горизонтали.
 */
export function SwitchIcon({ cx, ring }: { cx: number; ring: IconRing }) {
  return (
    <g>
      <path d={ringPath(cx)} fill={ring.fill ?? 'none'} fillRule="evenodd" stroke={ring.stroke} strokeWidth={1.58} />
      <path
        d={`M${cx - 11.05} 206.6V209.1A11.05 4.5 0 0 0 ${cx + 11.05} 209.1V206.6`}
        fill="#000"
        stroke={ICON_LINE}
        strokeWidth={1.58}
      />
      <path
        d={`M${cx - 13.55} 192.8V202.8A13.55 6.6 0 0 0 ${cx + 13.55} 202.8V192.8`}
        fill="#000"
        stroke={ICON_LINE}
        strokeWidth={1.58}
      />
      <ellipse cx={cx} cy={192.8} rx={13.55} ry={6.5} fill="#000" stroke={ICON_LINE} strokeWidth={0.96} />
      <path
        d={`M${cx - 13.55} 192.8A13.55 6.5 0 0 1 ${cx + 13.55} 192.8`}
        fill="none"
        stroke={ICON_LINE}
        strokeWidth={1.58}
      />
    </g>
  );
}

/**
 * Залитый шеврон 22.4 × 12.5 px: `down` — «∨», `up` — «∧».
 *
 * @param x левый край.
 * @param y верх.
 */
export function Chevron({ x, y, direction }: { x: number; y: number; direction: 'down' | 'up' }) {
  const points =
    direction === 'down'
      ? '0,0 11.2,9.3 22.4,0 22.4,3.2 11.2,12.5 0,3.2'
      : '0,12.5 11.2,3.2 22.4,12.5 22.4,9.3 11.2,0 0,9.3';
  return <polygon points={points} transform={`translate(${x} ${y})`} fill={SCREEN.text} />;
}

/**
 * Указатели банка между значками футсвитчей в режимах Preset и Snapshot:
 * «∨» между FS1 и FS2 (предыдущий банк), «∧» между FS2 и FS3 (следующий).
 */
export function BankPointers() {
  return (
    <g>
      <path
        d="M72.4 197.2H88.9M123.8 197.2H140.2M179.3 197.2H195.8M230.7 197.2H247.1"
        stroke={SCREEN.text}
        strokeWidth={1.14}
      />
      <Chevron x={95.2} y={191.1} direction="down" />
      <Chevron x={202} y={191.1} direction="up" />
    </g>
  );
}

/** Значок камертона экрана Tuner 22 × 22 px; `x`, `y` — левый верхний угол. */
export function TuningFork({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M1.5 20.5L8.6 13.4M7 11.8L16.6 2.2M10.2 15L19.8 5.4M7 11.8Q6.2 14.2 8.6 13.4Q11 12.6 10.2 15"
      fill="none"
      stroke={SCREEN.secondary}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Жёлтый предупреждающий треугольник 46 × 40 px; `x`, `y` — левый верхний угол. */
export function WarningSign({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={SCREEN.warning} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 1.5L44.5 38.5H1.5Z" fill="none" strokeWidth={2.6} />
      <path d="M23 13V26" strokeWidth={3.2} />
      <circle cx={23} cy={32.2} r={0.6} fill={SCREEN.warning} strokeWidth={3.2} />
    </g>
  );
}
