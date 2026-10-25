/** Темп Quad Cortex: Tap Tempo (CC#44), синхронизация к внешнему MIDI Clock и окно Tempo. */

import { CLOCK_PPQN } from '../../clock.ts';
import type { ClockInfo } from '../types.ts';
import type { Outcome } from './outcome.ts';
import { closeScreen, formatBpm, openScreen, outcome, patch } from './outcome.ts';
import type { QuadCortexSettings } from './settings.ts';
import type { QuadCortexState, TempoLed, TempoState } from './state.ts';

/**
 * Наибольший интервал между ударами Tap Tempo одной серии, мс. Удар позже
 * начинает новую серию и темп не меняет (значение — допущение: на приборе
 * не документировано).
 */
export const TAP_SERIES_MS = 2000;

/** Верхний предел темпа Tap Tempo, BPM (по форуму): более быстрые удары дают 240 BPM. */
export const TAP_MAX_BPM = 240;

/** Запас сверх периода доли, после которого MIDI Clock считается остановленным, мс. */
const CLOCK_LOSS_SLACK_MS = 500;

/** Период доли для обнаружения остановки, пока темп внешнего MIDI Clock не определён, мс (30 BPM). */
const CLOCK_LOSS_UNKNOWN_BEAT_MS = 2000;

/** Создаёт темп только что включённого прибора: темп неизвестен, ударов и MIDI Clock не было. */
export function initialTempo(): TempoState {
  return {
    bpm: null,
    source: null,
    beatTime: null,
    downbeatTime: null,
    led: 'green',
    taps: 0,
    lastTapTime: null,
    clockSynced: false,
    internalBpm: null,
    internalBeatTime: null,
    clockSeen: null,
    nextBeatTick: null,
    downbeatTick: null,
    windowClosesAt: null,
  };
}

/**
 * Проверяет, принимает ли прибор внешний MIDI Clock: MIDI Clock In = On и
 * MIDI Clock Out = OFF. При передаче собственного clock приём не
 * документирован и не моделируется.
 */
export function acceptsClock(settings: QuadCortexSettings): boolean {
  return settings.midiClockIn && settings.midiClockOut === 'OFF';
}

/**
 * Применяет к состоянию события, наступившие к моменту `time` без
 * сообщений: окно Tempo закрывается в {@link TempoState.windowClosesAt};
 * синхронизация к MIDI Clock прекращается, если доля не пришла дольше
 * периода доли и 500 мс, и прибор возвращается к внутреннему темпу.
 *
 * @returns исходное состояние, если ничего не наступило.
 */
export function advanceTempo(state: QuadCortexState, time: number): QuadCortexState {
  let next = state;
  const closesAt = next.tempo.windowClosesAt;
  if (closesAt !== null && time >= closesAt) {
    next = { ...next, screens: closeScreen(next.screens, 'tempo'), tempo: { ...next.tempo, windowClosesAt: null } };
  }
  const tempo = next.tempo;
  if (tempo.clockSynced && tempo.clockSeen !== null) {
    const beat = tempo.bpm !== null ? 60000 / tempo.bpm : CLOCK_LOSS_UNKNOWN_BEAT_MS;
    if (time - tempo.clockSeen > beat + CLOCK_LOSS_SLACK_MS) {
      next = { ...next, tempo: leaveClock(tempo) };
    }
  }
  return next;
}

/**
 * Обрабатывает удар Tap Tempo (CC#44).
 *
 * Первый удар серии только запоминается (`pending`). Каждый следующий не
 * позже {@link TAP_SERIES_MS} задаёт темп 60 000 / интервал до предыдущего
 * удара, не выше {@link TAP_MAX_BPM}, и фазу мигания TEMPO, открывает окно
 * Tempo поверх остальных экранов и откладывает его автозакрытие. При
 * синхронизации к внешнему MIDI Clock удар игнорируется.
 *
 * @param note пометка в конце описания, например о возможном отпускании
 *   кнопки контроллера; пустая строка — без пометки.
 */
export function tapTempo(state: QuadCortexState, time: number, settings: QuadCortexSettings, note: string): Outcome {
  const tempo = state.tempo;
  if (tempo.clockSynced) {
    return outcome(state, 'ignored', `Tap Tempo не действует: темп задаёт внешний MIDI Clock (по форуму)${note}`);
  }
  const closesAt = settings.tempoWindowMs > 0 ? time + settings.tempoWindowMs : null;
  const last = tempo.lastTapTime;
  if (last === null || time - last > TAP_SERIES_MS) {
    const windowClosesAt = state.screens.includes('tempo') ? closesAt : tempo.windowClosesAt;
    const next = patch(state, { tempo: { ...tempo, taps: 1, lastTapTime: time, windowClosesAt } });
    return outcome(next, 'pending', `Tap Tempo: удар 1 — темп определится по следующему удару${note}`);
  }
  const interval = time - last;
  const raw = interval > 0 ? 60000 / interval : Infinity;
  const limited = raw > TAP_MAX_BPM;
  const bpm = limited ? TAP_MAX_BPM : Math.round(raw * 10) / 10;
  const taps = tempo.taps + 1;
  const next: QuadCortexState = {
    ...state,
    screens: openScreen(state.screens, 'tempo'),
    tempo: {
      ...tempo,
      bpm,
      source: 'tap',
      beatTime: time,
      downbeatTime: time,
      taps,
      lastTapTime: time,
      windowClosesAt: closesAt,
    },
  };
  const limit = limited ? ` (предел Tap Tempo — ${TAP_MAX_BPM} BPM, по форуму)` : '';
  return outcome(next, 'applied', `Tap Tempo: удар ${taps}, темп ${formatBpm(bpm)} BPM${limit}${note}`);
}

/**
 * Обрабатывает импульс Timing Clock.
 *
 * Если прибор принимает MIDI Clock ({@link acceptsClock}), первый импульс
 * начинает синхронизацию: светодиод TEMPO синий, окно Tempo закрывается,
 * внутренний темп запоминается до остановки clock, а сам импульс — доля и
 * первая доля такта, если до него не было MIDI Start. Темп берётся из
 * `clock.bpm`, как только он известен, и далее обновляется на каждой доле —
 * каждом 24-м импульсе. Иначе импульс игнорируется.
 *
 * @param clock MIDI Clock с учётом этого импульса.
 */
export function clockTick(
  state: QuadCortexState,
  time: number,
  clock: ClockInfo,
  settings: QuadCortexSettings,
): Outcome {
  if (!settings.midiClockIn) {
    return outcome(state, 'ignored', 'Timing Clock не принимается: MIDI Clock In = Off');
  }
  if (!acceptsClock(settings)) {
    return outcome(
      state,
      'ignored',
      `Timing Clock не применяется: включён MIDI Clock Out (${settings.midiClockOut}), ` +
        'приём при передаче не документирован',
    );
  }
  let tempo = state.tempo;
  let screens = state.screens;
  if (!tempo.clockSynced) {
    tempo = {
      ...tempo,
      bpm: clock.bpm,
      source: 'clock',
      beatTime: null,
      downbeatTime: null,
      clockSynced: true,
      internalBpm: tempo.bpm,
      internalBeatTime: tempo.bpm === null ? null : tempo.beatTime,
      clockSeen: time,
      nextBeatTick: tempo.nextBeatTick ?? clock.ticks,
      downbeatTick: tempo.downbeatTick ?? clock.ticks,
      windowClosesAt: null,
    };
    screens = closeScreen(screens, 'tempo');
  }
  const beatTick = tempo.nextBeatTick;
  if (beatTick !== null && clock.ticks >= beatTick) {
    const nextBeatTick = beatTick + (Math.floor((clock.ticks - beatTick) / CLOCK_PPQN) + 1) * CLOCK_PPQN;
    tempo = { ...tempo, beatTime: time, clockSeen: time, nextBeatTick, bpm: clock.bpm ?? tempo.bpm };
    if (tempo.downbeatTick !== null && clock.ticks >= tempo.downbeatTick) {
      tempo = { ...tempo, downbeatTime: time, downbeatTick: null };
    }
  } else if (clock.bpm !== null && tempo.bpm === null) {
    tempo = { ...tempo, bpm: clock.bpm };
  }
  const next = patch(state, { tempo, screens });
  const text =
    tempo.bpm !== null
      ? `Timing Clock: темп ${formatBpm(tempo.bpm)} BPM по внешнему MIDI Clock`
      : 'Timing Clock: синхронизация к внешнему MIDI Clock, темп ещё не определён';
  return outcome(next, 'applied', text);
}

/**
 * Учитывает MIDI Start: если прибор принимает MIDI Clock
 * ({@link acceptsClock}), доли и такты отсчитываются заново — следующий
 * импульс Timing Clock становится первой долей такта.
 *
 * @returns исходное состояние, если прибор не принимает MIDI Clock.
 */
export function clockStart(state: QuadCortexState, clock: ClockInfo, settings: QuadCortexSettings): QuadCortexState {
  if (!acceptsClock(settings)) {
    return state;
  }
  const tick = clock.ticks + 1;
  return patch(state, { tempo: patch(state.tempo, { nextBeatTick: tick, downbeatTick: tick }) });
}

/**
 * Возвращает темп после загрузки пресета или смены сцены. При TEMPO MODE =
 * PRESET темп задаёт пресет (и сцена, если темп назначен на сцены), поэтому
 * внутренний темп становится неизвестным: без синхронизации — и действующий,
 * при синхронизации — только тот, к которому прибор вернётся после остановки
 * MIDI Clock. При TEMPO MODE = GLOBAL темп не меняется.
 */
export function tempoAfterRecall(tempo: TempoState, settings: QuadCortexSettings): TempoState {
  if (settings.tempoMode !== 'PRESET') {
    return tempo;
  }
  if (tempo.clockSynced) {
    return patch(tempo, { internalBpm: null, internalBeatTime: null });
  }
  return patch(tempo, { bpm: null, source: null, beatTime: null, downbeatTime: null });
}

/**
 * Возвращает темп после смены настроек. Если прибор больше не принимает
 * MIDI Clock ({@link acceptsClock}), синхронизация прекращается и прибор
 * возвращается к внутреннему темпу. Автозакрытие открытого окна Tempo
 * отсчитывается от последнего удара с новой длительностью.
 */
export function tempoForSettings(state: QuadCortexState, settings: QuadCortexSettings): TempoState {
  let tempo = state.tempo;
  if (!acceptsClock(settings)) {
    tempo = tempo.clockSynced ? leaveClock(tempo) : patch(tempo, { nextBeatTick: null, downbeatTick: null });
  }
  if (state.screens.includes('tempo') && tempo.lastTapTime !== null) {
    const windowClosesAt = settings.tempoWindowMs > 0 ? tempo.lastTapTime + settings.tempoWindowMs : null;
    tempo = patch(tempo, { windowClosesAt });
  }
  return tempo;
}

/** Возвращает цвет светодиода TEMPO по настройкам и синхронизации. */
export function tempoLed(tempo: TempoState, settings: QuadCortexSettings): TempoLed {
  if (!settings.tempoLed) {
    return 'off';
  }
  if (settings.midiClockOut !== 'OFF') {
    return 'red';
  }
  return tempo.clockSynced ? 'blue' : 'green';
}

/** Прекращает синхронизацию к MIDI Clock: действует внутренний темп, запомненный при её начале. */
function leaveClock(tempo: TempoState): TempoState {
  const bpm = tempo.internalBpm;
  const beatTime = bpm === null ? null : tempo.internalBeatTime;
  return {
    ...tempo,
    bpm,
    source: bpm === null ? null : 'tap',
    beatTime,
    downbeatTime: beatTime,
    clockSynced: false,
    internalBpm: null,
    internalBeatTime: null,
    clockSeen: null,
    nextBeatTick: null,
    downbeatTick: null,
  };
}
