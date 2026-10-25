/**
 * Блок 1 Switch Looper HX Stomp и его MIDI-команды CC60–CC63, CC65, CC66.
 */

import type { Effect } from '../types.ts';
import type { HxLooper, HxLooperStatus, HxRing } from './state.ts';

/**
 * Контроллер команды лупера: 60 — Record/Overdub, 61 — Play/Stop, 62 — Play
 * Once, 63 — Undo/Redo, 65 — Forward/Reverse, 66 — Full/Half Speed.
 */
export type LooperController = 60 | 61 | 62 | 63 | 65 | 66;

/** Результат команды лупера: новое состояние лупера и описание на русском. */
export interface LooperResult {
  /** Тот же объект, если команда ничего не изменила. */
  looper: HxLooper;
  text: string;
  effect: Effect;
}

/**
 * Возвращает кольцо футсвитча лупера в состоянии `status`: запись — красное,
 * воспроизведение — зелёное, Overdub — янтарное, остановлен — белое, петли
 * нет — тускло-белое.
 */
export function looperRing(status: HxLooperStatus): HxRing {
  switch (status) {
    case 'recording':
      return { light: 'on', color: 'red' };
    case 'playing':
      return { light: 'on', color: 'green' };
    case 'overdubbing':
      return { light: 'on', color: 'amber' };
    case 'stopped':
      return { light: 'on', color: 'white' };
    case 'empty':
      return { light: 'dim', color: 'white' };
  }
}

/** Возвращает лупер без петли: Forward, Full Speed, отменять нечего. */
export function emptyLooper(): HxLooper {
  return {
    status: 'empty',
    playOnce: false,
    reverse: false,
    halfSpeed: false,
    undo: 'none',
    since: null,
    ring: looperRing('empty'),
  };
}

function done(looper: HxLooper, text: string): LooperResult {
  return { looper: { ...looper, ring: looperRing(looper.status) }, text, effect: 'applied' };
}

function same(looper: HxLooper, text: string): LooperResult {
  return { looper, text, effect: 'ignored' };
}

function record(l: HxLooper, time: number): LooperResult {
  if (l.status === 'recording') {
    return same(l, 'Looper: запись уже идёт — без действия');
  }
  const text = l.status === 'empty' ? 'Looper: запись' : 'Looper: запись новой петли вместо прежней (вывод)';
  return done({ ...l, status: 'recording', playOnce: false, undo: 'none', since: time }, text);
}

function overdub(l: HxLooper, time: number): LooperResult {
  switch (l.status) {
    case 'empty':
      return same(l, 'Looper Overdub: петли нет — без действия');
    case 'overdubbing':
      return same(l, 'Looper: Overdub уже идёт — без действия');
    case 'recording':
      return done({ ...l, status: 'overdubbing', undo: 'undo', since: time }, 'Looper: запись завершена, Overdub');
    case 'playing':
    case 'stopped':
      return done({ ...l, status: 'overdubbing', playOnce: false, undo: 'undo', since: time }, 'Looper: Overdub');
  }
}

function play(l: HxLooper, time: number): LooperResult {
  switch (l.status) {
    case 'empty':
      return same(l, 'Looper Play: петли нет — без действия');
    case 'playing':
      return l.playOnce
        ? done({ ...l, playOnce: false }, 'Looper: воспроизведение по кругу вместо Play Once')
        : same(l, 'Looper: воспроизведение уже идёт — без действия');
    case 'recording':
      return done({ ...l, status: 'playing', since: time }, 'Looper: запись завершена, воспроизведение');
    case 'overdubbing':
      return done({ ...l, status: 'playing', since: time }, 'Looper: Overdub завершён, воспроизведение');
    case 'stopped':
      return done({ ...l, status: 'playing', since: time }, 'Looper: воспроизведение');
  }
}

function stop(l: HxLooper, time: number): LooperResult {
  switch (l.status) {
    case 'empty':
      return same(l, 'Looper Stop: петли нет — без действия');
    case 'stopped':
      return same(l, 'Looper: уже остановлен — без действия');
    case 'recording':
      return done({ ...l, status: 'stopped', since: time }, 'Looper: запись завершена, остановлен');
    case 'playing':
    case 'overdubbing':
      return done({ ...l, status: 'stopped', playOnce: false, since: time }, 'Looper: остановлен');
  }
}

function playOnce(l: HxLooper, time: number): LooperResult {
  if (l.status === 'empty') {
    return same(l, 'Looper Play Once: петли нет — без действия');
  }
  const text =
    l.status === 'recording'
      ? 'Looper: запись завершена, Play Once — петля проиграется один раз'
      : 'Looper: Play Once — петля проиграется один раз с начала';
  return done({ ...l, status: 'playing', playOnce: true, since: time }, text);
}

function undoRedo(l: HxLooper, time: number): LooperResult {
  if (l.undo === 'undo') {
    return l.status === 'overdubbing'
      ? done(
          { ...l, status: 'playing', undo: 'redo', since: time },
          'Looper: Undo — текущий слой Overdub отменён, воспроизведение (вывод)',
        )
      : done({ ...l, undo: 'redo' }, 'Looper: Undo — последний слой Overdub отменён');
  }
  if (l.undo === 'redo') {
    return done({ ...l, undo: 'undo' }, 'Looper: Redo — слой Overdub возвращён');
  }
  return same(l, 'Looper Undo/Redo: отменять нечего — без действия');
}

/**
 * Выполняет команду лупера.
 *
 * Значения 64–127 и 0–63 у CC60 — Record и Overdub, у CC61 — Play и Stop, у
 * CC65 — Reverse и Forward, у CC66 — Half и Full Speed; CC62 (Play Once) и
 * CC63 (Undo/Redo) срабатывают только от 64–127. Команда, которая в текущем
 * состоянии ничего не меняет (Play без петли, повтор Reverse), возвращает тот
 * же лупер с effect `ignored`.
 *
 * @param value значение контроллера 0–127.
 * @param time время команды; становится `since` при смене `status`.
 */
export function looperCommand(
  looper: HxLooper,
  controller: LooperController,
  value: number,
  time: number,
): LooperResult {
  const high = value >= 64;
  switch (controller) {
    case 60:
      return high ? record(looper, time) : overdub(looper, time);
    case 61:
      return high ? play(looper, time) : stop(looper, time);
    case 62:
      return high
        ? playOnce(looper, time)
        : same(looper, `CC#62 = ${value}: Play Once срабатывает от значений 64–127 — без действия`);
    case 63:
      return high
        ? undoRedo(looper, time)
        : same(looper, `CC#63 = ${value}: Undo/Redo срабатывает от значений 64–127 — без действия`);
    case 65: {
      const name = high ? 'Reverse' : 'Forward';
      return looper.reverse === high
        ? same(looper, `Looper: уже ${name} — без действия`)
        : done({ ...looper, reverse: high }, `Looper: ${name}`);
    }
    case 66: {
      const name = high ? 'Half Speed' : 'Full Speed';
      return looper.halfSpeed === high
        ? same(looper, `Looper: уже ${name} — без действия`)
        : done({ ...looper, halfSpeed: high }, `Looper: ${name}`);
    }
  }
}
