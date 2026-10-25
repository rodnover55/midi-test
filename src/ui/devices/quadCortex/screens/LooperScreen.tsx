/**
 * Редактор Looper X: шапка, панель подсказок с состоянием петли, полоса хода
 * петли и плитки действий футсвитчей A–H (Perform) или параметры блока
 * (Parameters).
 */

import type {
  FootswitchState,
  LooperAction,
  LooperState,
  QuadCortexSettings,
  QuadCortexState,
} from '../../../../core/devices/quadCortex/engine.ts';
import { LOOPER_MAX_RECORD_MS } from '../../../../core/devices/quadCortex/engine.ts';
import { UI } from '../palette.ts';
import type { LooperProgress } from '../timeline.ts';
import { formatDuration } from '../timeline.ts';
import { CheckButton, ParamCaption, ParamPanel, ScenePlate } from './parts.tsx';

const TRANSPORT_TEXT: Record<LooperState['transport'], string> = {
  empty: '',
  recording: 'RECORDING',
  playing: 'PLAYING',
  overdubbing: 'OVERDUB',
  punching: 'PUNCH IN',
  duplicating: 'DUPLICATE',
  stopped: 'STOPPED',
};

/** Действия с красным значком; у остальных значок белый. */
const RED_ACTIONS: readonly LooperAction[] = ['DUPLICATE', 'PUNCH IN', 'RECORD'];

const TRACK = { x: 28, y: 212, width: 744, height: 12 } as const;

/**
 * Экран Looper X. Как прибор показывает запись и воспроизведение, не
 * документировано, поэтому состояние петли выведено текстом в панели
 * подсказок, ход — полосой (запись — доля от наибольшей длины записи,
 * воспроизведение — позиция в петле), а идущие и включённые действия —
 * рамкой плитки: красной у записи, зелёной у воспроизведения, белой у
 * режимов; взведённое действие — пунктирной рамкой.
 *
 * @param progress ход петли в момент изображения; null — петля не пишется и не звучит или ход неизвестен.
 * @param available свободное время записи, мс; null — неизвестно.
 */
export function LooperScreen({
  state,
  settings,
  progress,
  available,
}: {
  state: QuadCortexState;
  settings: QuadCortexSettings;
  progress: LooperProgress | null;
  available: number | null;
}) {
  const looper = state.looper;
  const parameters = looper.view === 'parameters';
  return (
    <g>
      <rect width="800" height="480" fill={UI.background} />
      <rect x="8" y="8" width="44" height="44" rx="8" fill={UI.surface} />
      <g fill={UI.white}>
        <circle cx="30" cy="21" r="2" />
        <circle cx="30" cy="30" r="2" />
        <circle cx="30" cy="39" r="2" />
      </g>
      <text x="61" y="23" fontSize="16" fill={UI.muted}>
        LOOPER
      </text>
      <text x="61" y="48" fontSize="20" fill={UI.danger}>
        Looper X
      </text>
      <rect
        x="411"
        y="8"
        width="125"
        height="44"
        rx="8"
        fill={parameters ? UI.panel : UI.surface}
        stroke={parameters ? UI.white : 'none'}
        strokeWidth="1.5"
      />
      <circle cx="440" cy="30" r="9" fill="none" stroke={UI.white} strokeWidth="2" />
      <path d="M440 30 L445 24" stroke={UI.white} strokeWidth="2" strokeLinecap="round" />
      <text x="461" y="36" fontSize="16" fill={UI.white}>
        Params
      </text>
      <rect x="544" y="8" width="132" height="44" rx="8" fill={UI.surface} />
      <g fill={UI.white}>
        <path d="M570 22 L560 30 L570 38 Z M580 22 L570 30 L580 38 Z" />
        <path d="M640 22 L650 30 L640 38 Z M650 22 L660 30 L650 38 Z" />
      </g>
      <ScenePlate scene={state.scene} x={598} y={18} />
      <rect x="685" y="19" width="2" height="22" fill={UI.surface} />
      <CheckButton />
      <InfoPanel looper={looper} progress={progress} available={available} />
      <LoopArea looper={looper} progress={progress} />
      {parameters ? (
        <Parameters looper={looper} settings={settings} />
      ) : (
        state.footswitches.map((fs, i) => (
          <ActionTile
            key={fs.letter}
            fs={fs}
            action={settings.looperActions[i]}
            looper={looper}
            x={8 + (i % 4) * 198}
            y={276 + Math.floor(i / 4) * 102}
          />
        ))
      )}
    </g>
  );
}

/** Панель подсказок: состояние петли (без петли — подсказка о записи), свободное время и подсказка о закрытии. */
function InfoPanel({
  looper,
  progress,
  available,
}: {
  looper: LooperState;
  progress: LooperProgress | null;
  available: number | null;
}) {
  let line = TRANSPORT_TEXT[looper.transport];
  if (progress?.kind === 'recording') {
    line += ` ${formatDuration(progress.elapsed, true)}`;
  }
  if (looper.length !== null && looper.transport !== 'empty' && looper.transport !== 'recording') {
    line += ` · LOOP ${formatDuration(looper.length, true)}`;
  }
  if (looper.armed !== null) {
    const action = looper.armed === 'record' ? 'RECORD' : looper.armed === 'duplicate' ? 'DUPLICATE' : 'PLAY';
    line = `${action} ARMED — WAITING FOR ${looper.armedUntil === null ? 'MIDI START' : 'NEXT BAR'}`;
  }
  const modes = [looper.oneShot && 'ONE SHOT', looper.halfSpeed && 'HALF SPEED', looper.reverse && 'REVERSE'].filter(
    (m) => m !== false,
  );
  if (modes.length > 0) {
    line += `${line === '' ? '' : ' · '}${modes.join(' · ')}`;
  }
  const recordingDot = looper.transport === 'recording' || looper.transport === 'overdubbing';
  return (
    <g>
      <rect x="8" y="60" width="783" height="108" rx="4" fill={UI.panel} />
      {looper.transport === 'empty' && looper.armed === null ? (
        <g fontSize="18" fill={UI.white}>
          <text x="17" y="81">
            USE
          </text>
          <circle cx="63" cy="75" r="9.5" fill={UI.danger} />
          <text x="81" y="81">
            TO START RECORDING
          </text>
          {modes.length > 0 && (
            <text x="17" y="153" fill={UI.muted}>
              {modes.join(' · ')}
            </text>
          )}
        </g>
      ) : (
        <g fontSize="18" fill={UI.white}>
          {recordingDot && <circle cx="26.5" cy="75" r="9.5" fill={UI.danger} />}
          <text x={recordingDot ? 45 : 17} y="81">
            {line}
          </text>
        </g>
      )}
      <text x="783" y="81" fontSize="18" textAnchor="end" fill={UI.white}>
        {`AVAILABLE ${available === null ? '—' : formatDuration(available)}`}
      </text>
      <g fontSize="18" fill={UI.white}>
        <text x="17" y="120">
          USE
        </text>
        <path d="M56 117 L63 110 L70 117" fill="none" stroke={UI.white} strokeWidth="2" strokeLinecap="round" />
        <text x="81" y="120">
          TO CLOSE THE LOOPER VIEW
        </text>
      </g>
    </g>
  );
}

/** Полоса хода петли: запись — красная доля от наибольшей длины записи, воспроизведение — позиция в петле. */
function LoopArea({ looper, progress }: { looper: LooperState; progress: LooperProgress | null }) {
  const { x, y, width, height } = TRACK;
  let fill: { width: number; color: string } | null = null;
  let head: number | null = null;
  if (progress?.kind === 'recording') {
    const share = Math.min(progress.elapsed, LOOPER_MAX_RECORD_MS) / LOOPER_MAX_RECORD_MS;
    fill = { width: width * share, color: UI.danger };
  } else if (progress?.kind === 'loop') {
    const writing = looper.transport === 'overdubbing' || looper.transport === 'punching';
    fill = { width: width * progress.position, color: writing ? UI.danger : UI.accent };
    head = x + width * progress.position;
  }
  return (
    <g>
      <rect x="8" y="169" width="783" height="99" fill={UI.surface} />
      {looper.transport !== 'empty' && (
        <>
          <rect x={x} y={y} width={width} height={height} rx="6" fill={UI.panel} />
          {fill !== null && (
            <rect x={x} y={y} width={Math.max(fill.width, 0.01)} height={height} rx="6" fill={fill.color} />
          )}
          {head !== null && <rect x={head - 1.5} y={y - 14} width="3" height={height + 28} rx="1.5" fill={UI.white} />}
        </>
      )}
    </g>
  );
}

/**
 * Плитка действия футсвитча: подпись, буква и значок; идущее или включённое
 * действие — в рамке, взведённое — в пунктирной рамке, недоступное (UNDO без
 * записи, RE-LOOP без DUPLICATE) — приглушено.
 */
function ActionTile({
  fs,
  action,
  looper,
  x,
  y,
}: {
  fs: FootswitchState;
  action: LooperAction;
  looper: LooperState;
  x: number;
  y: number;
}) {
  const label = fs.label ?? action;
  const armed =
    (looper.armed === 'record' && action === 'RECORD') ||
    (looper.armed === 'duplicate' && action === 'DUPLICATE') ||
    (looper.armed === 'play' && action === 'PLAY');
  const frame = action === 'PLAY' ? UI.accent : RED_ACTIONS.includes(action) ? UI.danger : UI.white;
  const unavailable =
    (action === 'UNDO' && looper.undo === null) || (action === 'RE-LOOP' && looper.transport !== 'duplicating');
  return (
    <g>
      <rect x={x} y={y} width="190" height="95" rx="5" fill={UI.panel} />
      {(fs.active === true || armed) && (
        <rect
          x={x + 1.5}
          y={y + 1.5}
          width="187"
          height="92"
          rx="4"
          fill="none"
          stroke={frame}
          strokeWidth="3"
          strokeDasharray={armed ? '8 6' : undefined}
        />
      )}
      <text x={x + 11} y={y + 21} fontSize="16" fill={UI.white}>
        {label}
      </text>
      <text x={x + 170} y={y + 40} fontSize="40" textAnchor="end" fill={UI.white}>
        {fs.letter}
      </text>
      <g opacity={unavailable ? 0.35 : 1}>
        <ActionIcon action={action} label={label} cx={x + 95} cy={y + 60} />
      </g>
    </g>
  );
}

/** Значок действия Looper X с центром в (cx, cy); PLAY/STOP и UNDO/REDO — по текущей подписи. */
function ActionIcon({ action, label, cx, cy }: { action: LooperAction; label: string; cx: number; cy: number }) {
  switch (action) {
    case 'DUPLICATE':
      return (
        <g>
          <circle cx={cx - 12} cy={cy} r="14" fill={UI.danger} />
          <path
            d={`M${cx - 18} ${cy - 6} L${cx - 6} ${cy + 6} M${cx - 18} ${cy + 6} L${cx - 6} ${cy - 6}`}
            stroke={UI.panel}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <text x={cx + 14} y={cy + 13} fontSize="36" fontWeight="700" textAnchor="middle" fill={UI.danger}>
            1
          </text>
        </g>
      );
    case 'RE-LOOP':
      return (
        <g fill="none" stroke={UI.white} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${cx + 15} ${cy - 6} A16 16 0 1 0 ${cx + 13} ${cy + 9}`} />
          <path d={`M${cx + 18} ${cy - 17} L${cx + 15} ${cy - 5} L${cx + 4} ${cy - 9}`} />
        </g>
      );
    case 'ONE SHOT':
      return (
        <g fill="none" stroke={UI.white} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path
            d={
              `M${cx - 4} ${cy + 15} H${cx - 9} A15 15 0 0 1 ${cx - 9} ${cy - 15} ` +
              `H${cx + 9} A15 15 0 0 1 ${cx + 9} ${cy + 15} H${cx + 6}`
            }
          />
          <path d={`M${cx + 1} ${cy + 8} L${cx - 6} ${cy + 15} L${cx + 1} ${cy + 22}`} />
        </g>
      );
    case 'HALF SPEED':
      return (
        <text x={cx} y={cy + 13} fontSize="38" fontWeight="700" textAnchor="middle" fill={UI.white}>
          1/2
        </text>
      );
    case 'PUNCH IN':
      return (
        <g fill={UI.danger}>
          <rect x={cx - 9} y={cy - 18} width="22" height="25" rx="9" />
          <ellipse cx={cx - 10} cy={cy - 2} rx="6" ry="8" />
          <rect x={cx - 7} y={cy + 9} width="18" height="9" rx="2" />
          <path
            d={`M${cx - 5} ${cy - 4} Q${cx + 2} ${cy - 1} ${cx + 9} ${cy - 5}`}
            fill="none"
            stroke={UI.panel}
            strokeWidth="2"
          />
        </g>
      );
    case 'RECORD':
      return <circle cx={cx} cy={cy} r="22" fill={UI.danger} />;
    case 'PLAY':
      return label === 'STOP' ? (
        <rect x={cx - 15} y={cy - 15} width="30" height="30" rx="2" fill={UI.white} />
      ) : (
        <path d={`M${cx - 13} ${cy - 19} L${cx + 19} ${cy} L${cx - 13} ${cy + 19} Z`} fill={UI.white} />
      );
    case 'REVERSE':
      return (
        <path
          d={
            `M${cx - 3} ${cy - 17} L${cx - 29} ${cy} L${cx - 3} ${cy + 17} Z ` +
            `M${cx + 25} ${cy - 17} L${cx - 1} ${cy} L${cx + 25} ${cy + 17} Z`
          }
          fill={UI.white}
        />
      );
    case 'UNDO': {
      const flip = label === 'REDO' ? -1 : 1;
      return (
        <g
          transform={`translate(${cx} ${cy}) scale(${flip} 1)`}
          fill="none"
          stroke={UI.white}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M-14 -6 A17 17 0 1 1 -8 14" />
          <path d="M-20 -18 L-14 -5 L-1 -10" />
        </g>
      );
    }
  }
}

/**
 * Параметры блока Looper X: известные по MIDI (DUPLICATE MODE, QUANTIZE,
 * MIDI CLOCK START, ROUTING MODE) и по настройкам (RECORD, OVERDUB и PUNCH
 * MODE); остальные — прочерки.
 */
function Parameters({ looper, settings }: { looper: LooperState; settings: QuadCortexSettings }) {
  const quantize =
    looper.quantize === null
      ? '—'
      : looper.quantize === 0
        ? 'Off'
        : `${looper.quantize} ${looper.quantize === 1 ? 'BEAT' : 'BEATS'}`;
  const clockStart = looper.midiClockStart === null ? '—' : looper.midiClockStart ? 'On' : 'Off';
  const top: readonly [string, string][] = [
    ['DUPLICATE MODE', looper.duplicateMode ?? '—'],
    ['QUANTIZE', quantize],
    ['MIDI CLOCK START', clockStart],
    ['ROUTING MODE', looper.routing ?? '—'],
    ['PRE ROLL', '—'],
  ];
  const bottom: readonly [string, string][] = [
    ['RECORD MODE', settings.looperRecordMode],
    ['OVERDUB MODE', settings.looperOverdubMode],
    ['PUNCH MODE', settings.looperPunchMode],
    ['THRESHOLD', '—'],
    ['REC LENGTH', '—'],
  ];
  return (
    <g>
      {[top, bottom].map((row, r) => {
        const y = 276 + r * 102;
        return (
          <g key={y}>
            <ParamPanel y={y} height={94} />
            {row.map(([title, value], i) => (
              <ParamCaption key={title} column={i} top={y - 6} title={title} value={value} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
