/**
 * Модель Neural DSP Quad Cortex с прошивкой CorOS 4.1.1: состояние прибора и
 * реакция на все входящие MIDI-сообщения по MIDI-реализации из главы
 * «08 MIDI Support» руководства Quad Cortex 4.1.1.
 */

import type { MidiMessage } from '../../midi.ts';
import { standardControllerName } from '../../midi.ts';
import type { ClockInfo, DeviceEngine, DeviceSettings, HandleContext } from '../types.ts';
import {
  groupText,
  hasBanksOfFour,
  MAX_SETLIST,
  presetDesignation,
  presetText,
  setlistName,
  setlistText,
} from './addressing.ts';
import type { BarGrid, LooperResult } from './looper.ts';
import {
  advanceLooper,
  initialLooper,
  looperAction,
  looperAfterPresetLoad,
  looperDuplicate,
  looperHalfSpeed,
  looperMidiStart,
  looperOneShot,
  looperPlayStop,
  looperPunch,
  looperPunchRelease,
  looperRecord,
  looperRecordRelease,
  looperReverse,
  looperTile,
  looperUndo,
  quantizeText,
  ROUTING_MODES,
} from './looper.ts';
import type { Outcome } from './outcome.ts';
import { closeScreen, openScreen, outcome, patch, sameFields } from './outcome.ts';
import type { ModeSlotValue, QuadCortexSettings } from './settings.ts';
import { QUAD_CORTEX_SETTINGS, readSettings, slotRows } from './settings.ts';
import type { FootswitchMode, FootswitchState, Letter, PresetState, QuadCortexState, Screen } from './state.ts';
import { LETTERS } from './state.ts';
import {
  advanceTempo,
  clockStart,
  clockTick,
  initialTempo,
  tapTempo,
  tempoAfterRecall,
  tempoForSettings,
  tempoLed,
} from './tempo.ts';

export type {
  BankSelectState,
  FootswitchMode,
  FootswitchRole,
  FootswitchState,
  Letter,
  LooperArmed,
  LooperState,
  LooperTransport,
  PresetState,
  QuadCortexState,
  RowMode,
  Screen,
  TempoLed,
  TempoState,
} from './state.ts';
export { LETTERS } from './state.ts';
export type {
  ClockOut,
  LooperAction,
  LooperPressMode,
  ModeSlots,
  ModeSlotValue,
  QuadCortexSettings,
  SceneBypassBehavior,
} from './settings.ts';
export { readSettings as readQuadCortexSettings } from './settings.ts';
export { LOOPER_MAX_RECORD_MS } from './looper.ts';

/** Прошивка, MIDI-реализацию которой воспроизводит модель. */
const FIRMWARE = 'CorOS 4.1.1';

const NOT_IMPLEMENTED = `не входит в MIDI-реализацию ${FIRMWARE}`;

/**
 * Наибольший интервал, через который значение 0–63 у CC#35–42 или CC#44
 * после значения 64–127 того же номера помечается как возможное отпускание
 * кнопки контроллера, мс.
 */
const RELEASE_WINDOW_MS = 400;

const RELEASE_NOTE = ' (возможно, отпускание кнопки контроллера)';

const NOTE_BLOCKS =
  'блоков Minivoicer/Multivoicer/Overlord Synth, если такой блок есть в пресете и его MIDI-режим включён';

const NOTE_ON_TEXT = `Нота для ${NOTE_BLOCKS}`;

const NOTE_OFF_TEXT = `Отпускание ноты для ${NOTE_BLOCKS}`;

const SCENE_TEMPO_NOTE = '; темп неизвестен — при TEMPO MODE = PRESET сцена может задавать свой темп';

const SCREEN_NAMES: Record<Exclude<Screen, 'tempo'>, string> = {
  gigView: 'Gig View',
  tuner: 'Tuner',
  looper: 'Looper X',
};

const NO_FLIPS: readonly boolean[] = LETTERS.map(() => false);

/** Обстоятельства обработки сообщения вместе с настройками. */
interface Context {
  time: number;
  clock: ClockInfo;
  settings: QuadCortexSettings;
}

/** Модель Neural DSP Quad Cortex (CorOS 4.1.1). */
export const quadCortexEngine: DeviceEngine<QuadCortexState> = {
  id: 'qc',
  name: 'Quad Cortex',
  vendor: 'Neural DSP',
  model: 'Quad Cortex',
  firmware: FIRMWARE,
  settings: QUAD_CORTEX_SETTINGS,

  /**
   * Пресет, сцена, темп и положения педалей неизвестны, экраны закрыты,
   * петли Looper X нет, CC#0 = 0. Активный сетлист и режим футсвитчей —
   * из настроек «Сетлист при включении» и «Режим при включении».
   */
  createState(settings: DeviceSettings): QuadCortexState {
    const s = readSettings(settings);
    const state: QuadCortexState = {
      settings,
      preset: {
        setlist: s.startSetlist,
        setlistName: null,
        index: null,
        bank: null,
        slot: null,
        label: null,
        standardLabel: null,
        banksOfFour: false,
        name: null,
      },
      bankSelect: { msb: 0, pendingMsb: null, pendingLsb: null },
      scene: null,
      mode: s.startModeSlot === null ? null : modeFromSlot(s.modeSlots[s.startModeSlot - 1], s.startModeSlot),
      footswitches: [],
      screens: [],
      tempo: initialTempo(),
      looper: initialLooper(),
      expression: [null, null],
      stompFlips: {},
      lastPress: {},
    };
    return derive(state, s);
  },

  /**
   * Кроме замены настроек: неизвестные сетлист и режим берутся из настроек
   * «при включении»; режим, выбранный из Mode Slot, заменяется новым
   * содержимым этого слота, а если слот стал пустым, режим неизвестен; если
   * MIDI Clock больше не принимается, синхронизация к нему прекращается.
   */
  applySettings(state: QuadCortexState, settings: DeviceSettings): QuadCortexState {
    const s = readSettings(settings);
    let mode: FootswitchMode | null = null;
    if (state.mode !== null) {
      const fresh = modeFromSlot(s.modeSlots[state.mode.slot - 1], state.mode.slot);
      mode = fresh !== null && sameFields(fresh.rows, state.mode.rows) ? state.mode : fresh;
    } else if (s.startModeSlot !== null) {
      mode = modeFromSlot(s.modeSlots[s.startModeSlot - 1], s.startModeSlot);
    }
    const next: QuadCortexState = {
      ...state,
      settings,
      mode,
      preset: patch(state.preset, { setlist: state.preset.setlist ?? s.startSetlist }),
      tempo: tempoForSettings(state, s),
    };
    return derive(next, s);
  },

  /** Перед сообщением применяет события, наступившие к его времени, как {@link quadCortexAt}. */
  handle(state: QuadCortexState, message: MidiMessage, context: HandleContext) {
    const advanced = advance(state, context.time);
    const ctx: Context = { time: context.time, clock: context.clock, settings: readSettings(advanced.settings) };
    const result = dispatch(advanced, message, ctx);
    const next = result.state === state ? state : derive(result.state, readSettings(result.state.settings));
    return { state: next, description: result.description };
  },
};

/**
 * Возвращает состояние прибора на момент `time` без новых сообщений: окно
 * Tempo закрыто, если наступило время его автозакрытия; синхронизация к MIDI
 * Clock прекращена, если доля не приходила дольше периода доли и 500 мс;
 * запись Looper X, взведённая QUANTIZE, началась, запись новой петли
 * завершилась в конце такта или по пределу 4 мин 44 с, петля с ONE SHOT
 * остановилась. Нужна, чтобы рисовать прибор между сообщениями.
 *
 * @param time момент не раньше времени последнего обработанного сообщения,
 *   миллисекунды Unix-времени.
 * @returns исходный объект, если к этому моменту ничего не наступило.
 */
export function quadCortexAt(state: QuadCortexState, time: number): QuadCortexState {
  const advanced = advance(state, time);
  return advanced === state ? state : derive(advanced, readSettings(advanced.settings));
}

/** Применяет события, наступившие ко времени `time`: автозакрытие окна Tempo, остановку MIDI Clock, Looper X. */
function advance(state: QuadCortexState, time: number): QuadCortexState {
  const next = advanceTempo(state, time);
  return patch(next, { looper: advanceLooper(next.looper, time) });
}

function dispatch(state: QuadCortexState, message: MidiMessage, ctx: Context): Outcome {
  switch (message.kind) {
    case 'programChange':
      return programChange(state, message.program, ctx);
    case 'controlChange':
      return controlChange(state, message.controller, message.value, ctx);
    case 'noteOn':
      return outcome(state, 'applied', message.velocity > 0 ? NOTE_ON_TEXT : NOTE_OFF_TEXT);
    case 'noteOff':
      return outcome(state, 'applied', NOTE_OFF_TEXT);
    case 'clock':
      return clockTick(state, ctx.time, ctx.clock, ctx.settings);
    case 'start':
      return midiStart(state, ctx);
    case 'continue':
      return outcome(state, 'unsupported', `Continue ${NOT_IMPLEMENTED} (не документирован)`);
    case 'stop':
      return outcome(state, 'unsupported', `Stop ${NOT_IMPLEMENTED} (не документирован)`);
    case 'sysex':
      return outcome(state, 'unsupported', `System Exclusive ${NOT_IMPLEMENTED}: публичной SysEx-реализации нет`);
    case 'polyPressure':
      return outcome(state, 'unsupported', `Polyphonic Aftertouch ${NOT_IMPLEMENTED}`);
    case 'channelPressure':
      return outcome(state, 'unsupported', `Channel Aftertouch ${NOT_IMPLEMENTED}`);
    case 'pitchBend':
      return outcome(state, 'unsupported', `Pitch Bend ${NOT_IMPLEMENTED}`);
    case 'mtcQuarterFrame':
      return outcome(state, 'unsupported', `MTC Quarter Frame ${NOT_IMPLEMENTED}`);
    case 'songPosition':
      return outcome(state, 'unsupported', `Song Position Pointer ${NOT_IMPLEMENTED}`);
    case 'songSelect':
      return outcome(state, 'unsupported', `Song Select ${NOT_IMPLEMENTED}`);
    case 'tuneRequest':
      return outcome(state, 'unsupported', `Tune Request ${NOT_IMPLEMENTED}`);
    case 'activeSensing':
      return outcome(state, 'unsupported', `Active Sensing ${NOT_IMPLEMENTED}`);
    case 'reset':
      return outcome(state, 'unsupported', `System Reset ${NOT_IMPLEMENTED}`);
    case 'invalid':
      return outcome(state, 'unsupported', 'Некорректное сообщение — прибор его не обрабатывает');
  }
}

function controlChange(state: QuadCortexState, cc: number, value: number, ctx: Context): Outcome {
  if (cc >= 35 && cc <= 42) {
    return footswitch(state, cc, value, ctx);
  }
  switch (cc) {
    case 0:
      return bankSelectMsb(state, value, ctx);
    case 32:
      return bankSelectLsb(state, value);
    case 1:
    case 2:
      return expression(state, cc - 1, value);
    case 43:
      return value > 7
        ? outcome(state, 'ignored', `CC#43 = ${value}: значение вне диапазона 0–7 — без действия`)
        : sceneOutcome(selectScene(state, LETTERS[value], ctx.settings), '', '');
    case 44: {
      const press = registerPress(state, cc, value, ctx.time);
      return tapTempo(press.state, ctx.time, ctx.settings, press.note);
    }
    case 45:
      return screenCommand(state, 'tuner', value >= 64);
    case 46:
      return screenCommand(state, 'gigView', value >= 64);
    case 47:
      return modeSelect(state, value, ctx);
    case 48:
      return screenCommand(state, 'looper', value < 64);
    case 49:
      return looperToggle(state, cc, value, () => looperDuplicate(state.looper, ctx.time));
    case 50:
      return looperToggle(state, cc, value, () => looperOneShot(state.looper, ctx.time));
    case 51:
      return looperToggle(state, cc, value, () => looperHalfSpeed(state.looper, ctx.time));
    case 52:
      return looperOutcome(
        state,
        value >= 64 ? looperPunch(state.looper) : looperPunchRelease(state.looper, ctx.settings),
      );
    case 53:
      return looperOutcome(
        state,
        value >= 64
          ? looperRecord(state.looper, ctx.time, barGrid(state))
          : looperRecordRelease(state.looper, ctx.time, ctx.settings, barGrid(state)),
      );
    case 54:
      return looperToggle(state, cc, value, () => looperPlayStop(state.looper, ctx.time));
    case 55:
      return looperToggle(state, cc, value, () => looperReverse(state.looper));
    case 56:
      return looperToggle(state, cc, value, () => looperUndo(state.looper));
    case 57:
      return looperParameter(state, cc, value, 1, () => {
        const duplicateMode = value === 0 ? 'Free' : 'Sync';
        return { looper: patch(state.looper, { duplicateMode }), text: `DUPLICATE MODE = ${duplicateMode}` };
      });
    case 58:
      return looperParameter(state, cc, value, 9, () => {
        const quantize = value === 9 ? 16 : value;
        return { looper: patch(state.looper, { quantize }), text: `QUANTIZE = ${quantizeText(quantize)}` };
      });
    case 59:
      return looperParameter(state, cc, value, 1, () => {
        const midiClockStart = value === 1;
        const text = `MIDI Clock Start: ${midiClockStart ? 'On' : 'Off'}`;
        return { looper: patch(state.looper, { midiClockStart }), text };
      });
    case 60:
      return looperView(state, value);
    case 61:
      return looperParameter(state, cc, value, ROUTING_MODES.length - 1, () => {
        const routing = ROUTING_MODES[value];
        return { looper: patch(state.looper, { routing }), text: `ROUTING MODE = ${routing}` };
      });
    case 62: {
      const on = value >= 64;
      const settings =
        state.settings.ignoreDuplicatePc === on ? state.settings : { ...state.settings, ignoreDuplicatePc: on };
      return outcome(patch(state, { settings }), 'applied', `Ignore Duplicate PC: ${on ? 'On' : 'Off'}`);
    }
    case 64:
      return outcome(
        state,
        'unsupported',
        'CC#64 (Footswitch Page Swap) есть только у Quad Cortex mini — у Quad Cortex не входит в MIDI-реализацию',
      );
    default: {
      const name = standardControllerName(cc);
      return outcome(state, 'unsupported', `CC#${cc}${name ? ` (${name})` : ''} ${NOT_IMPLEMENTED}`);
    }
  }
}

/** Program Change: загрузка пресета CC#0 × 128 + PC в сетлисте из CC#32 или в активном. */
function programChange(state: QuadCortexState, program: number, ctx: Context): Outcome {
  const bankSelect = state.bankSelect;
  const setlist = bankSelect.pendingLsb ?? state.preset.setlist;
  const index = bankSelect.msb * 128 + program;
  const same = state.preset.index === index && state.preset.setlist === setlist;
  const cleared = patch(state, { bankSelect: patch(bankSelect, { pendingMsb: null, pendingLsb: null }) });
  const label = presetText(index, hasBanksOfFour(ctx.settings.modeSlots));
  if (same && ctx.settings.ignoreDuplicatePc) {
    return outcome(cleared, 'ignored', `Пресет ${label} уже загружен — повтор игнорируется (Ignore Duplicate PC = On)`);
  }
  const verb = same ? 'перезагружен' : 'загружен';
  return outcome(
    loadPreset(cleared, setlist, index, ctx),
    'applied',
    `Пресет ${label} ${verb} (${setlistText(setlist)})${presetTempoNote(state, ctx)}`,
  );
}

/**
 * Загружает пресет: сцена — сцена по умолчанию пресета (неизвестна),
 * переключения STOMP сбрасываются, параметры блока Looper X неизвестны, при
 * TEMPO MODE = PRESET темп неизвестен. Экраны, режим, положения педалей и
 * петля Looper X остаются.
 *
 * @param index индекс пресета в сетлисте или null, если неизвестен.
 */
function loadPreset(
  state: QuadCortexState,
  setlist: number | null,
  index: number | null,
  ctx: Context,
): QuadCortexState {
  return {
    ...state,
    preset: patch(state.preset, { setlist, index }),
    scene: null,
    stompFlips: {},
    tempo: tempoAfterRecall(state.tempo, ctx.settings),
    looper: looperAfterPresetLoad(state.looper),
  };
}

function presetTempoNote(state: QuadCortexState, ctx: Context): string {
  return ctx.settings.tempoMode === 'PRESET' && !state.tempo.clockSynced
    ? ', темп пресета неизвестен (TEMPO MODE = PRESET)'
    : '';
}

function bankSelectMsb(state: QuadCortexState, value: number, ctx: Context): Outcome {
  if (value > 1) {
    return outcome(state, 'ignored', `Bank Select MSB = ${value}: значение вне диапазона 0–1 — без действия`);
  }
  const next = patch(state, { bankSelect: patch(state.bankSelect, { msb: value, pendingMsb: value }) });
  const group = groupText(value, hasBanksOfFour(ctx.settings.modeSlots));
  return outcome(
    next,
    'pending',
    `Bank Select MSB = ${value}: группа пресетов ${group} — применится при следующем Program Change`,
  );
}

function bankSelectLsb(state: QuadCortexState, value: number): Outcome {
  if (value > MAX_SETLIST) {
    return outcome(
      state,
      'ignored',
      `Bank Select LSB = ${value}: значение вне диапазона 0–${MAX_SETLIST} — без действия`,
    );
  }
  const next = patch(state, { bankSelect: patch(state.bankSelect, { pendingLsb: value }) });
  return outcome(
    next,
    'pending',
    `Bank Select LSB = ${value}: ${setlistText(value)} — применится при следующем Program Change`,
  );
}

function expression(state: QuadCortexState, pedal: number, value: number): Outcome {
  const values: [number | null, number | null] = [state.expression[0], state.expression[1]];
  values[pedal] = value;
  const next = state.expression[pedal] === value ? state : { ...state, expression: values };
  const position = value === 0 ? 'Heel (0 %)' : value === 127 ? 'Toe (100 %)' : `${Math.round((value / 127) * 100)} %`;
  return outcome(next, 'applied', `EXP ${pedal + 1}: положение ${position}`);
}

/** Результат вызова сцены без пометок. */
interface SceneResult {
  state: QuadCortexState;
  applied: boolean;
  letter: Letter;
  /** Пометка о том, что темп стал неизвестен; пустая строка — темп не менялся. */
  tempoNote: string;
}

/**
 * Вызывает сцену. Повторный вызов текущей сцены ничего не меняет.
 * Переключения STOMP покидаемой сцены сохраняются только при SCENE BYPASS
 * BEHAVIOR = Always overwrite bypass state; при TEMPO MODE = PRESET темп
 * становится неизвестным, потому что темп может быть назначен на сцену.
 */
function selectScene(state: QuadCortexState, letter: Letter, settings: QuadCortexSettings): SceneResult {
  if (state.scene === letter) {
    return { state, applied: false, letter, tempoNote: '' };
  }
  const left = state.scene ?? '?';
  let stompFlips = state.stompFlips;
  if ((settings.sceneBypassBehavior !== 'overwrite' || state.scene === null) && stompFlips[left] !== undefined) {
    stompFlips = Object.fromEntries(Object.entries(stompFlips).filter(([key]) => key !== left));
  }
  const tempo = tempoAfterRecall(state.tempo, settings);
  const tempoNote = tempo.bpm === null && state.tempo.bpm !== null ? SCENE_TEMPO_NOTE : '';
  return { state: { ...state, scene: letter, stompFlips, tempo }, applied: true, letter, tempoNote };
}

/**
 * Описывает вызов сцены.
 *
 * @param prefix начало описания, например `Футсвитч C (SCENE): `; пустая
 *   строка — описание начинается со слова «Сцена».
 * @param note пометка в конце описания.
 */
function sceneOutcome(result: SceneResult, prefix: string, note: string): Outcome {
  const scene = `${prefix}${prefix ? 'сцена' : 'Сцена'} ${result.letter}`;
  return result.applied
    ? outcome(result.state, 'applied', `${scene}${result.tempoNote}${note}`)
    : outcome(result.state, 'ignored', `${scene} уже активна${note}`);
}

/** CC#47: режим из Mode Slot 1–3 по значению 0–2. */
function modeSelect(state: QuadCortexState, value: number, ctx: Context): Outcome {
  if (value > 2) {
    return outcome(state, 'ignored', `CC#47 = ${value}: значение вне диапазона 0–2 — без действия`);
  }
  const slot = (value + 1) as 1 | 2 | 3;
  const mode = modeFromSlot(ctx.settings.modeSlots[value], slot);
  if (mode === null) {
    return outcome(state, 'ignored', `Mode Slot ${slot} пуст — режим не меняется`);
  }
  const current = state.mode;
  const same = current !== null && current.slot === slot && sameFields(current.rows, mode.rows);
  if (same) {
    return outcome(state, 'ignored', `Режим ${modeText(mode)} уже активен (Mode Slot ${slot})`);
  }
  return outcome({ ...state, mode }, 'applied', `Режим ${modeText(mode)} (Mode Slot ${slot})`);
}

/** Возвращает режим из содержимого Mode Slot; null для пустого слота. */
function modeFromSlot(value: ModeSlotValue, slot: 1 | 2 | 3): FootswitchMode | null {
  const rows = slotRows(value);
  return rows === null ? null : { name: rows[0] === rows[1] ? rows[0] : 'HYBRID', rows, slot };
}

function modeText(mode: FootswitchMode): string {
  return mode.name === 'HYBRID' ? `HYBRID: ${mode.rows[0]} (A–D) + ${mode.rows[1]} (E–H)` : mode.name;
}

/**
 * Открывает или закрывает Tuner, Gig View или Looper X. Открываемый экран
 * оказывается сверху; Looper X всегда открывается в режиме Perform.
 */
function screenCommand(state: QuadCortexState, screen: Exclude<Screen, 'tempo'>, open: boolean): Outcome {
  const name = SCREEN_NAMES[screen];
  if (open) {
    if (state.screens.at(-1) === screen) {
      return outcome(state, 'ignored', `${name} уже открыт`);
    }
    const screens = openScreen(state.screens, screen);
    if (screen === 'looper') {
      const next = patch(state, { screens, looper: patch(state.looper, { view: 'perform' }) });
      return outcome(next, 'applied', 'Looper X открыт (Perform), если в пресете есть блок Looper X');
    }
    return outcome(patch(state, { screens }), 'applied', `${name} открыт`);
  }
  if (!state.screens.includes(screen)) {
    return outcome(state, 'ignored', `${name} уже закрыт`);
  }
  return outcome(patch(state, { screens: closeScreen(state.screens, screen) }), 'applied', `${name} закрыт`);
}

/**
 * CC#35–42: нажатие футсвитча A–H. Верхний экран перехватывает нажатие:
 * Tuner — без действия, окно Tempo — закрывается при TEMPO MODE = GLOBAL,
 * Looper X — действие лупера (Perform) или ничего (Parameters). Иначе
 * действует режим ряда футсвитча.
 */
function footswitch(state: QuadCortexState, cc: number, value: number, ctx: Context): Outcome {
  const index = cc - 35;
  const letter = LETTERS[index];
  const press = registerPress(state, cc, value, ctx.time);
  const s = press.state;
  const note = press.note;
  const prefix = `Футсвитч ${letter}`;
  switch (s.screens.at(-1)) {
    case 'tuner':
      return outcome(
        s,
        'ignored',
        `${prefix}: открыт Tuner — действие футсвитча не выполняется (не документировано)${note}`,
      );
    case 'tempo':
      if (ctx.settings.tempoMode === 'PRESET') {
        return outcome(s, 'ignored', `${prefix}: в окне Tempo не действует (TEMPO MODE = PRESET, по форуму)${note}`);
      }
      return outcome(
        { ...s, screens: closeScreen(s.screens, 'tempo'), tempo: { ...s.tempo, windowClosesAt: null } },
        'applied',
        `${prefix}: окно Tempo закрыто без действия футсвитча (TEMPO MODE = GLOBAL, по форуму)${note}`,
      );
    case 'looper': {
      if (s.looper.view === 'parameters') {
        return outcome(
          s,
          'ignored',
          `${prefix}: Looper X в режиме Parameters — футсвитч работает как энкодер, действие не выполняется ` +
            `(по форуму)${note}`,
        );
      }
      const action = ctx.settings.looperActions[index];
      const result = looperAction(s.looper, action, ctx.time, barGrid(s));
      const text = `${prefix} (Looper X, ${action}): ${result.text}${note}`;
      return outcome(patch(s, { looper: result.looper }), result.effect, text);
    }
    default:
      break;
  }
  const mode = s.mode;
  if (mode === null) {
    const next = patch(s, { preset: patch(s.preset, { index: null }), scene: null, stompFlips: {} });
    return outcome(
      next,
      'applied',
      `${prefix}: режим футсвитчей неизвестен — загружен пресет, вызвана сцена или переключены блоки${note}`,
    );
  }
  const row = mode.rows[index < 4 ? 0 : 1];
  switch (row) {
    case 'PRESET':
      return presetFootswitch(s, index, mode.name === 'HYBRID', ctx, `${prefix} (PRESET): `, note);
    case 'SCENE':
      return sceneOutcome(selectScene(s, letter, ctx.settings), `${prefix} (SCENE): `, note);
    case 'STOMP': {
      const key = s.scene ?? '?';
      const flags = [...(s.stompFlips[key] ?? NO_FLIPS)];
      flags[index] = !flags[index];
      return outcome(
        { ...s, stompFlips: { ...s.stompFlips, [key]: flags } },
        'applied',
        `${prefix} (STOMP): переключён bypass назначенных на него блоков${note}`,
      );
    }
  }
}

/**
 * Футсвитч ряда PRESET загружает пресет своего слота в банке загруженного
 * пресета (в HYBRID — в банке из 4 пресетов). Нажатие футсвитча загруженного
 * пресета перезагружает его: Ignore Duplicate PC действует только на PC.
 */
function presetFootswitch(
  state: QuadCortexState,
  index: number,
  hybridRow: boolean,
  ctx: Context,
  prefix: string,
  note: string,
): Outcome {
  const size = hybridRow ? 4 : 8;
  const position = index % size;
  const current = state.preset.index;
  const setlist = state.preset.setlist;
  if (current === null) {
    const slot = 'ABCDEFGH'[position];
    const bank = hybridRow ? 'текущего банка из 4 пресетов' : 'текущего банка';
    return outcome(
      loadPreset(state, setlist, null, ctx),
      'applied',
      `${prefix}загружен пресет слота ${slot} ${bank} — банк неизвестен${note}`,
    );
  }
  const target = Math.floor(current / size) * size + position;
  const label = presetText(target, hasBanksOfFour(ctx.settings.modeSlots));
  const verb = target === current ? 'перезагружен' : 'загружен';
  return outcome(
    loadPreset(state, setlist, target, ctx),
    'applied',
    `${prefix}пресет ${label} ${verb} (${setlistText(setlist)})${presetTempoNote(state, ctx)}${note}`,
  );
}

/**
 * Запоминает нажатие для пометки отпускания кнопки контроллера: значение
 * 64–127 запоминается, значение 0–63 не позже {@link RELEASE_WINDOW_MS}
 * после него получает пометку.
 */
function registerPress(
  state: QuadCortexState,
  cc: number,
  value: number,
  time: number,
): { state: QuadCortexState; note: string } {
  const key = String(cc);
  if (value >= 64) {
    return { state: { ...state, lastPress: { ...state.lastPress, [key]: time } }, note: '' };
  }
  const last = state.lastPress[key];
  if (last === undefined) {
    return { state, note: '' };
  }
  const lastPress = Object.fromEntries(Object.entries(state.lastPress).filter(([k]) => k !== key));
  return { state: { ...state, lastPress }, note: time - last <= RELEASE_WINDOW_MS ? RELEASE_NOTE : '' };
}

/** Сетка тактов для QUANTIZE Looper X по действующему темпу. */
function barGrid(state: QuadCortexState): BarGrid {
  return { bpm: state.tempo.bpm, downbeatTime: state.tempo.downbeatTime };
}

function looperOutcome(state: QuadCortexState, result: LooperResult): Outcome {
  return outcome(patch(state, { looper: result.looper }), result.effect, `Looper X: ${result.text}`);
}

/** CC#49–51, 54–56: значения 64–127 переключают функцию, 0–63 не документированы. */
function looperToggle(state: QuadCortexState, cc: number, value: number, run: () => LooperResult): Outcome {
  return value < 64
    ? outcome(state, 'ignored', `CC#${cc} = ${value}: значение 0–63 не документировано — без действия`)
    : looperOutcome(state, run());
}

/** CC#57–59, 61: параметр блока Looper X со значениями 0–`max`. */
function looperParameter(
  state: QuadCortexState,
  cc: number,
  value: number,
  max: number,
  set: () => { looper: QuadCortexState['looper']; text: string },
): Outcome {
  if (value > max) {
    return outcome(state, 'ignored', `CC#${cc} = ${value}: значение вне диапазона 0–${max} — без действия`);
  }
  const result = set();
  return outcome(patch(state, { looper: result.looper }), 'applied', `Looper X: ${result.text}`);
}

/** CC#60: вид открытого редактора Looper X — 0 Perform, 1 Parameters. */
function looperView(state: QuadCortexState, value: number): Outcome {
  if (value > 1) {
    return outcome(state, 'ignored', `CC#60 = ${value}: значение вне диапазона 0–1 — без действия`);
  }
  const view = value === 0 ? 'perform' : 'parameters';
  const name = value === 0 ? 'Perform' : 'Parameters';
  if (!state.screens.includes('looper')) {
    return outcome(
      state,
      'ignored',
      `Looper X: редактор закрыт — переключение на ${name} без действия (не документировано)`,
    );
  }
  if (state.looper.view === view) {
    return outcome(state, 'ignored', `Looper X: уже ${name}`);
  }
  return outcome({ ...state, looper: { ...state.looper, view } }, 'applied', `Looper X: ${name}`);
}

/**
 * MIDI Start: начало отсчёта долей и тактов MIDI Clock и запуск действия
 * Looper X, взведённого при MIDI CLOCK START = On.
 */
function midiStart(state: QuadCortexState, ctx: Context): Outcome {
  const phased = clockStart(state, ctx.clock, ctx.settings);
  const result = looperMidiStart(phased.looper, ctx.time);
  if (result === null) {
    return outcome(phased, 'ignored', 'Start: действий Looper X, ожидающих MIDI Start, нет');
  }
  return outcome(patch(phased, { looper: result.looper }), result.effect, `Start: Looper X — ${result.text}`);
}

/**
 * Пересчитывает производные поля: обозначения пресета и имя сетлиста,
 * назначения и подсветку футсвитчей, цвет светодиода TEMPO. Неизменившиеся
 * части состояния остаются теми же объектами.
 */
function derive(state: QuadCortexState, settings: QuadCortexSettings): QuadCortexState {
  const preset = derivePreset(state.preset, hasBanksOfFour(settings.modeSlots));
  const tempo = patch(state.tempo, { led: tempoLed(state.tempo, settings) });
  const next = patch(state, { preset, tempo });
  const views = LETTERS.map((letter, i) => footswitchView(next, settings, letter, i));
  const same = views.length === next.footswitches.length && views.every((v, i) => sameFields(v, next.footswitches[i]));
  return same ? next : { ...next, footswitches: views };
}

function derivePreset(preset: PresetState, banksOfFour: boolean): PresetState {
  const shown = preset.index === null ? null : presetDesignation(preset.index, banksOfFour);
  return patch(preset, {
    setlistName: setlistName(preset.setlist),
    bank: shown?.bank ?? null,
    slot: shown?.slot ?? null,
    label: shown?.label ?? null,
    standardLabel: preset.index === null ? null : presetDesignation(preset.index, false).label,
    banksOfFour,
    name: null,
  });
}

function footswitchView(
  state: QuadCortexState,
  settings: QuadCortexSettings,
  letter: Letter,
  i: number,
): FootswitchState {
  const base: FootswitchState = { letter, role: null, label: null, name: null, active: null, toggled: false };
  switch (state.screens.at(-1)) {
    case 'tuner':
      return { ...base, role: 'tuner' };
    case 'tempo':
      return { ...base, role: 'tempo' };
    case 'looper': {
      if (state.looper.view === 'parameters') {
        return { ...base, role: 'looper' };
      }
      const tile = looperTile(state.looper, settings.looperActions[i]);
      return { ...base, role: 'looper', label: tile.label, active: tile.active };
    }
    default:
      break;
  }
  if (state.mode === null) {
    return base;
  }
  const row = state.mode.rows[i < 4 ? 0 : 1];
  if (row === 'SCENE') {
    return { ...base, role: 'scene', label: letter, active: state.scene === null ? null : state.scene === letter };
  }
  if (row === 'STOMP') {
    return { ...base, role: 'stomp', toggled: state.stompFlips[state.scene ?? '?']?.[i] ?? false };
  }
  const current = state.preset.index;
  if (current === null) {
    return { ...base, role: 'preset' };
  }
  const size = state.mode.name === 'HYBRID' ? 4 : 8;
  const target = Math.floor(current / size) * size + (i % size);
  return {
    ...base,
    role: 'preset',
    label: presetDesignation(target, state.preset.banksOfFour).label,
    active: target === current,
  };
}
