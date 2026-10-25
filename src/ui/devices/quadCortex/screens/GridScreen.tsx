/**
 * The Grid — основной экран Quad Cortex: шапка с обозначением пресета,
 * сетлистом, сценой и режимом и сетка блоков 4 × 8.
 */

import { memo } from 'react';
import type { PresetState, QuadCortexState } from '../../../../core/devices/quadCortex/engine.ts';
import { SLOT_COLORS, UI } from '../palette.ts';
import { GridHeaderIcons, ModeIcons, modeIconsWidth, ScenePlate } from './parts.tsx';

/** Центры рядов сетки по вертикали, px. */
const ROW_CY = [147, 241, 335, 429] as const;

/** Центры слотов ряда по горизонтали, px. */
const SLOT_CX = [99, 185, 271, 357, 443, 529, 615, 701] as const;

/**
 * Экран The Grid. Содержимое пресета по MIDI неизвестно, поэтому имя пресета
 * — прочерк, слоты блоков — пустые контуры, блоки входа и выхода — без
 * подписей; сигнальная линия идёт по первому ряду.
 *
 * Сетлиста в шапке прибора нет; здесь он подписан мелко над обозначением
 * пресета, чтобы было видно, к какому сетлисту относится пресет.
 */
export function GridScreen({ state }: { state: QuadCortexState }) {
  const mode = state.mode;
  const textX = 657 + (mode === null ? 24 : modeIconsWidth(mode)) + 13;
  return (
    <g>
      <rect width="800" height="480" fill={UI.black} />
      <text x="16" y="19" fontSize="15" fill={UI.muted}>
        {setlistCaption(state.preset)}
      </text>
      <PresetTitle preset={state.preset} />
      <GridHeaderIcons />
      <ScenePlate scene={state.scene} x={656} y={12} />
      {mode !== null && <ModeIcons mode={mode} x={657} y={60} background={UI.black} />}
      <text x={textX} y="80" fontSize="22" fontWeight="600" fill={mode === null ? UI.faint : UI.white}>
        {mode === null ? '—' : mode.name === 'HYBRID' ? 'HYB' : mode.name}
      </text>
      <GridRows />
    </g>
  );
}

/** Подпись сетлиста: имя постоянного сетлиста или номер пользовательского. */
function setlistCaption(preset: PresetState): string {
  if (preset.setlist === null) {
    return 'Setlist —';
  }
  return preset.setlistName ?? `Setlist ${preset.setlist}`;
}

/**
 * Обозначение и имя пресета в шапке: номер банка белый, буква слота в цвете
 * слота, имя неизвестно — серый прочерк. Неизвестный пресет — два серых
 * прочерка, как у пресета вне банков на приборе.
 */
function PresetTitle({ preset }: { preset: PresetState }) {
  if (preset.bank === null || preset.slot === null) {
    return (
      <g fill={UI.faint}>
        <rect x="16" y="50" width="21" height="11" rx="1" />
        <rect x="60" y="50" width="21" height="11" rx="1" />
      </g>
    );
  }
  const color = SLOT_COLORS[preset.slot as keyof typeof SLOT_COLORS] ?? UI.white;
  return (
    <text x="14" y="76" fontSize="70" fontWeight="700" fill={UI.white}>
      <tspan>{preset.bank}</tspan>
      <tspan fill={color}>{preset.slot}</tspan>
      <tspan dx="24" fill={UI.faint}>
        —
      </tspan>
    </text>
  );
}

/** Ряды сетки: блоки входа и выхода, пустые слоты и сигнальная линия первого ряда. */
const GridRows = memo(function GridRows() {
  return (
    <g>
      <line x1="52" y1={ROW_CY[0]} x2="748" y2={ROW_CY[0]} stroke={UI.cable} strokeWidth="2" />
      {ROW_CY.map((cy) => (
        <g key={cy}>
          {SLOT_CX.map((cx) => (
            <rect
              key={cx}
              x={cx - 32}
              y={cy - 32}
              width="64"
              height="64"
              rx="14"
              fill="none"
              stroke="#2A2A2A"
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
          ))}
          {[8, 748].map((x) => (
            <g key={x}>
              <rect
                x={x}
                y={cy - 38}
                width="44"
                height="76"
                rx="14"
                fill={UI.background}
                stroke="#000"
                strokeWidth="1.5"
              />
              <text x={x + 22} y={cy + 6} fontSize="16" textAnchor="middle" fill={UI.muted}>
                —
              </text>
            </g>
          ))}
        </g>
      ))}
    </g>
  );
});
