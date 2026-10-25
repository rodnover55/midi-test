/**
 * Автомат Looper X: действия (RECORD/OVERDUB, PLAY/STOP, DUPLICATE, RE-LOOP,
 * PUNCH IN/OUT, ONE SHOT, HALF SPEED, REVERSE, UNDO/REDO), параметры блока
 * и события, наступающие со временем.
 *
 * Поведение, которого руководство не описывает, выбрано так: пока действие
 * взведено, RECORD, PLAY/STOP и DUPLICATE не действуют; RECORD/OVERDUB и
 * DUPLICATE во время PUNCH IN или DUPLICATE не действуют; PUNCH IN и
 * DUPLICATE работают только во время воспроизведения; UNDO/REDO меняет только
 * подпись кнопки; QUANTIZE начинает запись новой петли с первой доли такта и
 * доводит её до конца такта.
 */

import type { Effect } from '../types.ts';
import { patch } from './outcome.ts';
import type { LooperAction, QuadCortexSettings } from './settings.ts';
import type { LooperState, LooperTransport } from './state.ts';

/** Наибольшая длина записи Looper X, мс (4 мин 44 с): по её истечении запись завершается и петля играет. */
export const LOOPER_MAX_RECORD_MS = 284_000;

/** Названия ROUTING MODE по значению CC#61 (0–13). */
export const ROUTING_MODES: readonly string[] = [
  'Grid',
  'Input 1',
  'Input 2',
  'Return 1',
  'Return 2',
  'Inputs 1/2',
  'Returns 1/2',
  'Output 1',
  'Output 2',
  'Output 3',
  'Output 4',
  'Outputs 1/2',
  'Outputs 3/4',
  'Multiple Outputs',
];

/** Результат команды Looper X. */
export interface LooperResult {
  /** Тот же объект, если команда ничего не изменила. */
  looper: LooperState;
  effect: Effect;
  /** Описание без названия Looper X, например `OVERDUB вкл`. */
  text: string;
}

/** Подпись и подсветка плитки действия в Looper X (Perform). */
export interface LooperTile {
  /**
   * Подпись в текущем виде: `RECORD` или `OVERDUB`, `PLAY` или `STOP`,
   * `UNDO` или `REDO`, `PUNCH IN` или `PUNCH OUT`.
   */
  label: string;
  /** Идёт ли действие или включён ли режим. */
  active: boolean;
}

/** Сетка тактов, по которой QUANTIZE выравнивает запись новой петли. */
export interface BarGrid {
  /** Действующий темп, BPM; null — неизвестен. */
  bpm: number | null;
  /** Время первой доли одного из тактов; null — неизвестно. */
  downbeatTime: number | null;
}

const PLAYBACK: readonly LooperTransport[] = ['playing', 'overdubbing', 'punching', 'duplicating'];

const PHASE_NAMES: Partial<Record<LooperTransport, string>> = {
  overdubbing: 'OVERDUB',
  punching: 'PUNCH IN',
  duplicating: 'DUPLICATE',
};

/** Допуск сравнения моментов, вычисленных по сетке тактов, мс. */
const GRID_TOLERANCE_MS = 1;

/** Проверяет, звучит ли петля: воспроизведение, в том числе с OVERDUB, PUNCH IN или DUPLICATE. */
export function isPlayback(transport: LooperTransport): boolean {
  return PLAYBACK.includes(transport);
}

/** Создаёт Looper X только что включённого прибора: петли нет, параметры блока неизвестны. */
export function initialLooper(): LooperState {
  return {
    view: 'perform',
    transport: 'empty',
    armed: null,
    armedUntil: null,
    oneShot: false,
    halfSpeed: false,
    reverse: false,
    undo: null,
    length: null,
    recordStart: null,
    recordEndsAt: null,
    loopStart: null,
    stopsAt: null,
    duplicateMode: null,
    quantize: null,
    midiClockStart: null,
    routing: null,
  };
}

/**
 * Возвращает Looper X после загрузки пресета: параметры блока (DUPLICATE
 * MODE, QUANTIZE, MIDI CLOCK START, ROUTING MODE) становятся неизвестными,
 * петля продолжает звучать, как при Looper X в новом пресете.
 *
 * @returns исходный объект, если параметры уже неизвестны.
 */
export function looperAfterPresetLoad(looper: LooperState): LooperState {
  const unknown = { duplicateMode: null, quantize: null, midiClockStart: null, routing: null };
  return patch(looper, unknown);
}

/**
 * Применяет события, наступившие к моменту `time`: запись, взведённая
 * QUANTIZE, начинается в {@link LooperState.armedUntil}; запись новой петли
 * завершается в {@link LooperState.recordEndsAt} или по истечении
 * {@link LOOPER_MAX_RECORD_MS}, и петля играет; петля с ONE SHOT
 * останавливается в {@link LooperState.stopsAt}.
 *
 * @returns исходный объект, если ничего не наступило.
 */
export function advanceLooper(looper: LooperState, time: number): LooperState {
  let next = looper;
  if (next.armed === 'record' && next.armedUntil !== null && time >= next.armedUntil) {
    next = beginRecording(next, next.armedUntil);
  }
  if (next.transport === 'recording') {
    const limit = next.recordStart === null ? Infinity : next.recordStart + LOOPER_MAX_RECORD_MS;
    const ends = Math.min(next.recordEndsAt ?? Infinity, limit);
    if (time >= ends) {
      next = finishRecording(next, ends, true);
    }
  }
  if (next.stopsAt !== null && time >= next.stopsAt && isPlayback(next.transport)) {
    next = { ...stopPlayback(next), undo: next.transport === 'playing' ? next.undo : 'UNDO' };
  }
  return next;
}

/**
 * Нажатие RECORD/OVERDUB (CC#53 = 64–127, футсвитч RECORD).
 *
 * Без петли или у остановленной петли начинает запись новой петли: при MIDI
 * CLOCK START = On — взводит её до MIDI Start; при QUANTIZE — с первой доли
 * следующего такта по сетке `grid` (взводит до неё; если сетка неизвестна,
 * запись идёт с неизвестного момента). Во время записи завершает её, и петля
 * играет; при QUANTIZE запись доводится до конца такта. Во время
 * воспроизведения включает и выключает OVERDUB.
 */
export function looperRecord(looper: LooperState, time: number, grid: BarGrid): LooperResult {
  if (looper.armed !== null) {
    return ignored(looper, `RECORD без действия — ${armedReason(looper)}`);
  }
  switch (looper.transport) {
    case 'empty':
    case 'stopped':
      return startNewLoop(looper, time, grid);
    case 'recording':
      return finishNewLoop(looper, time, grid, '');
    case 'playing':
      return applied({ ...looper, transport: 'overdubbing' }, 'OVERDUB вкл');
    case 'overdubbing':
      return applied({ ...looper, transport: 'playing', undo: 'UNDO' }, 'OVERDUB выкл');
    case 'punching':
    case 'duplicating':
      return ignored(
        looper,
        `RECORD/OVERDUB во время ${PHASE_NAMES[looper.transport]} не документирован — без действия`,
      );
  }
}

/**
 * Значение 0–63 у CC#53 — «STOP active recording»: при RECORD MODE =
 * Momentary завершает запись новой петли, как {@link looperRecord}, при
 * OVERDUB MODE = Momentary выключает OVERDUB. В остальных случаях без
 * действия.
 */
export function looperRecordRelease(
  looper: LooperState,
  time: number,
  settings: QuadCortexSettings,
  grid: BarGrid,
): LooperResult {
  if (looper.transport === 'recording') {
    return settings.looperRecordMode === 'Momentary'
      ? finishNewLoop(looper, time, grid, ' (RECORD MODE = Momentary)')
      : ignored(looper, 'STOP по значению 0–63 действует только при RECORD MODE = Momentary — без действия');
  }
  if (looper.transport === 'overdubbing') {
    return settings.looperOverdubMode === 'Momentary'
      ? applied({ ...looper, transport: 'playing', undo: 'UNDO' }, 'OVERDUB выкл (OVERDUB MODE = Momentary)')
      : ignored(looper, 'STOP по значению 0–63 действует только при OVERDUB MODE = Momentary — без действия');
  }
  return ignored(looper, 'значение 0–63 без действия — нет активной записи');
}

/**
 * Нажатие PLAY/STOP (CC#54, футсвитч PLAY): остановленная петля начинает
 * играть с начала (при MIDI CLOCK START = On — взводится до MIDI Start),
 * звучащая или записываемая — сразу останавливается. Без петли — без
 * действия.
 */
export function looperPlayStop(looper: LooperState, time: number): LooperResult {
  if (looper.armed !== null) {
    return ignored(looper, `PLAY/STOP без действия — ${armedReason(looper)}`);
  }
  switch (looper.transport) {
    case 'empty':
      return ignored(looper, 'PLAY без действия — петля не записана');
    case 'stopped':
      return looper.midiClockStart === true
        ? applied(
            { ...looper, armed: 'play' },
            'PLAY — Armed, воспроизведение начнётся по MIDI Start (MIDI CLOCK START = On)',
          )
        : applied(startPlayback(looper, time), 'PLAY — воспроизведение');
    case 'recording':
      return applied(finishRecording(looper, time, false), 'запись завершена, STOP');
    case 'playing':
      return applied(stopPlayback(looper), 'STOP — петля остановлена');
    default:
      return applied(
        { ...stopPlayback(looper), undo: 'UNDO' },
        `STOP — петля остановлена, ${PHASE_NAMES[looper.transport]} выкл`,
      );
  }
}

/**
 * Нажатие DUPLICATE (CC#49, футсвитч DUPLICATE): во время воспроизведения
 * включает наложение, удваивающее длину петли (при MIDI CLOCK START = On —
 * взводит до MIDI Start), во время DUPLICATE — выключает его.
 */
export function looperDuplicate(looper: LooperState, time: number): LooperResult {
  if (looper.transport === 'duplicating') {
    return applied({ ...looper, transport: 'playing', undo: 'UNDO' }, 'DUPLICATE выкл');
  }
  if (looper.armed !== null) {
    return ignored(looper, `DUPLICATE без действия — ${armedReason(looper)}`);
  }
  if (looper.transport === 'playing' || looper.transport === 'overdubbing') {
    return looper.midiClockStart === true
      ? applied({ ...looper, armed: 'duplicate' }, 'DUPLICATE — Armed, начнётся по MIDI Start (MIDI CLOCK START = On)')
      : applied(beginDuplicate(looper, time), 'DUPLICATE вкл — наложение удваивает длину петли');
  }
  return ignored(looper, 'DUPLICATE без действия — петля не воспроизводится');
}

/**
 * Нажатие RE-LOOP (только футсвитчем): при DUPLICATE укорачивает петлю и
 * выключает DUPLICATE; новая длина неизвестна.
 */
export function looperReLoop(looper: LooperState): LooperResult {
  if (looper.transport !== 'duplicating') {
    return ignored(looper, 'RE-LOOP без действия — доступен только при активном DUPLICATE');
  }
  return applied(
    { ...looper, transport: 'playing', length: null, loopStart: null, stopsAt: null, undo: 'UNDO' },
    'RE-LOOP — петля укорочена, DUPLICATE выкл',
  );
}

/**
 * Нажатие PUNCH IN/OUT (CC#52 = 64–127, футсвитч PUNCH IN): во время
 * воспроизведения начинает запись с заменой звука петли, повторное —
 * PUNCH OUT.
 */
export function looperPunch(looper: LooperState): LooperResult {
  switch (looper.transport) {
    case 'punching':
      return applied({ ...looper, transport: 'playing', undo: 'UNDO' }, 'PUNCH OUT');
    case 'playing':
    case 'overdubbing':
      return applied(
        { ...looper, transport: 'punching', undo: looper.transport === 'overdubbing' ? 'UNDO' : looper.undo },
        'PUNCH IN — запись с заменой звука петли',
      );
    case 'duplicating':
      return ignored(looper, 'PUNCH IN во время DUPLICATE не документирован — без действия');
    default:
      return ignored(looper, 'PUNCH IN без действия — петля не воспроизводится');
  }
}

/** Значение 0–63 у CC#52 — PUNCH OUT: действует только во время PUNCH IN при PUNCH MODE = Momentary. */
export function looperPunchRelease(looper: LooperState, settings: QuadCortexSettings): LooperResult {
  if (looper.transport !== 'punching') {
    return ignored(looper, 'PUNCH OUT без действия — PUNCH IN не активен');
  }
  return settings.looperPunchMode === 'Momentary'
    ? applied({ ...looper, transport: 'playing', undo: 'UNDO' }, 'PUNCH OUT (PUNCH MODE = Momentary)')
    : ignored(looper, 'PUNCH OUT по значению 0–63 действует только при PUNCH MODE = Momentary — без действия');
}

/**
 * Переключает ONE SHOT (CC#50, футсвитч ONE SHOT). Включённый во время
 * воспроизведения останавливает петлю в конце текущего прохода; включённый
 * у остановленной петли — следующее воспроизведение будет однократным.
 */
export function looperOneShot(looper: LooperState, time: number): LooperResult {
  const oneShot = !looper.oneShot;
  const next = withStopsAt({ ...looper, oneShot }, time);
  if (!oneShot) {
    return applied(next, 'ONE SHOT выкл');
  }
  const text = isPlayback(looper.transport) ? 'ONE SHOT вкл — петля остановится после конца записи' : 'ONE SHOT вкл';
  return applied(next, text);
}

/** Переключает HALF SPEED (CC#51, футсвитч HALF SPEED); позиция в петле сохраняется. */
export function looperHalfSpeed(looper: LooperState, time: number): LooperResult {
  const halfSpeed = !looper.halfSpeed;
  const before = period(looper);
  let loopStart = looper.loopStart;
  if (before !== null && before > 0 && loopStart !== null) {
    const position = ((time - loopStart) % before) / before;
    loopStart = time - position * (halfSpeed ? before * 2 : before / 2);
  }
  const next = withStopsAt({ ...looper, halfSpeed, loopStart }, time);
  return applied(next, halfSpeed ? 'HALF SPEED вкл' : 'HALF SPEED выкл');
}

/** Переключает REVERSE (CC#55, футсвитч REVERSE). */
export function looperReverse(looper: LooperState): LooperResult {
  const reverse = !looper.reverse;
  if (!reverse) {
    return applied({ ...looper, reverse }, 'REVERSE выкл');
  }
  const text = isPlayback(looper.transport)
    ? 'REVERSE вкл'
    : 'REVERSE вкл — петля пойдёт в обратную сторону после PLAY';
  return applied({ ...looper, reverse }, text);
}

/** Нажатие UNDO/REDO (CC#56, футсвитч UNDO): отменяет последнюю запись или наложение, затем возвращает их. */
export function looperUndo(looper: LooperState): LooperResult {
  switch (looper.undo) {
    case null:
      return ignored(looper, 'UNDO без действия — отменять нечего');
    case 'UNDO':
      return applied({ ...looper, undo: 'REDO' }, 'UNDO — последняя запись или наложение отменены');
    case 'REDO':
      return applied({ ...looper, undo: 'UNDO' }, 'REDO — отменённое возвращено');
  }
}

/**
 * Выполняет действие, взведённое до MIDI Start.
 *
 * @returns null, если ничего не взведено до MIDI Start (в том числе если
 *   запись ждёт первой доли такта по QUANTIZE).
 */
export function looperMidiStart(looper: LooperState, time: number): LooperResult | null {
  if (looper.armedUntil !== null) {
    return null;
  }
  switch (looper.armed) {
    case null:
      return null;
    case 'record':
      return applied(beginRecording(looper, time), 'запись по MIDI Start (MIDI CLOCK START = On)');
    case 'play':
      return applied(
        { ...startPlayback(looper, time), armed: null },
        'воспроизведение по MIDI Start (MIDI CLOCK START = On)',
      );
    case 'duplicate':
      return isPlayback(looper.transport)
        ? applied({ ...beginDuplicate(looper, time), armed: null }, 'DUPLICATE по MIDI Start (MIDI CLOCK START = On)')
        : applied({ ...looper, armed: null }, 'DUPLICATE отменён: петля не воспроизводится');
  }
}

/**
 * Выполняет действие футсвитча Looper X (Perform) так же, как нажатие на
 * приборе.
 *
 * @param grid сетка тактов для RECORD при QUANTIZE.
 */
export function looperAction(looper: LooperState, action: LooperAction, time: number, grid: BarGrid): LooperResult {
  switch (action) {
    case 'DUPLICATE':
      return looperDuplicate(looper, time);
    case 'RE-LOOP':
      return looperReLoop(looper);
    case 'ONE SHOT':
      return looperOneShot(looper, time);
    case 'HALF SPEED':
      return looperHalfSpeed(looper, time);
    case 'PUNCH IN':
      return looperPunch(looper);
    case 'RECORD':
      return looperRecord(looper, time, grid);
    case 'PLAY':
      return looperPlayStop(looper, time);
    case 'REVERSE':
      return looperReverse(looper);
    case 'UNDO':
      return looperUndo(looper);
  }
}

/** Возвращает подпись и подсветку плитки действия в Looper X (Perform). */
export function looperTile(looper: LooperState, action: LooperAction): LooperTile {
  const playing = isPlayback(looper.transport);
  switch (action) {
    case 'DUPLICATE':
      return { label: action, active: looper.transport === 'duplicating' };
    case 'RE-LOOP':
      return { label: action, active: false };
    case 'ONE SHOT':
      return { label: action, active: looper.oneShot };
    case 'HALF SPEED':
      return { label: action, active: looper.halfSpeed };
    case 'PUNCH IN':
      return looper.transport === 'punching' ? { label: 'PUNCH OUT', active: true } : { label: action, active: false };
    case 'RECORD':
      return {
        label: playing ? 'OVERDUB' : 'RECORD',
        active: looper.transport === 'recording' || looper.transport === 'overdubbing',
      };
    case 'PLAY':
      return { label: playing || looper.transport === 'recording' ? 'STOP' : 'PLAY', active: playing };
    case 'REVERSE':
      return { label: action, active: looper.reverse };
    case 'UNDO':
      return { label: looper.undo === 'REDO' ? 'REDO' : 'UNDO', active: false };
  }
}

/** Возвращает значение QUANTIZE для журнала: `Off`, `1 доля`, `4 доли`, `16 долей`. */
export function quantizeText(beats: number): string {
  if (beats === 0) {
    return 'Off';
  }
  const word = beats === 1 ? 'доля' : beats <= 4 ? 'доли' : 'долей';
  return `${beats} ${word}`;
}

function applied(looper: LooperState, text: string): LooperResult {
  return { looper, effect: 'applied', text };
}

function ignored(looper: LooperState, text: string): LooperResult {
  return { looper, effect: 'ignored', text };
}

/** Чего ждёт взведённое действие — для описания отказа. */
function armedReason(looper: LooperState): string {
  return looper.armedUntil !== null
    ? 'запись ждёт первой доли такта (QUANTIZE)'
    : 'взведённое действие ждёт MIDI Start';
}

/** Период прохода петли с учётом HALF SPEED, мс; null — длина неизвестна. */
function period(looper: LooperState): number | null {
  return looper.length === null ? null : looper.length * (looper.halfSpeed ? 2 : 1);
}

/** Длина такта по QUANTIZE и темпу сетки, мс; null — QUANTIZE выключен или неизвестен либо темп неизвестен. */
function barLength(looper: LooperState, grid: BarGrid): number | null {
  const beats = looper.quantize;
  if (beats === null || beats === 0 || grid.bpm === null || grid.bpm <= 0) {
    return null;
  }
  return (beats * 60000) / grid.bpm;
}

/** Начинает запись новой петли: без MIDI CLOCK START и QUANTIZE — сразу, иначе взводит её. */
function startNewLoop(looper: LooperState, time: number, grid: BarGrid): LooperResult {
  if (looper.midiClockStart === true) {
    return applied(
      { ...looper, armed: 'record' },
      'RECORD — Armed, запись начнётся по MIDI Start (MIDI CLOCK START = On)',
    );
  }
  if (looper.quantize === null || looper.quantize === 0) {
    return applied(beginRecording(looper, time), 'RECORD — запись новой петли');
  }
  const quantize = `QUANTIZE = ${quantizeText(looper.quantize)}`;
  const bar = barLength(looper, grid);
  if (bar === null || grid.downbeatTime === null) {
    return applied(
      { ...beginRecording(looper, time), recordStart: null },
      `RECORD — запись новой петли с первой доли такта (${quantize}), момент начала неизвестен: темп неизвестен`,
    );
  }
  const bars = Math.ceil((time - grid.downbeatTime - GRID_TOLERANCE_MS) / bar);
  const startsAt = grid.downbeatTime + bars * bar;
  if (startsAt - time < GRID_TOLERANCE_MS) {
    return applied(beginRecording(looper, time), `RECORD — запись новой петли с первой доли такта (${quantize})`);
  }
  return applied(
    { ...looper, armed: 'record', armedUntil: startsAt },
    `RECORD — Armed, запись начнётся с первой доли следующего такта (${quantize})`,
  );
}

/**
 * Завершает запись новой петли, и петля играет. При QUANTIZE и известных
 * начале записи и темпе запись доводится до конца такта.
 *
 * @param note пометка в конце описания.
 */
function finishNewLoop(looper: LooperState, time: number, grid: BarGrid, note: string): LooperResult {
  if (looper.recordEndsAt !== null) {
    return ignored(looper, `запись уже завершается в конце такта (QUANTIZE) — без действия${note}`);
  }
  const bar = barLength(looper, grid);
  if (bar !== null && looper.recordStart !== null) {
    const bars = Math.max(1, Math.ceil((time - looper.recordStart - GRID_TOLERANCE_MS) / bar));
    const endsAt = looper.recordStart + bars * bar;
    if (endsAt - time >= GRID_TOLERANCE_MS) {
      const quantize = `QUANTIZE = ${quantizeText(looper.quantize ?? 0)}`;
      return applied(
        { ...looper, recordEndsAt: endsAt },
        `запись завершится в конце такта (${quantize}), затем воспроизведение${note}`,
      );
    }
  }
  return applied(finishRecording(looper, time, true), `запись завершена, воспроизведение${note}`);
}

/** Пересчитывает момент остановки ONE SHOT: конец текущего прохода звучащей петли. */
function withStopsAt(looper: LooperState, time: number): LooperState {
  let stopsAt: number | null = null;
  const p = period(looper);
  if (looper.oneShot && isPlayback(looper.transport) && p !== null && p > 0 && looper.loopStart !== null) {
    stopsAt = looper.loopStart + (Math.floor((time - looper.loopStart) / p) + 1) * p;
  }
  return looper.stopsAt === stopsAt ? looper : { ...looper, stopsAt };
}

function beginRecording(looper: LooperState, time: number): LooperState {
  return {
    ...looper,
    transport: 'recording',
    armed: null,
    armedUntil: null,
    recordStart: time,
    recordEndsAt: null,
    length: null,
    loopStart: null,
    stopsAt: null,
    undo: null,
  };
}

/** Завершает запись новой петли в момент `time`: петля играет с начала или остановлена. */
function finishRecording(looper: LooperState, time: number, play: boolean): LooperState {
  const length = looper.recordStart === null ? null : time - looper.recordStart;
  const recorded: LooperState = { ...looper, length, recordStart: null, recordEndsAt: null, undo: 'UNDO' };
  return play ? startPlayback(recorded, time) : stopPlayback(recorded);
}

function startPlayback(looper: LooperState, time: number): LooperState {
  return withStopsAt({ ...looper, transport: 'playing', loopStart: time, stopsAt: null }, time);
}

function stopPlayback(looper: LooperState): LooperState {
  return { ...looper, transport: 'stopped', loopStart: null, stopsAt: null };
}

/** Начинает DUPLICATE: длина петли удваивается, позиция воспроизведения сохраняется. */
function beginDuplicate(looper: LooperState, time: number): LooperState {
  const p = period(looper);
  const loopStart =
    p !== null && p > 0 && looper.loopStart !== null ? time - ((time - looper.loopStart) % p) : looper.loopStart;
  const next: LooperState = {
    ...looper,
    transport: 'duplicating',
    length: looper.length === null ? null : looper.length * 2,
    loopStart,
    undo: looper.transport === 'overdubbing' ? 'UNDO' : looper.undo,
  };
  return withStopsAt(next, time);
}
