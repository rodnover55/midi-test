/** Окно Tempo (меню Tempo & Metronome): BPM, доли такта и панели параметров темпа и метронома. */

import type { QuadCortexSettings, TempoState } from '../../../../core/devices/quadCortex/engine.ts';
import { UI } from '../palette.ts';
import { BEATS_PER_BAR } from '../timeline.ts';
import { CheckButton, columnX, Dropdown, Knob, ParamCaption, ParamPanel, Toggle } from './parts.tsx';

/** Центры точек долей по горизонтали, px. */
const BEAT_X = [207.5, 335.5, 463.5, 591.5] as const;

const TOP = 257;
const BOTTOM = 366;

/**
 * Экран Tempo. BPM — действующий темп модели; неизвестный темп — прочерк.
 * Точки долей показывают текущую долю такта 4/4. MODE и TEMPO LED — из
 * настроек «TEMPO MODE» и «TEMPO LED»; громкость, панорама, размер и звук
 * метронома по MIDI не узнать — прочерки.
 *
 * @param beat текущая доля такта 0–3; null — темп неизвестен, все точки серые.
 */
export function TempoScreen({
  tempo,
  settings,
  beat,
}: {
  tempo: TempoState;
  settings: QuadCortexSettings;
  beat: number | null;
}) {
  const bpm = tempo.bpm === null ? null : Number.isInteger(tempo.bpm) ? String(tempo.bpm) : tempo.bpm.toFixed(1);
  return (
    <g>
      <rect width="800" height="480" fill={UI.black} />
      <text x="19" y="33" fontSize="17" fill="#909090">
        Tempo
      </text>
      <CheckButton />
      <text x="399" y="116" fontSize="96" textAnchor="middle" fill={bpm === null ? UI.muted : UI.accent}>
        {bpm ?? '—'}
      </text>
      <text x="400" y="148" fontSize="18" textAnchor="middle" fill={UI.danger}>
        BPM = QUARTERS
      </text>
      {BEAT_X.slice(0, BEATS_PER_BAR).map((x, i) => (
        <circle key={x} cx={x} cy="212.5" r="12" fill={beat === i ? UI.white : UI.dots} />
      ))}
      <circle cx={BEAT_X[0]} cy="191" r="4" fill={UI.dots} />
      <circle cx={BEAT_X[2]} cy="234" r="4" fill={UI.dots} />
      <ParamPanel y={TOP} height={106} />
      <ParamCaption column={0} top={TOP} title="TEMPO" value={bpm === null ? '— BPM' : `${bpm} BPM`} />
      <Knob cx={122} cy={TOP + 66} />
      <ParamCaption column={1} top={TOP} title="MODE" />
      <circle cx={columnX(1) + 138} cy={TOP + 20} r="10" fill="#8A8A8A" />
      <text x={columnX(1) + 138} y={TOP + 26} fontSize="15" fontWeight="700" textAnchor="middle" fill={UI.panel}>
        i
      </text>
      <Toggle
        x={columnX(1) + 12}
        y={TOP + 40}
        options={['Global', 'Preset']}
        selected={settings.tempoMode === 'GLOBAL' ? 0 : 1}
      />
      <ParamCaption column={2} top={TOP} title="TEMPO LED" />
      <Toggle x={columnX(2) + 12} y={TOP + 40} options={['On', 'Off']} selected={settings.tempoLed ? 0 : 1} />
      <ParamCaption column={3} top={TOP} title="VOLUME" value="—" />
      <Knob cx={columnX(3) + 110} cy={TOP + 66} />
      <rect x={columnX(4) + 10} y={TOP + 40} width="137" height="37" rx="6" fill="#000" />
      <text x={columnX(4) + 78.5} y={TOP + 64} fontSize="15" textAnchor="middle" fill={UI.muted}>
        —
      </text>
      <ParamPanel y={BOTTOM} height={106} />
      <ParamCaption column={0} top={BOTTOM} title="PAN" value="—" />
      <Knob cx={122} cy={BOTTOM + 66} />
      {(['T/SIGNATURE', 'SUBDIVISIONS', 'SOUND', 'ROUTING'] as const).map((title, i) => (
        <g key={title}>
          <ParamCaption column={i + 1} top={BOTTOM} title={title} />
          <Dropdown x={columnX(i + 1) + 10} y={BOTTOM + 52} width={137} value="—" />
        </g>
      ))}
    </g>
  );
}
