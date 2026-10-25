/**
 * Модель Line 6 HX Stomp с прошивкой 3.80: состояние прибора и его реакция на
 * входящие MIDI-сообщения по MIDI-реализации руководства HX Stomp 3.80 и
 * release notes Line 6.
 */

import type { ChannelMessage, MidiMessage } from '../../midi.ts';
import { isChannelMessage, standardControllerName } from '../../midi.ts';
import type { DeviceEngine, DeviceSettings, Effect, HandleContext, HandleResult } from '../types.ts';
import { switchDisplays, TUNER_PAGES } from './display.ts';
import type { LooperController } from './looper.ts';
import { emptyLooper, looperCommand } from './looper.ts';
import { bankRange, PRESET_COUNT, presetLabel, presetRef, slotAt, wrapBank, wrapPreset } from './presets.ts';
import type { HxFootswitchMode, HxFsFunction, HxSettings } from './settings.ts';
import {
  CLOCK_RX_NAMES,
  clockAllowed,
  fsFunctionName,
  HX_SETTINGS,
  MODE_NAMES,
  MODE_ORDER,
  PC_RX_NAMES,
  pcAllowed,
  PORT_NAMES,
  readSettings,
  receivesPort,
} from './settings.ts';
import type { HxBankQueue, HxFootswitch, HxSnapshot, HxStompState, HxTunerPage } from './state.ts';
import { clockLost, followClock, formatBpm, initialTempo, leaveClock, recallTempo, tapTempo } from './tempo.ts';

export type * from './state.ts';
export type { HxFootswitchMode, HxFsFunction, HxSettings } from './settings.ts';
export { TUNER_PAGES } from './display.ts';
export { presetLabel } from './presets.ts';
export { FS_FUNCTION_NAMES, MODE_NAMES, MODE_ORDER } from './settings.ts';
export { formatBpm } from './tempo.ts';

/** Итог обработки сообщения: новое состояние и описание команды. */
interface Step {
  state: HxStompState;
  text: string;
  effect: Effect;
}

function applied(state: HxStompState, text: string): Step {
  return { state, text, effect: 'applied' };
}

function ignored(state: HxStompState, text: string): Step {
  return { state, text, effect: 'ignored' };
}

function unsupported(state: HxStompState, text: string): Step {
  return { state, text, effect: 'unsupported' };
}

const NO_KNOBS: readonly (number | null)[] = [null, null, null];

const SYSTEM_NAMES = {
  mtcQuarterFrame: 'MTC Quarter Frame',
  songPosition: 'Song Position Pointer',
  songSelect: 'Song Select',
  tuneRequest: 'Tune Request',
  start: 'Start',
  continue: 'Continue',
  stop: 'Stop',
  activeSensing: 'Active Sensing',
  reset: 'System Reset',
} as const;

const LOOPER_NAMES: Record<LooperController, string> = {
  60: 'Looper Record/Overdub',
  61: 'Looper Play/Stop',
  62: 'Looper Play Once',
  63: 'Looper Undo/Redo',
  65: 'Looper Forward/Reverse',
  66: 'Looper Full/Half Speed',
};

/** Возвращает `state`, если все поля `changes` совпадают с его полями, иначе — новое состояние с ними. */
function patch(state: HxStompState, changes: Partial<HxStompState>): HxStompState {
  for (const key of Object.keys(changes) as (keyof HxStompState)[]) {
    if (changes[key] !== state[key]) {
      return { ...state, ...changes };
    }
  }
  return state;
}

/** Возвращает значение контроллера 0–127 в процентах диапазона, округлённое до целого. */
function percent(value: number): number {
  return Math.round((value * 100) / 127);
}

/** Возвращает пометку о том, что смена произошла под открытым Tuner или при All Bypass; иначе — пустую строку. */
function behind(state: HxStompState): string {
  if (state.tuner && state.allBypass) {
    return ' (Tuner и All Bypass остаются включены)';
  }
  if (state.tuner) {
    return ' (Tuner остаётся открыт)';
  }
  return state.allBypass ? ' (All Bypass остаётся включён)' : '';
}

function clearKnobs(knobs: readonly (number | null)[]): readonly (number | null)[] {
  return knobs.every((k) => k === null) ? knobs : NO_KNOBS;
}

/** Возвращает положения педалей после вызова пресета или снапшота по EXP 1/2 Position. */
function recallExp(
  exp: readonly (number | null)[],
  settings: HxSettings,
  event: 'preset' | 'snapshot',
): readonly (number | null)[] {
  const scopes = [settings.exp1Position, settings.exp2Position];
  const next = exp.map((value, i) =>
    scopes[i] === 'snapshot' || (event === 'preset' && scopes[i] === 'preset') ? null : value,
  );
  return next.every((value, i) => value === exp[i]) ? exp : next;
}

/**
 * Возвращает футсвитчи после смены пресета: назначения прежнего пресета,
 * удерживаемые нажатием, больше не действуют.
 */
function dropHeldAssignments(footswitches: readonly HxFootswitch[]): readonly HxFootswitch[] {
  return footswitches.some((f) => f.stompHeld) ? footswitches.map((f) => ({ ...f, stompHeld: false })) : footswitches;
}

function withFootswitch(state: HxStompState, index: number, footswitch: HxFootswitch): HxStompState {
  return { ...state, footswitches: state.footswitches.map((f, i) => (i === index ? footswitch : f)) };
}

/** Возвращает соседний режим футсвитчей по кругу: после Snapshot — Stomp, перед Stomp — Snapshot. */
function stepMode(mode: HxFootswitchMode, direction: 1 | -1): HxFootswitchMode {
  const i = MODE_ORDER.indexOf(mode);
  return MODE_ORDER[(i + direction + MODE_ORDER.length) % MODE_ORDER.length];
}

/** Возвращает состояние с режимом футсвитчей `mode`; очередь банка снимается. */
function setMode(state: HxStompState, mode: HxFootswitchMode): HxStompState {
  return patch(state, { footswitchMode: mode, bankQueue: null });
}

function queueNote(state: HxStompState): string {
  return state.bankQueue ? '; очередь банка снята' : '';
}

/**
 * Возвращает состояние после загрузки пресета: снапшот — сохранённый в
 * пресете (неизвестен), правки отброшены, темп и положения педалей
 * восстановлены по Tempo Select и EXP Position, очередь банка снята с
 * возвратом в прежний режим футсвитчей. Tuner, All Bypass, вид и лупер не
 * меняются.
 *
 * @param index номер пресета 0–125; null — пресет неизвестен.
 */
function loadPreset(state: HxStompState, index: number | null): HxStompState {
  const settings = state.settings;
  const scope = settings.tempoSelect;
  return {
    ...state,
    preset: index === null ? null : presetRef(index, settings.presetNumber),
    snapshot: null,
    edited: false,
    presetLoading: true,
    bankQueue: null,
    footswitchMode: state.bankQueue ? state.bankQueue.returnMode : state.footswitchMode,
    tempo: scope === 'global' ? state.tempo : recallTempo(state.tempo, scope),
    exp: recallExp(state.exp, settings, 'preset'),
    knobs: clearKnobs(state.knobs),
    footswitches: dropHeldAssignments(state.footswitches),
  };
}

/** Возвращает описание загрузки пресета: `what` и общие для любой загрузки последствия. */
function loadedText(before: HxStompState, after: HxStompState, what: string): string {
  const queue = before.bankQueue ? `; очередь банка снята, режим футсвитчей — ${MODE_NAMES[after.footswitchMode]}` : '';
  return `${what}; снапшот — сохранённый в пресете${queue}${behind(after)}`;
}

/**
 * Возвращает состояние после вызова снапшота: темп и положения педалей
 * восстановлены по Tempo Select и EXP Position, значения ручек неизвестны.
 *
 * @param snapshot вызванный снапшот; null — неизвестен.
 */
function recallSnapshot(state: HxStompState, snapshot: HxSnapshot | null): HxStompState {
  const settings = state.settings;
  return patch(state, {
    snapshot,
    tempo: settings.tempoSelect === 'snapshot' ? recallTempo(state.tempo, 'snapshot') : state.tempo,
    exp: recallExp(state.exp, settings, 'snapshot'),
    knobs: clearKnobs(state.knobs),
  });
}

function programChange(state: HxStompState, program: number): Step {
  const settings = state.settings;
  if (!pcAllowed(settings)) {
    return ignored(
      state,
      settings.pcRx === 'off'
        ? 'MIDI PC Rx = Off: Program Change не принимается — без действия'
        : `MIDI PC Rx = ${PC_RX_NAMES[settings.pcRx]}: Program Change с ${PORT_NAMES[settings.port]} ` +
            'не принимается — без действия',
    );
  }
  const numbering = settings.presetNumber;
  if (program >= PRESET_COUNT) {
    const range = `${presetLabel(0, numbering)}–${presetLabel(PRESET_COUNT - 1, numbering)}`;
    return ignored(
      state,
      `Program Change ${program}: пресета с таким номером нет (у HX Stomp 126 пресетов, ${range}) — без действия`,
    );
  }
  if (state.preset !== null && state.preset.index === program) {
    return ignored(
      state,
      `Пресет ${state.preset.label} уже загружен: повторный Program Change не перезагружает пресет, ` +
        'правки и снапшот сохраняются (по форуму Line 6) — без действия',
    );
  }
  const next = loadPreset(state, program);
  return applied(next, loadedText(state, next, `Пресет ${presetLabel(program, numbering)} загружен`));
}

/** Загружает соседний пресет по кругу: за 42C следует 01A, перед 01A — 42C. */
function stepPreset(state: HxStompState, direction: 1 | -1, head: string): Step {
  const which = direction > 0 ? 'следующий' : 'предыдущий';
  if (state.preset === null) {
    const next = loadPreset(state, null);
    const what = `${head}: загружен ${which} пресет (номер неизвестен — текущий пресет неизвестен)`;
    return applied(next, loadedText(state, next, what));
  }
  const index = wrapPreset(state.preset.index + direction);
  const wrapped = direction > 0 ? state.preset.index === PRESET_COUNT - 1 : state.preset.index === 0;
  const next = loadPreset(state, index);
  const label = presetLabel(index, state.settings.presetNumber);
  const around = wrapped ? ` (после ${state.preset.label} — по кругу)` : '';
  return applied(next, loadedText(state, next, `${head}: загружен пресет ${label}${around}`));
}

/** Возвращает пометку для снапшота, выбранного сразу после смены пресета; иначе — пустую строку. */
function afterLoad(state: HxStompState, loading: boolean): string {
  if (!loading) {
    return '';
  }
  return ` — выполнен после загрузки пресета${state.preset ? ` ${state.preset.label}` : ''}`;
}

function selectSnapshot(state: HxStompState, snapshot: HxSnapshot, loading: boolean): Step {
  if (state.snapshot === snapshot) {
    const head = `Snapshot ${snapshot} вызван повторно (Reload)`;
    return state.settings.snapshotEdits === 'discard'
      ? applied(
          recallSnapshot(state, snapshot),
          `${head}: правки снапшота сброшены (Snapshot Edits = Discard)${behind(state)}`,
        )
      : applied(state, `${head}: при Snapshot Edits = Recall правки снапшота сохраняются${behind(state)}`);
  }
  return applied(recallSnapshot(state, snapshot), `Snapshot ${snapshot}${afterLoad(state, loading)}${behind(state)}`);
}

/** Вызывает соседний снапшот по кругу: за Snapshot 3 следует Snapshot 1, перед Snapshot 1 — Snapshot 3. */
function stepSnapshot(state: HxStompState, direction: 1 | -1, head: string, loading: boolean): Step {
  const which = direction > 0 ? 'следующий' : 'предыдущий';
  const tail = `${afterLoad(state, loading)}${behind(state)}`;
  if (state.snapshot === null) {
    return applied(
      recallSnapshot(state, null),
      `${head}: ${which} снапшот (номер неизвестен — текущий снапшот неизвестен)${tail}`,
    );
  }
  const snapshot = (((state.snapshot - 1 + direction + 3) % 3) + 1) as HxSnapshot;
  const wrapped = direction > 0 ? state.snapshot === 3 : state.snapshot === 1;
  const around = wrapped ? ` (после Snapshot ${state.snapshot} — по кругу)` : '';
  return applied(recallSnapshot(state, snapshot), `${head}: ${which} — Snapshot ${snapshot}${around}${tail}`);
}

function snapshotCc(state: HxStompState, value: number, loading: boolean): Step {
  if (value <= 2) {
    return selectSnapshot(state, (value + 1) as HxSnapshot, loading);
  }
  if (value === 8 || value === 9) {
    return stepSnapshot(state, value === 8 ? 1 : -1, 'Snapshot', loading);
  }
  if (value === 3) {
    return ignored(
      state,
      'CC#69 = 3: «Snapshot 4» из таблицы руководства 3.80 у HX Stomp нет (снапшотов три) — без действия',
    );
  }
  return ignored(
    state,
    `CC#69 = ${value}: значение не документировано (0–2 — Snapshot 1–3, 8 и 9 — следующий и предыдущий) — без действия`,
  );
}

function bypassText(settings: HxSettings): string {
  return settings.bypassType === 'analog'
    ? 'All Bypass включён — Analog Bypass: сигнал идёт с входов на выходы через реле без обработки'
    : 'All Bypass включён — DSP Bypass: хвосты задержек и реверберации затухают естественно';
}

function allBypassCc(state: HxStompState, value: number): Step {
  const engage = value < 64;
  if (engage === state.allBypass) {
    return ignored(state, `All Bypass уже ${engage ? 'включён' : 'выключен'} — без действия`);
  }
  return applied(
    { ...state, allBypass: engage },
    engage ? bypassText(state.settings) : 'All Bypass выключен: обработка включена',
  );
}

function footswitchModeCc(state: HxStompState, value: number): Step {
  if (value > 5) {
    return ignored(state, `CC#71 = ${value}: значение вне диапазона 0–5 — без действия`);
  }
  const mode = value <= 3 ? MODE_ORDER[value] : stepMode(state.footswitchMode, value === 4 ? 1 : -1);
  if (mode === state.footswitchMode && !state.bankQueue) {
    return ignored(state, `Footswitch Mode уже ${MODE_NAMES[mode]} — без действия`);
  }
  const how = value === 4 ? 'следующий — ' : value === 5 ? 'предыдущий — ' : '';
  return applied(
    setMode(state, mode),
    `Footswitch Mode: ${how}${MODE_NAMES[mode]}${queueNote(state)} (по руководствам 2.65/3.0)${behind(state)}`,
  );
}

/**
 * Нажимает кнопку <PAGE или PAGE>: на экране Tuner листает страницы его
 * настроек без перехода через край, в Edit view — страницы параметров
 * выбранного блока, в Play view — режимы футсвитчей по кругу.
 */
function page(state: HxStompState, direction: 1 | -1): Step {
  const name = direction > 0 ? 'PAGE>' : '<PAGE';
  if (state.tuner) {
    const target = state.tunerPage + direction;
    if (target < 1 || target > TUNER_PAGES.length) {
      const edge = direction > 0 ? 'последней' : 'первой';
      return ignored(state, `${name}: Tuner уже на ${edge} странице настроек (вывод) — без действия`);
    }
    return applied(
      { ...state, tunerPage: target as HxTunerPage },
      `${name}: Tuner, страница настроек ${target} — ${TUNER_PAGES[target - 1].join(', ')} (вывод)`,
    );
  }
  if (state.view === 'edit') {
    const which = direction > 0 ? 'следующая' : 'предыдущая';
    return applied(
      patch(state, { knobs: clearKnobs(state.knobs) }),
      `${name}: ${which} страница параметров выбранного блока (вывод)${behind(state)}`,
    );
  }
  const mode = stepMode(state.footswitchMode, direction);
  return applied(
    setMode(state, mode),
    `${name}: режим футсвитчей ${MODE_NAMES[mode]} (вывод)${queueNote(state)}${behind(state)}`,
  );
}

function knob(state: HxStompState, position: number, value: number): Step {
  const knobs = state.knobs[position] === value ? state.knobs : state.knobs.map((k, i) => (i === position ? value : k));
  const hidden = state.view === 'play' ? ' (изменение видно в Edit view)' : '';
  return applied(
    patch(state, { knobs, edited: true }),
    `Knob ${position + 1}: параметр на текущей странице выбранного блока — ${percent(value)} % диапазона${hidden}`,
  );
}

function save(state: HxStompState): Step {
  const what = state.preset ? `Пресет ${state.preset.label} сохранён` : 'Текущий пресет сохранён (номер неизвестен)';
  return applied(patch(state, { edited: false }), `${what} (сохранение по CC74 — по release notes 3.15)`);
}

function expPedal(state: HxStompState, pedal: 1 | 2, value: number): Step {
  const exp = state.exp[pedal - 1] === value ? state.exp : state.exp.map((v, i) => (i === pedal - 1 ? value : v));
  const end = value === 0 ? ' (пятка)' : value === 127 ? ' (носок)' : '';
  return applied(
    patch(state, { exp }),
    `EXP ${pedal}: положение ${percent(value)} %${end} — параметры и блоки, назначенные на EXP ${pedal} в пресете`,
  );
}

function userCc(state: HxStompState, controller: number, value: number): Step {
  const standard = standardControllerName(controller);
  const name = standard
    ? `CC#${controller} (${standard}) — у HX Stomp пользовательский CC (вывод)`
    : `Пользовательский CC#${controller}`;
  const bypass = value >= 64 ? 'включается' : 'выключается';
  return applied(
    state,
    `${name}: действует, только если назначен в пресете (Bypass Assign — блок ${bypass}; ` +
      `Controller Assign — ${percent(value)} % диапазона параметра)`,
  );
}

function tap(state: HxStompState, time: number, head: string | null): Step {
  const result = tapTempo(state.tempo, time);
  return {
    state: patch(state, { tempo: result.tempo }),
    text: head === null ? result.text : `${head} — ${result.text}`,
    effect: result.effect,
  };
}

function looper(state: HxStompState, controller: LooperController, value: number, time: number): Step {
  if (!state.looper) {
    return ignored(
      state,
      `${LOOPER_NAMES[controller]}: в пресете нет 1 Switch Looper (настройка модели) — без действия`,
    );
  }
  const result = looperCommand(state.looper, controller, value, time);
  return { state: patch(state, { looper: result.looper }), text: result.text, effect: result.effect };
}

/** Возвращает функцию эмулированного футсвитча 1–5: FS1 и FS2 — всегда назначения пресета. */
function functionOf(settings: HxSettings, footswitch: number): HxFsFunction {
  switch (footswitch) {
    case 3:
      return settings.fs3Function;
    case 4:
      return settings.fs4Function;
    case 5:
      return settings.fs5Function;
    default:
      return 'stomp';
  }
}

/** Загружает пресет A–C банка в очереди нажатием FS1–FS3 и возвращает прежний режим футсвитчей. */
function selectQueued(state: HxStompState, queue: HxBankQueue, footswitch: number, head: string): Step {
  const index = queue.bank === null ? null : (queue.bank - 1) * 3 + (footswitch - 1);
  const next = loadPreset(state, index);
  const what =
    index === null
      ? `пресет ${slotAt(footswitch - 1)} банка в очереди (номер банка неизвестен)`
      : `пресет ${presetLabel(index, state.settings.presetNumber)} из банка в очереди`;
  return applied(
    next,
    `${head}: загружен ${what}; снапшот — сохранённый в пресете; режим футсвитчей — ${MODE_NAMES[next.footswitchMode]}`,
  );
}

/** Ставит в очередь соседний банк: режим Preset, пресеты банка мигают до выбора. */
function queueBank(state: HxStompState, direction: 1 | -1, head: string): Step {
  const queue = state.bankQueue;
  const from = queue ? queue.bank : state.preset ? state.preset.bank : null;
  const bank = from === null ? null : wrapBank(from + direction);
  const next: HxStompState = {
    ...state,
    footswitchMode: 'preset',
    bankQueue: { bank, returnMode: queue ? queue.returnMode : state.footswitchMode },
  };
  const which = direction > 0 ? 'следующий' : 'предыдущий';
  return applied(
    next,
    bank === null
      ? `${head}: ${which} банк в очереди (номер неизвестен — текущий пресет неизвестен), ` +
          'режим Preset до выбора пресета (вывод)'
      : `${head}: банк ${bank} в очереди — пресеты ${bankRange(bank, state.settings.presetNumber)} мигают ` +
          'в режиме Preset до выбора (вывод)',
  );
}

/** Выполняет функцию футсвитча при нажатии, когда Tuner и All Bypass выключены и банк не в очереди. */
function runFunction(state: HxStompState, footswitch: number, fn: HxFsFunction, time: number, head: string): Step {
  switch (fn) {
    case 'stomp': {
      const target = `переключены блоки и команды, назначенные на FS${footswitch} в пресете (назначения неизвестны)`;
      if (footswitch > 3) {
        return applied(state, `${head}: ${target}`);
      }
      const held = { ...state.footswitches[footswitch - 1], stompHeld: true };
      return applied(withFootswitch(state, footswitch - 1, held), `${head}: ${target}`);
    }
    case 'tapTuner':
      return tap(state, time, head);
    case 'presetUp':
    case 'presetDown':
      return stepPreset(state, fn === 'presetUp' ? 1 : -1, head);
    case 'snapshotUp':
    case 'snapshotDown':
      return stepSnapshot(state, fn === 'snapshotUp' ? 1 : -1, head, false);
    case 'bankUp':
    case 'bankDown':
      return queueBank(state, fn === 'bankUp' ? 1 : -1, head);
    case 'nextMode':
    case 'prevMode': {
      const mode = stepMode(state.footswitchMode, fn === 'nextMode' ? 1 : -1);
      return applied(setMode(state, mode), `${head}: режим футсвитчей ${MODE_NAMES[mode]}${queueNote(state)}`);
    }
    case 'allBypass':
      return applied({ ...state, allBypass: true }, `${head}: ${bypassText(state.settings)}`);
    case 'toggleExp':
      return applied(
        state,
        `${head}: активная педаль переключена EXP 1 ↔ EXP 2, включены её блоки ` +
          '(какая педаль активна — задано пресетом)',
      );
  }
}

/**
 * Обрабатывает эмуляцию футсвитча CC49–CC53.
 *
 * FS1–FS3 различают нажатие (64–127) и отпускание (0–63), у FS4 и FS5 любое
 * значение — нажатие и сразу отпускание. Нажатие при открытом Tuner или
 * включённом All Bypass только выключает их (сначала Tuner); FS1–FS3 при банке
 * в очереди загружают пресет A–C этого банка; иначе выполняется функция
 * футсвитча режима Stomp, в каком бы режиме ни были футсвитчи.
 */
function emulateFootswitch(state: HxStompState, number: number, value: number, time: number): Step {
  const index = number - 1;
  const instant = number >= 4;
  const fn = functionOf(state.settings, number);
  const name = number <= 2 ? `FS${number}` : `FS${number} (${fsFunctionName(fn, number)})`;
  const current = state.footswitches[index];
  if (!instant && value < 64) {
    if (!current.pressed) {
      return ignored(state, `FS${number} отпущен без нажатия — без действия`);
    }
    const released = withFootswitch(state, index, { ...current, pressed: false, stompHeld: false });
    return current.stompHeld
      ? applied(
          released,
          `${name} отпущен: назначения типа Momentary вернулись в прежнее состояние, Latching — без изменений`,
        )
      : ignored(released, `${name} отпущен — без действия`);
  }
  const pressed = withFootswitch(state, index, { pressed: !instant, stompHeld: false, lastPress: time });
  const plain = instant ? `FS${number}` : `FS${number} нажат`;
  const anyValue = instant && value < 64 ? ' (у FS4 и FS5 любое значение — нажатие)' : '';
  if (state.tuner) {
    return applied(
      { ...pressed, tuner: false },
      `${plain}: Tuner закрыт — нажатие футсвитча только закрывает тюнер${anyValue}`,
    );
  }
  if (state.allBypass) {
    return applied(
      { ...pressed, allBypass: false },
      `${plain}: All Bypass выключен — нажатие футсвитча только выключает All Bypass${anyValue}`,
    );
  }
  if (state.bankQueue && !instant) {
    return selectQueued(pressed, state.bankQueue, number, plain);
  }
  const asStomp = !instant && state.footswitchMode !== 'stomp' ? ' (эмуляция футсвитча режима Stomp)' : '';
  const result = runFunction(pressed, number, fn, time, instant ? name : `${name} нажат`);
  return { ...result, text: `${result.text}${asStomp}${anyValue}` };
}

function controlChange(state: HxStompState, controller: number, value: number, time: number, loading: boolean): Step {
  if (controller === 0 || controller === 32) {
    return ignored(
      state,
      `Bank Select ${controller === 0 ? 'MSB' : 'LSB'} не используется (unused, but reserved): ` +
        'у HX Stomp один сетлист — Program Change выполнится как обычно',
    );
  }
  if (controller >= 49 && controller <= 53) {
    return emulateFootswitch(state, controller - 48, value, time);
  }
  if (controller >= 54 && controller <= 56) {
    return ignored(state, `CC#${controller} зарезервирован (у HX Stomp XL — FS${controller - 48}) — без действия`);
  }
  switch (controller) {
    case 1:
    case 2:
      return expPedal(state, controller, value);
    case 3:
      return ignored(
        state,
        'CC#3 зарезервирован (Reserved for future use; педали EXP 3 у HX Stomp нет) — без действия',
      );
    case 57:
    case 58:
    case 59:
      return ignored(state, `CC#${controller} зарезервирован (Reserved for future use) — без действия`);
    case 60:
    case 61:
    case 62:
    case 63:
    case 65:
    case 66:
      return looper(state, controller, value, time);
    case 64:
      return value >= 64
        ? tap(state, time, null)
        : ignored(state, `CC#64 = ${value}: Tap Tempo срабатывает от значений 64–127 — без действия`);
    case 67:
      return ignored(
        state,
        'CC#67 зарезервирован (у Helix — Looper footswitch mode, у HX Stomp такого режима нет) — без действия',
      );
    case 68:
      return state.tuner
        ? applied({ ...state, tuner: false }, 'Tuner закрыт')
        : applied({ ...state, tuner: true, tunerPage: 1 }, 'Tuner открыт');
    case 69:
      return snapshotCc(state, value, loading);
    case 70:
      return allBypassCc(state, value);
    case 71:
      return footswitchModeCc(state, value);
    case 72:
      return value >= 64 ? stepPreset(state, 1, 'Preset Up') : stepPreset(state, -1, 'Preset Down');
    case 73: {
      const view = state.view === 'play' ? 'edit' : 'play';
      return applied({ ...state, view }, `${view === 'edit' ? 'Edit view' : 'Play view'}${behind(state)}`);
    }
    case 74:
      return save(state);
    case 75:
    case 76:
    case 77:
      return knob(state, controller - 75, value);
    case 78:
    case 79:
    case 80:
      return ignored(state, `CC#${controller} зарезервирован (у Helix — Knob ${controller - 74}) — без действия`);
    case 81:
      return page(state, value >= 64 ? 1 : -1);
    default:
      return userCc(state, controller, value);
  }
}

function clock(state: HxStompState, context: HandleContext): Step {
  const settings = state.settings;
  if (!clockAllowed(settings)) {
    return ignored(
      state,
      settings.rxClock === 'off'
        ? 'Rx MIDI Clock = Off: MIDI Clock не принимается — без действия'
        : `Rx MIDI Clock = ${CLOCK_RX_NAMES[settings.rxClock]}: MIDI Clock с ${PORT_NAMES[settings.port]} ` +
            'не принимается — без действия',
    );
  }
  const { tempo, started } = followClock(state.tempo, context.time, context.clock.bpm);
  let text: string;
  if (started) {
    const ring = settings.fs3Function === 'tapTuner' && settings.tapLed ? 'кольцо TAP мигает синим, ' : '';
    text = `MIDI Clock: HX Stomp следует внешнему клоку — ${ring}Tap Tempo не действует`;
  } else {
    text = tempo.bpm === null ? 'MIDI Clock: темп определяется' : `MIDI Clock: темп ${formatBpm(tempo.bpm)} BPM`;
  }
  return applied({ ...state, tempo }, text);
}

function systemMessage(
  state: HxStompState,
  message: Exclude<MidiMessage, ChannelMessage>,
  context: HandleContext,
): Step {
  switch (message.kind) {
    case 'clock':
      return clock(state, context);
    case 'sysex':
      return unsupported(state, 'System Exclusive не входит в MIDI-реализацию HX Stomp 3.80');
    case 'invalid':
      return unsupported(state, `Некорректное сообщение (${message.reason}) — HX Stomp его не принимает`);
    default:
      return ignored(
        state,
        `${SYSTEM_NAMES[message.kind]} не используется HX Stomp 3.80 (не документировано) — без действия`,
      );
  }
}

/**
 * Обрабатывает сообщение канала.
 *
 * @param loading пришло ли сообщение сразу после смены пресета, пока пресет,
 *   возможно, ещё загружается.
 */
function channelMessage(state: HxStompState, message: ChannelMessage, time: number, loading: boolean): Step {
  switch (message.kind) {
    case 'programChange':
      return programChange(state, message.program);
    case 'controlChange':
      return controlChange(state, message.controller, message.value, time, loading);
    case 'noteOn':
    case 'noteOff':
      return unsupported(
        state,
        `${message.kind === 'noteOn' ? 'Note On' : 'Note Off'} не входит в MIDI-реализацию HX Stomp 3.80 ` +
          '(ноты — только исходящие команды Command Center)',
      );
    case 'polyPressure':
      return unsupported(state, 'Polyphonic Aftertouch не входит в MIDI-реализацию HX Stomp 3.80');
    case 'channelPressure':
      return unsupported(state, 'Channel Aftertouch не входит в MIDI-реализацию HX Stomp 3.80');
    case 'pitchBend':
      return unsupported(state, 'Pitch Bend не входит в MIDI-реализацию HX Stomp 3.80');
  }
}

function receive(state: HxStompState, message: MidiMessage, context: HandleContext): Step {
  if (!receivesPort(state.settings)) {
    return ignored(state, 'USB MIDI = Off: сообщения по USB не принимаются — без действия');
  }
  if (!isChannelMessage(message)) {
    return systemMessage(state, message, context);
  }
  const loading = state.presetLoading;
  const base = loading ? { ...state, presetLoading: false } : state;
  const step = channelMessage(base, message, context.time, loading);
  // Сообщение, которое ничего не выполнило и не изменило, отметку загрузки не снимает.
  return loading && step.state === base && step.effect !== 'applied' ? { ...step, state } : step;
}

/** Возвращает состояние с пересчитанными производными полями. */
function withDerived(state: HxStompState): HxStompState {
  return { ...state, switches: switchDisplays(state) };
}

function createState(values: DeviceSettings): HxStompState {
  const settings = readSettings(values);
  const footswitch: HxFootswitch = { pressed: false, stompHeld: false, lastPress: null };
  return withDerived({
    settings,
    view: 'play',
    tuner: false,
    tunerPage: 1,
    allBypass: false,
    footswitchMode: settings.initialMode,
    bankQueue: null,
    preset: null,
    edited: false,
    presetLoading: false,
    snapshot: null,
    tempo: initialTempo(),
    looper: settings.looper ? emptyLooper() : null,
    exp: [null, null],
    knobs: NO_KNOBS,
    footswitches: [footswitch, footswitch, footswitch, footswitch, footswitch],
    switches: [],
  });
}

function applySettings(state: HxStompState, values: DeviceSettings): HxStompState {
  const settings = readSettings(values);
  const following = state.tempo.clock !== null && clockAllowed(settings) && receivesPort(settings);
  return withDerived({
    ...state,
    settings,
    preset: state.preset && presetRef(state.preset.index, settings.presetNumber),
    tempo: state.tempo.clock !== null && !following ? leaveClock(state.tempo) : state.tempo,
    looper: settings.looper ? (state.looper ?? emptyLooper()) : null,
  });
}

function handle(state: HxStompState, message: MidiMessage, context: HandleContext): HandleResult<HxStompState> {
  let current = state;
  let note = '';
  if (message.kind !== 'clock' && clockLost(state.tempo, context.time)) {
    current = { ...state, tempo: leaveClock(state.tempo) };
    note = '; MIDI Clock пропал — темп снова собственный';
  }
  const result = receive(current, message, context);
  return {
    state: result.state === state ? state : withDerived(result.state),
    description: { text: `${result.text}${note}`, effect: result.effect },
  };
}

/**
 * Модель Line 6 HX Stomp с прошивкой 3.80.
 *
 * Состояние после включения: Play view, режим футсвитчей из настройки
 * «Режим футсвитчей при включении», пресет, снапшот и темп неизвестны, Tuner
 * и All Bypass выключены, петли лупера нет.
 *
 * Модель обрабатывает Program Change 0–125 (пресеты 01A–42C), CC1–CC3 и
 * CC49–CC81 по таблице MIDI CC руководства 3.80 с уточнениями release notes,
 * пользовательские CC (действуют по назначениям пресета) и Timing Clock.
 * Bank Select, транспорт MIDI и прочие системные сообщения входят в
 * реализацию без действия; ноты, Pitch Bend, Aftertouch и SysEx в неё не
 * входят. Настройки модели — {@link HX_SETTINGS}.
 */
export const hxStompEngine: DeviceEngine<HxStompState> = {
  id: 'hxstomp',
  name: 'HX Stomp',
  vendor: 'Line 6',
  model: 'HX Stomp',
  firmware: 'HX Stomp 3.80',
  settings: HX_SETTINGS,
  createState,
  applySettings,
  handle,
};
