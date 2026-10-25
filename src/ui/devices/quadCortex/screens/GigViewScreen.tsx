/**
 * Gig View — раскладка футсвитчей A–H на весь экран: плитки пресетов, сцен
 * или стомпов по режиму каждого ряда.
 */

import type {
  FootswitchState,
  QuadCortexSettings,
  QuadCortexState,
} from '../../../../core/devices/quadCortex/engine.ts';
import { mix, SCENE_COLOR, shade, SLOT_COLORS, UI } from '../palette.ts';
import { CheckButton, ModeIcons, modeIconsWidth, ScenePlate } from './parts.tsx';

/** Цвет значков и буквы на неактивной плитке сцены. */
const SCENE_ICON_GREY = '#808C88';

/** Цвет буквы и значка ✎ на плитке стомпа без известного блока. */
const STOMP_GREY = '#808880';

/**
 * Экран Gig View. Имена пресетов, сцен и блоков по MIDI неизвестны и
 * заменены прочерками; цвета сцен неизвестны — у всех цвет индикатора сцены;
 * блоки стомпов неизвестны — пустые плашки значков, а переключённый с
 * загрузки пресета стомп помечен меткой TOGGLED. Полоса LIVE TUNER — пустая
 * дорожка: высоту звука приложение не знает.
 */
export function GigViewScreen({ state, settings }: { state: QuadCortexState; settings: QuadCortexSettings }) {
  const mode = state.mode;
  const hybrid = mode?.name === 'HYBRID';
  const buttonX = hybrid ? 536 : 568;
  const buttonWidth = hybrid ? 98 : 66;
  const label = state.preset.label;
  return (
    <g>
      <rect width="800" height="480" fill={UI.background} />
      <text x="17" y="41" fontSize="32" fill={UI.white}>
        {label === null ? <tspan fill={UI.faint}>—</tspan> : `${label} `}
        {label !== null && <tspan fill={UI.faint}>—</tspan>}
      </text>
      <rect x={buttonX} y="8" width={buttonWidth} height="44" rx="8" fill={UI.surface} />
      {mode !== null && (
        <ModeIcons
          mode={mode}
          x={buttonX + (buttonWidth - modeIconsWidth(mode)) / 2}
          y={18}
          background={UI.surface}
        />
      )}
      <rect x="642" y="19" width="2" height="22" fill={UI.surface} />
      <rect x="684" y="19" width="2" height="22" fill={UI.surface} />
      <ScenePlate scene={state.scene} x={652} y={18} />
      <CheckButton />
      {settings.liveTuner && <rect x="8" y="60" width="784" height="8" rx="4" fill={UI.surface} />}
      {state.footswitches.map((fs, i) => (
        <Tile key={fs.letter} fs={fs} x={8 + (i % 4) * 198} y={76 + Math.floor(i / 4) * 202} />
      ))}
    </g>
  );
}

function Tile({ fs, x, y }: { fs: FootswitchState; x: number; y: number }) {
  switch (fs.role) {
    case 'preset':
      return <PresetTile fs={fs} x={x} y={y} />;
    case 'scene':
      return <SceneTile fs={fs} x={x} y={y} />;
    case 'stomp':
      return <StompTile fs={fs} x={x} y={y} />;
    default:
      return (
        <g>
          <rect x={x} y={y} width="190" height="194" rx="6" fill={UI.surface} />
          <text x={x + 145} y={y + 44} fontSize="40" fill={STOMP_GREY}>
            {fs.letter}
          </text>
          <text x={x + 18} y={y + 176} fontSize="32" fontWeight="700" fill={UI.muted}>
            —
          </text>
        </g>
      );
  }
}

/** Плитка пресета: загруженный пресет залит цветом слота, у остальных буква слота цветная. */
function PresetTile({ fs, x, y }: { fs: FootswitchState; x: number; y: number }) {
  const active = fs.active === true;
  const slot = fs.label?.at(-1) as keyof typeof SLOT_COLORS | undefined;
  const color = slot !== undefined && slot in SLOT_COLORS ? SLOT_COLORS[slot] : SLOT_COLORS[fs.letter];
  const ink = active ? '#000' : UI.white;
  return (
    <g>
      <rect x={x} y={y} width="190" height="194" rx="6" fill={active ? color : UI.surface} />
      {fs.label === null ? (
        <text x={x + 18} y={y + 40} fontSize="40" fill={UI.faint}>
          —
        </text>
      ) : (
        <>
          <text x={x + 18} y={y + 40} fontSize="40" fill={ink}>
            <tspan>{fs.label.slice(0, -1)}</tspan>
            <tspan fill={active ? '#000' : color}>{fs.label.slice(-1)}</tspan>
          </text>
          <text x={x + 18} y={y + 92} fontSize="32" fontWeight="700" fill={active ? '#000' : UI.muted}>
            —
          </text>
        </>
      )}
    </g>
  );
}

/** Плитка сцены: текущая залита цветом сцены, остальные тонированы им на 10 %. */
function SceneTile({ fs, x, y }: { fs: FootswitchState; x: number; y: number }) {
  const active = fs.active === true;
  const background = active ? SCENE_COLOR : mix(SCENE_COLOR, 0.1, UI.background);
  const icon = active ? shade(SCENE_COLOR, 0.47) : SCENE_ICON_GREY;
  return (
    <g>
      <rect x={x} y={y} width="190" height="194" rx="6" fill={background} />
      <text
        x={x + 95}
        y={y + 171}
        fontSize="198"
        fontWeight="500"
        textAnchor="middle"
        fill={active ? shade(SCENE_COLOR, 0.88) : mix(SCENE_COLOR, 0.17, background)}
      >
        {fs.letter}
      </text>
      <g fill="none" stroke={icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <EditIcon x={x + 21} y={y + 19} />
        <path
          d={
            `M${x + 86} ${y + 27} H${x + 104} M${x + 100} ${y + 23} L${x + 104} ${y + 27} L${x + 100} ${y + 31} ` +
            `M${x + 106} ${y + 37} H${x + 88} M${x + 92} ${y + 33} L${x + 88} ${y + 37} L${x + 92} ${y + 41}`
          }
        />
        <rect x={x + 155} y={y + 20} width="14" height="14" rx="3" />
        <rect x={x + 149} y={y + 26} width="14" height="14" rx="3" fill={background} />
      </g>
      <text x={x + 95} y={y + 115} fontSize="32" fontWeight="700" textAnchor="middle" fill={active ? '#000' : UI.muted}>
        —
      </text>
    </g>
  );
}

/**
 * Плитка стомпа: назначенные блоки неизвестны — пустая плашка значка и
 * прочерк вместо имени; блоки, переключённые нечётное число раз с загрузки
 * пресета, помечены меткой TOGGLED.
 */
function StompTile({ fs, x, y }: { fs: FootswitchState; x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="190" height="194" rx="6" fill={UI.surface} />
      <rect
        x={x + 13}
        y={y + 13}
        width="68"
        height="68"
        rx="16"
        fill={UI.background}
        stroke="#383C38"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
      <g fill="none" stroke={STOMP_GREY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <EditIcon x={x + 109} y={y + 17} />
      </g>
      <text x={x + 145} y={y + 44} fontSize="40" fill={STOMP_GREY}>
        {fs.letter}
      </text>
      {fs.toggled && (
        <g>
          <rect x={x + 13} y={y + 98} width="108" height="28" rx="14" fill={UI.white} />
          <text x={x + 67} y={y + 118} fontSize="16" fontWeight="700" textAnchor="middle" fill="#000">
            TOGGLED
          </text>
        </g>
      )}
      <text x={x + 18} y={y + 176} fontSize="32" fontWeight="700" fill={UI.muted}>
        —
      </text>
    </g>
  );
}

/** Значок ✎ (EDIT) 22×22; цвет и толщина линий — от родителя. */
function EditIcon({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path
        d={
          `M${x + 10} ${y + 1} H${x + 3} Q${x + 1} ${y + 1} ${x + 1} ${y + 3} V${y + 19} ` +
          `Q${x + 1} ${y + 21} ${x + 3} ${y + 21} H${x + 19} Q${x + 21} ${y + 21} ${x + 21} ${y + 19} V${y + 12}`
        }
      />
      <path
        d={`M${x + 7} ${y + 15} L${x + 8} ${y + 11} L${x + 18} ${y + 1} L${x + 21} ${y + 4} L${x + 11} ${y + 14} Z`}
      />
    </g>
  );
}
