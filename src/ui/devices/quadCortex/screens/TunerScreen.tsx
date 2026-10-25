/** Меню Tuner на весь экран: шкала отклонения, нота и нижняя панель FREQ, INPUT, MUTE, LIVE TUNER. */

import type { QuadCortexSettings } from '../../../../core/devices/quadCortex/engine.ts';
import { UI } from '../palette.ts';
import { CheckButton, Dropdown, Knob, ParamCaption, ParamPanel, Toggle } from './parts.tsx';

/** Серый подписей шкалы тюнера. */
const SCALE_GREY = '#808480';

/**
 * Экран Tuner. Высота звука на входе приложению неизвестна, поэтому нота и
 * отклонение — прочерки, указателя на шкале нет. FREQ и INPUT — параметры
 * меню, по MIDI не узнать; MUTE и LIVE TUNER — из настроек «Tuner: MUTE» и
 * «LIVE TUNER».
 */
export function TunerScreen({ settings }: { settings: QuadCortexSettings }) {
  return (
    <g>
      <rect width="800" height="480" fill={UI.background} />
      <text x="16" y="36" fontSize="17" fill="#909090">
        Tuner
      </text>
      <CheckButton />
      <text x="25" y="97" fontSize="19" fill={SCALE_GREY}>
        -50
      </text>
      <text x="770" y="97" fontSize="19" textAnchor="end" fill={SCALE_GREY}>
        +50
      </text>
      <text x="399" y="105" fontSize="40" textAnchor="middle" fill={UI.muted}>
        —
      </text>
      <rect x="26" y="189" width="747" height="2" fill={UI.white} />
      <text x="400" y="328" fontSize="70" textAnchor="middle" fill={UI.muted}>
        —
      </text>
      <ParamPanel y={366} height={106} />
      <ParamCaption column={0} top={366} title="FREQ [Hz]" value="—" />
      <Knob cx={122} cy={437} />
      <Dropdown x={174} y={402} width={137} value="INPUT —" />
      <rect x="331" y="402" width="137" height="37" rx="4" fill={settings.tunerMute ? UI.danger : '#000'} />
      <text x="399.5" y="426" fontSize="15" textAnchor="middle" fill={UI.white}>
        {settings.tunerMute ? 'MUTED' : 'MUTE'}
      </text>
      <ParamCaption column={3} top={366} title="LIVE TUNER" />
      <Toggle x={495} y={410} options={['Yes', 'No']} selected={settings.liveTuner ? 0 : 1} />
    </g>
  );
}
