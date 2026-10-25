/**
 * Общие элементы экранов Quad Cortex в пикселях интерфейса 800×480: значки
 * режимов, индикатор сцены, кнопки, ручки и переключатели панелей параметров.
 */

import type { FootswitchMode, Letter, RowMode } from '../../../../core/devices/quadCortex/engine.ts';
import { UI } from '../palette.ts';

const STOMP_PATH =
  'M673.723 63.2008C670.977 65.2508 668.778 66.8924 667.127 68.1255L666.27 68.7656C665.385 69.4269 664.705 69.9358 ' +
  '664.228 70.2924C663.319 70.9726 662.915 71.9041 663.015 73.087L680.055 68.521C679.833 67.0083 680.929 65.2361 ' +
  '683.255 63.1766C682.988 62.8037 682.691 62.4115 682.363 62C680.639 64.0488 678.862 65.2219 677.031 65.5192C675.2 ' +
  '65.8165 674.097 65.0437 673.723 63.2008ZM681.102 68.2407L685.01 67.1933C685.096 66.4398 684.701 65.3799 683.825 ' +
  '64.0139C681.899 65.7499 681.016 67.1667 681.102 68.2407ZM685.559 69.3468L663.619 75.2257C663.399 74.7294 663.237 ' +
  '74.2624 663.135 73.8246L663.201 74.0724L685.243 68.1663L685.559 69.3468ZM667.966 76.3084L671.966 75.2257' +
  'V78.675L674.966 ' +
  '78.675V82.675H664.966V78.675L667.966 78.675V76.3084Z';

/**
 * Значок режима ряда футсвитчей 24×24: PRESET — мини-сетка блоков, SCENE —
 * квадраты A B / C D, STOMP — ботинок на педали.
 *
 * @param x левый край, px.
 * @param y верхний край, px.
 * @param color цвет значка.
 * @param background цвет под значком: им вырезаны буквы значка SCENE.
 */
export function ModeIcon({
  mode,
  x,
  y,
  color = UI.white,
  background = UI.black,
}: {
  mode: RowMode;
  x: number;
  y: number;
  color?: string;
  background?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} fill={color}>
      {mode === 'PRESET' && (
        <>
          {[0, 9, 18].map((sx) => (
            <rect key={`a${sx}`} x={sx} y="0" width="6" height="6" rx="1" />
          ))}
          <rect x="0" y="2" width="24" height="2" />
          <path d="M2 5 H4 V9 Q4 11 6 11 H24 V13 H6 Q2 13 2 9 Z" />
          {[9, 18].map((sx) => (
            <rect key={`b${sx}`} x={sx} y="9" width="6" height="6" rx="1" />
          ))}
          {[0, 9, 18].map((sx) => (
            <rect key={`c${sx}`} x={sx} y="18" width="6" height="6" rx="1" />
          ))}
          <rect x="0" y="20" width="24" height="2" />
        </>
      )}
      {mode === 'SCENE' &&
        (['A', 'B', 'C', 'D'] as const).map((letter, i) => {
          const sx = (i % 2) * 13;
          const sy = Math.floor(i / 2) * 13;
          return (
            <g key={letter}>
              <rect x={sx} y={sy} width="11" height="11" rx="1" />
              <text x={sx + 5.5} y={sy + 9} fontSize="10" fontWeight="700" textAnchor="middle" fill={background}>
                {letter}
              </text>
            </g>
          );
        })}
      {mode === 'STOMP' && <path d={STOMP_PATH} transform="translate(-662 -60.5)" fillRule="evenodd" />}
    </g>
  );
}

/**
 * Значок режима футсвитчей: у HYBRID — значки режимов рядов A–D и E–H через
 * серый «+». Ширина — {@link modeIconsWidth}.
 *
 * @param x левый край, px.
 * @param y верхний край значков, px.
 * @param background цвет под значками: им вырезаны буквы значка SCENE.
 */
export function ModeIcons({
  mode,
  x,
  y,
  background,
}: {
  mode: FootswitchMode;
  x: number;
  y: number;
  background: string;
}) {
  if (mode.name !== 'HYBRID') {
    return <ModeIcon mode={mode.name} x={x} y={y} background={background} />;
  }
  return (
    <g>
      <ModeIcon mode={mode.rows[0]} x={x} y={y} background={background} />
      <path d={`M${x + 36} ${y + 4} V${y + 20} M${x + 28} ${y + 12} H${x + 44}`} stroke="#8A8A8A" strokeWidth="2" />
      <ModeIcon mode={mode.rows[1]} x={x + 49} y={y} background={background} />
    </g>
  );
}

/** Ширина значков режима {@link ModeIcons}, px. */
export function modeIconsWidth(mode: FootswitchMode): number {
  return mode.name === 'HYBRID' ? 73 : 24;
}

/**
 * Индикатор текущей сцены 24×24: буква на жёлтой плашке; неизвестная сцена —
 * прочерк на серой.
 *
 * @param x левый край, px.
 * @param y верхний край, px.
 */
export function ScenePlate({ scene, x, y }: { scene: Letter | null; x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="24" height="24" rx="4" fill={scene === null ? UI.sceneUnknown : '#FFD236'} />
      <text x={x + 12} y={y + 20} fontSize="22" fontWeight="700" textAnchor="middle" fill="#000">
        {scene ?? '–'}
      </text>
    </g>
  );
}

/** Кнопка ✓ 98×44 в правом верхнем углу меню и Gig View. */
export function CheckButton() {
  return (
    <g>
      <rect x="694" y="8" width="98" height="44" rx="8" fill={UI.panel} />
      <path
        d="M736.5 30.5 L741 35 L750 25.5"
        fill="none"
        stroke={UI.white}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Значки Undo, Save и контекстного меню ⋮ в шапке The Grid. */
export function GridHeaderIcons() {
  return (
    <g fill="none" stroke={UI.white} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M611.5 24.5 A9.8 9.8 0 1 0 617.5 15.5" />
      <path d="M612.5 11.8 L617.8 15.6 L613.6 20.6" />
      <path d="M714 33 H706.2 Q705 33 705 31.8 V14.2 Q705 13 706.2 13 H721 L723.5 15.5 V21.5" />
      <rect x="708.5" y="16.5" width="9.5" height="4.5" rx="0.8" fill={UI.white} strokeWidth="1" />
      <path d="M714.5 29 H726 M721 24 L726 29 L721 34" />
      <g fill={UI.white} stroke="none">
        <circle cx="766" cy="15" r="2" />
        <circle cx="766" cy="23" r="2" />
        <circle cx="766" cy="31" r="2" />
      </g>
    </g>
  );
}

/**
 * Панель параметров на всю ширину экрана, разделённая на пять колонок —
 * по футсвитчам ряда: A–D и BANK DOWN или E–H и TEMPO.
 *
 * @param y верхний край, px.
 * @param height высота, px.
 */
export function ParamPanel({ y, height }: { y: number; height: number }) {
  return (
    <g>
      <rect x="8" y={y} width="784" height={height} rx="6" fill={UI.panel} />
      {[1, 2, 3, 4].map((i) => (
        <rect key={i} x={8 + i * 156.8 - 1} y={y + 10} width="2" height={height - 20} fill={UI.surface} />
      ))}
    </g>
  );
}

/** Левый край колонки `index` (0–4) панели {@link ParamPanel}, px. */
export function columnX(index: number): number {
  return 8 + index * 156.8;
}

/**
 * Ручка параметра: тёмный диск с указателем. Без значения указатель стоит
 * вертикально и показывает только вид ручки.
 *
 * @param cx центр, px.
 * @param cy центр, px.
 */
export function Knob({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="24" fill="#000" />
      <circle cx={cx} cy={cy} r="20" fill="#1A1A1A" stroke="#3A3A3A" strokeWidth="1" />
      <path d={`M${cx} ${cy - 18} V${cy - 7}`} stroke={UI.white} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/**
 * Переключатель из двух вариантов: вертикальная дорожка с зелёным кольцом у
 * выбранного варианта и подписи вариантов справа.
 *
 * @param x левый край дорожки, px.
 * @param y верхний край дорожки, px.
 * @param selected 0 — верхний вариант, 1 — нижний, null — значение неизвестно (кольца нет, подписи серые).
 */
export function Toggle({
  x,
  y,
  options,
  selected,
}: {
  x: number;
  y: number;
  options: readonly [string, string];
  selected: 0 | 1 | null;
}) {
  return (
    <g>
      <rect x={x} y={y} width="22" height="46" rx="11" fill="#141414" />
      {selected !== null && (
        <circle cx={x + 11} cy={y + 11 + selected * 24} r="8" fill="none" stroke={UI.accent} strokeWidth="3" />
      )}
      {options.map((option, i) => (
        <text key={option} x={x + 36} y={y + 17 + i * 24} fontSize="17" fill={selected === i ? UI.white : UI.faint}>
          {option}
        </text>
      ))}
    </g>
  );
}

/**
 * Выпадающий список: чёрное поле со значением и стрелкой ▼.
 *
 * @param x левый край, px.
 * @param y верхний край, px.
 * @param value подпись значения; неизвестное значение — «—».
 */
export function Dropdown({ x, y, width, value }: { x: number; y: number; width: number; value: string }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height="37" rx="4" fill="#000" />
      <text x={x + 10} y={y + 25} fontSize="17" fill={UI.white}>
        {value}
      </text>
      <path d={`M${x + width - 24} ${y + 15} h12 l-6 8 z`} fill={UI.white} />
    </g>
  );
}

/**
 * Подпись колонки панели параметров: название сверху и значение снизу.
 *
 * @param column номер колонки 0–4.
 * @param top верхний край панели, px.
 * @param value значение под названием; null — без значения.
 */
export function ParamCaption({
  column,
  top,
  title,
  value,
}: {
  column: number;
  top: number;
  title: string;
  value?: string | null;
}) {
  const x = columnX(column) + 12;
  return (
    <g>
      <text x={x} y={top + 25} fontSize="16" fill={UI.white}>
        {title}
      </text>
      {value != null && (
        <text x={x} y={top + 88} fontSize="17" fill={value === '—' ? UI.muted : UI.white}>
          {value}
        </text>
      )}
    </g>
  );
}
