/**
 * Величины изображения Quad Cortex, которые меняются со временем между
 * сообщениями: доля такта в окне Tempo, позиция и запись петли Looper X,
 * свободное время записи.
 */

import type { LooperState, QuadCortexState, TempoState } from '../../../core/devices/quadCortex/engine.ts';
import { LOOPER_MAX_RECORD_MS, quadCortexAt } from '../../../core/devices/quadCortex/engine.ts';
import { tempoBlink, tempoLit } from './leds.ts';

/** Долей в такте на точках окна Tempo: размер по умолчанию 4/4, настоящий размер по MIDI не узнать. */
export const BEATS_PER_BAR = 4;

/**
 * Ход Looper X: `recording` — запись новой петли с известным началом,
 * `loop` — воспроизведение петли известной длины.
 */
export type LooperProgress =
  | {
      kind: 'recording';
      /** Сколько идёт запись, мс. */
      elapsed: number;
    }
  | {
      kind: 'loop';
      /** Позиция воспроизведения 0–1 от начала петли; при REVERSE отсчитывается от конца. */
      position: number;
      /** Длина петли при обычной скорости, мс. */
      length: number;
    };

/**
 * Возвращает номер текущей доли в такте 0–3 для точек окна Tempo.
 *
 * Доли отсчитываются от первой доли такта `tempo.downbeatTime`, без неё — от
 * доли `tempo.beatTime`.
 *
 * @param now момент, миллисекунды Unix-времени.
 * @returns null, если темп или фаза долей неизвестны.
 */
export function beatInBar(tempo: TempoState, now: number): number | null {
  const origin = tempo.downbeatTime ?? tempo.beatTime;
  if (tempo.bpm === null || tempo.bpm <= 0 || origin === null) {
    return null;
  }
  const beat = Math.floor((now - origin) / (60000 / tempo.bpm));
  return ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
}

/**
 * Возвращает ход Looper X в момент `now`.
 *
 * Позиция петли учитывает HALF SPEED (петля идёт вдвое дольше) и REVERSE.
 *
 * @param looper Looper X на момент `now` (см. `quadCortexAt`).
 * @returns null, если петля не пишется и не звучит или её начало либо длина неизвестны.
 */
export function looperProgress(looper: LooperState, now: number): LooperProgress | null {
  if (looper.transport === 'recording') {
    return looper.recordStart === null ? null : { kind: 'recording', elapsed: Math.max(0, now - looper.recordStart) };
  }
  const playing = ['playing', 'overdubbing', 'punching', 'duplicating'].includes(looper.transport);
  if (!playing || looper.loopStart === null || looper.length === null || looper.length <= 0) {
    return null;
  }
  const period = looper.length * (looper.halfSpeed ? 2 : 1);
  const position = ((((now - looper.loopStart) % period) + period) % period) / period;
  return { kind: 'loop', position: looper.reverse ? 1 - position : position, length: looper.length };
}

/**
 * Возвращает свободное время записи Looper X (надпись AVAILABLE): наибольшая
 * длина записи за вычетом идущей записи или записанной петли.
 *
 * @param looper Looper X на момент `now` (см. `quadCortexAt`).
 * @param now момент, миллисекунды Unix-времени.
 * @returns мс не меньше 0; null, если длина петли или начало записи неизвестны.
 */
export function looperAvailable(looper: LooperState, now: number): number | null {
  if (looper.transport === 'empty') {
    return LOOPER_MAX_RECORD_MS;
  }
  if (looper.transport === 'recording') {
    return looper.recordStart === null ? null : Math.max(0, LOOPER_MAX_RECORD_MS - (now - looper.recordStart));
  }
  return looper.length === null ? null : Math.max(0, LOOPER_MAX_RECORD_MS - looper.length);
}

/**
 * Возвращает ключ изображения в момент `now`: ключ меняется, когда меняется
 * что-либо из нарисованного — состояние на этот момент, вспышка TEMPO, доля
 * такта в открытом окне Tempo, время записи петли (с шагом 0,1 с на экране
 * Looper X, иначе 1 с) и позиция петли на экране Looper X (с шагом 50 мс).
 *
 * @param state состояние модели на момент последнего сообщения.
 * @param now момент не раньше последнего сообщения, миллисекунды Unix-времени.
 */
export function timeKey(state: QuadCortexState, now: number): string {
  const shown = quadCortexAt(state, now);
  const top = shown.screens.at(-1);
  const progress = looperProgress(shown.looper, now);
  let step = '';
  if (progress?.kind === 'recording') {
    step = String(Math.floor(progress.elapsed / (top === 'looper' ? 100 : 1000)));
  } else if (progress?.kind === 'loop' && top === 'looper') {
    step = String(Math.floor((progress.position * progress.length) / 50));
  }
  return [
    shown === state ? '' : JSON.stringify(shown),
    tempoLit(tempoBlink(shown.tempo), now),
    top === 'tempo' ? beatInBar(shown.tempo, now) : '',
    step,
  ].join('|');
}

/**
 * Проверяет, меняется ли изображение со временем без новых сообщений: мигает
 * TEMPO, в открытом окне Tempo идут доли или оно ждёт автозакрытия, идёт
 * синхронизация к MIDI Clock или петля Looper X пишется, звучит либо ждёт
 * старта.
 */
export function changesOverTime(state: QuadCortexState): boolean {
  const { tempo, looper } = state;
  return (
    tempoBlink(tempo) !== null ||
    (state.screens.at(-1) === 'tempo' && tempo.bpm !== null) ||
    tempo.windowClosesAt !== null ||
    tempo.clockSynced ||
    looper.armed !== null ||
    !['empty', 'stopped'].includes(looper.transport)
  );
}

/**
 * Форматирует длительность как на экране прибора: `4:38`, с десятыми — `0:04.2`.
 *
 * @param ms длительность, мс; отрицательная считается нулём.
 * @param tenths показывать ли десятые доли секунды.
 */
export function formatDuration(ms: number, tenths = false): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const text = tenths ? (Math.floor(seconds * 10) / 10).toFixed(1) : String(Math.floor(seconds));
  return `${minutes}:${text.padStart(tenths ? 4 : 2, '0')}`;
}
