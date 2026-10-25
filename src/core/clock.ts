import type { ClockInfo } from './devices/types.ts';

/** Импульсов Timing Clock на четвертную ноту по спецификации MIDI. */
export const CLOCK_PPQN = 24;

/** Интервал между импульсами, после которого поток считается прерванным, мс. */
const GAP_MS = 250;

/** Сколько последних интервалов усредняется — одна четверть. */
const WINDOW = CLOCK_PPQN;

/** Сколько интервалов нужно для первой оценки темпа. */
const MIN_INTERVALS = 6;

/**
 * Отслеживание MIDI Clock: темп по импульсам Timing Clock и состояние
 * транспорта по Start, Continue и Stop.
 *
 * Новый трекер не знает темпа, не видел транспортных сообщений и импульсов.
 */
export class ClockTracker {
  private intervals: number[] = [];
  private lastTick: number | null = null;
  private ticks = 0;
  private running: boolean | null = null;

  /**
   * Учитывает импульс Timing Clock.
   *
   * После паузы между импульсами длиннее 250 мс (темп ниже 10 BPM) оценка
   * темпа начинается заново.
   *
   * @param time время получения импульса, мс; не меньше времени предыдущего.
   */
  tick(time: number): void {
    this.ticks += 1;
    if (this.lastTick !== null) {
      const interval = time - this.lastTick;
      if (interval > GAP_MS || interval < 0) {
        this.intervals = [];
      } else {
        this.intervals.push(interval);
        if (this.intervals.length > WINDOW) {
          this.intervals.shift();
        }
      }
    }
    this.lastTick = time;
  }

  /** Учитывает Start или Continue: транспорт запущен. */
  start(): void {
    this.running = true;
  }

  /** Учитывает Stop: транспорт остановлен. */
  stop(): void {
    this.running = false;
  }

  /**
   * Возвращает текущее состояние MIDI Clock.
   *
   * Темп округляется до 0,1 BPM и известен после 6 импульсов без пауз
   * длиннее 250 мс.
   */
  info(): ClockInfo {
    let bpm: number | null = null;
    if (this.intervals.length >= MIN_INTERVALS) {
      const mean = this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
      if (mean > 0) {
        bpm = Math.round((60000 / (mean * CLOCK_PPQN)) * 10) / 10;
      }
    }
    return { bpm, running: this.running, ticks: this.ticks };
  }

  /** Время последнего импульса Timing Clock, мс, или null, если импульсов не было. */
  lastTickTime(): number | null {
    return this.lastTick;
  }
}
