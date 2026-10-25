/**
 * Темп HX Stomp: Tap Tempo, следование внешнему MIDI Clock и темп,
 * сохранённый в пресете или снапшоте.
 */

import { CLOCK_PPQN } from '../../clock.ts';
import type { Effect } from '../types.ts';
import type { HxOwnTempo, HxTempo } from './state.ts';

/** Наибольший интервал между ударами Tap Tempo, мс: удары реже — темп ниже 40 BPM — прибор не принимает. */
export const TAP_MAX_INTERVAL_MS = 1500;

/** Сколько последних ударов серии определяют темп. */
const TAP_WINDOW = 5;

/** Пауза между импульсами MIDI Clock, после которой прибор считает клок пропавшим, мс. */
export const CLOCK_LOST_MS = 250;

/** Результат удара Tap Tempo: новый темп и описание на русском. */
export interface TapResult {
  /** Тот же объект, если удар не подействовал. */
  tempo: HxTempo;
  text: string;
  effect: Effect;
}

/** Возвращает темп только что включённого прибора: темп неизвестен, ударов и клока не было. */
export function initialTempo(): HxTempo {
  return { bpm: null, source: null, beatTime: null, tap: { count: 0, times: [] }, own: null, clock: null };
}

/** Возвращает темп с одним знаком после точки, как на приборе: `120.0`. */
export function formatBpm(bpm: number): string {
  return bpm.toFixed(1);
}

/**
 * Применяет удар Tap Tempo.
 *
 * Удар после паузы дольше {@link TAP_MAX_INTERVAL_MS} или первый удар
 * начинают новую серию и темп не меняют. Следующие удары серии задают темп по
 * среднему интервалу между последними пятью ударами, округлённому до 0,1 BPM;
 * источник темпа становится `tap`, доля мигания — время удара.
 *
 * @param time время удара; удар не раньше предыдущего удара серии не
 *   действует.
 * @returns при следовании MIDI Clock и при ударе в момент предыдущего — тот
 *   же темп с effect `ignored`.
 */
export function tapTempo(tempo: HxTempo, time: number): TapResult {
  if (tempo.clock) {
    return {
      tempo,
      text: 'Tap Tempo не действует: темп задаёт внешний MIDI Clock (по форуму Line 6)',
      effect: 'ignored',
    };
  }
  const times = tempo.tap.times;
  const last = times.length > 0 ? times[times.length - 1] : null;
  if (last !== null && time <= last) {
    return { tempo, text: 'Tap Tempo: удар в момент предыдущего — без действия', effect: 'ignored' };
  }
  if (last === null || time - last > TAP_MAX_INTERVAL_MS) {
    const text =
      last === null
        ? 'Tap Tempo: удар 1 — темп задаст следующий удар'
        : 'Tap Tempo: удар 1 новой серии — после паузы дольше 1,5 с (темп ниже 40 BPM удары не задают)';
    return { tempo: { ...tempo, tap: { count: 1, times: [time] } }, text, effect: 'applied' };
  }
  const series = [...times, time].slice(-TAP_WINDOW);
  const interval = (series[series.length - 1] - series[0]) / (series.length - 1);
  const bpm = Math.round(600000 / interval) / 10;
  const count = tempo.tap.count + 1;
  return {
    tempo: { ...tempo, bpm, source: 'tap', beatTime: time, tap: { count, times: series } },
    text: `Tap Tempo: удар ${count}, темп ${formatBpm(bpm)} BPM`,
    effect: 'applied',
  };
}

/**
 * Проверяет, пропал ли MIDI Clock, которому следует прибор: импульсов не было
 * дольше {@link CLOCK_LOST_MS} к моменту `time`.
 *
 * @returns false, если прибор клоку не следует.
 */
export function clockLost(tempo: HxTempo, time: number): boolean {
  return tempo.clock !== null && time - tempo.clock.lastTick > CLOCK_LOST_MS;
}

/** Результат импульса MIDI Clock. */
export interface ClockResult {
  tempo: HxTempo;
  /** true, если импульс начал следование: до него прибор клоку не следовал или клок пропадал. */
  started: boolean;
}

/**
 * Применяет импульс Timing Clock, который прибор принимает: прибор следует
 * клоку, действующий темп — `bpm`, доля мигания — первый импульс каждых 24
 * импульсов от начала следования. Собственный темп запоминается до
 * пропадания клока.
 *
 * @param time время импульса.
 * @param bpm темп по импульсам MIDI Clock; null, пока он не определён.
 */
export function followClock(tempo: HxTempo, time: number, bpm: number | null): ClockResult {
  const started = tempo.clock === null || time - tempo.clock.lastTick > CLOCK_LOST_MS;
  const ticks = started || tempo.clock === null ? 1 : tempo.clock.ticks + 1;
  const own: HxOwnTempo = tempo.own ?? {
    bpm: tempo.bpm,
    source: tempo.source === 'clock' ? null : tempo.source,
    beatTime: tempo.beatTime,
  };
  const beat = (ticks - 1) % CLOCK_PPQN === 0;
  return {
    tempo: {
      ...tempo,
      bpm,
      source: 'clock',
      beatTime: beat ? time : tempo.beatTime,
      own,
      clock: { ticks, lastTick: time },
    },
    started,
  };
}

/**
 * Возвращает темп после того, как прибор перестал следовать MIDI Clock:
 * действует запомненный собственный темп.
 */
export function leaveClock(tempo: HxTempo): HxTempo {
  const own = tempo.own;
  return {
    ...tempo,
    bpm: own ? own.bpm : null,
    source: own ? own.source : null,
    beatTime: own ? own.beatTime : null,
    own: null,
    clock: null,
  };
}

/**
 * Возвращает темп после того, как прибор вызвал темп, сохранённый в пресете
 * или снапшоте: значение неизвестно. Пока прибор следует MIDI Clock, вызванный
 * темп становится собственным, а действующим остаётся темп клока.
 *
 * @param source где хранился вызванный темп.
 */
export function recallTempo(tempo: HxTempo, source: 'preset' | 'snapshot'): HxTempo {
  if (tempo.clock) {
    return { ...tempo, own: { bpm: null, source, beatTime: null } };
  }
  return { ...tempo, bpm: null, source, beatTime: null };
}
