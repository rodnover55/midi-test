/**
 * Вид подсветки и надписей HX Stomp по состоянию модели: LED-кольца
 * футсвитчей на корпусе, кольца значков футсвитчей на экране, мигание TAP в
 * темпе и подписи футсвитчей в Play view.
 */

import type {
  HxRing,
  HxRingColor,
  HxStompState,
  HxSwitchDisplay,
  HxSwitchLabel,
} from '../../../core/devices/hxStomp/engine.ts';
import { CLOCK_LOST_MS } from '../../../core/devices/hxStomp/tempo.ts';

/** Цвета горящих LED-колец на корпусе. */
export const LED_COLORS: Record<HxRingColor, string> = {
  red: '#f2160e',
  green: '#22e622',
  amber: '#ffa11a',
  white: '#f2f2f6',
  blue: '#2c6cff',
};

/** Цвет горящего кольца, цвет которого задан пресетом и неизвестен: нейтральный белый (Auto у снапшотов). */
export const LED_PRESET_COLOR = '#e2e2e8';

/** Цвета колец значков футсвитчей на экране. */
export const SCREEN_RING_COLORS: Record<HxRingColor, string> = {
  red: '#ff0000',
  green: '#01ff00',
  amber: '#f8b038',
  white: '#ffffff',
  blue: '#2e7bff',
};

/** Цвета интерфейса экрана. */
export const SCREEN = {
  /** Основной текст. */
  text: '#ffffff',
  /** Вторичный текст и значки: Tuner, неактивное. */
  secondary: '#b1b1b1',
  /** Линии схемы, обводки, невыбранные кольца значков, неизвестные значения. */
  gray: '#808080',
  /** Дорожка полоски значения, погасшие стрелки тюнера. */
  track: '#4d4d4d',
  /** Красные надписи TAP/TUNER и камера при Snapshot Edits = Discard. */
  red: '#ff0000',
  /** Заливка входа и выхода схемы, тёмная цифра на белом. */
  ink: '#171f29',
  /** Предупреждение All Bypass. */
  warning: '#ffff00',
} as const;

/** Длительность вспышки кольца TAP на каждую долю, мс. */
export const FLASH_MS = 100;

/**
 * Пауза в получении новых импульсов MIDI Clock, после которой изображение
 * считает клок пропавшим, мс: пауза, после которой клок теряет прибор, плюс
 * запас на доставку состояния странице.
 */
export const CLOCK_STALE_MS = CLOCK_LOST_MS + 150;

/**
 * Вид LED-кольца футсвитча на корпусе:
 * - `off` — не горит;
 * - `neutral` — состояние неизвестно (назначения пресета) или зависит от
 *   звука (Tuner): кольцо из серых сегментов без свечения, отличимое и от
 *   погашенного, и от тускло горящего;
 * - `lit` — горит цветом `color`, при `dim` — тускло;
 * - `tempo` — мигает цветом `color` в темпе `bpm` от доли `beatTime`, между
 *   вспышками горит тускло; при неизвестном `bpm` горит тускло без вспышек.
 */
export type RingLook =
  | { kind: 'off' }
  | { kind: 'neutral' }
  | { kind: 'lit'; color: string; dim: boolean }
  | { kind: 'tempo'; color: string; bpm: number | null; beatTime: number | null };

/**
 * Возвращает вид LED-кольца футсвитча на корпусе по кольцу модели.
 *
 * Кольцо с цветом из пресета (`color` = null) горит нейтральным белым
 * {@link LED_PRESET_COLOR}. Кольцо TAP мигает синим, пока прибор следует MIDI
 * Clock; если клок пропал (`clockActive` = false), — красным в собственном
 * темпе прибора, как после возврата к собственному темпу.
 *
 * @param ring кольцо из `state.switches`.
 * @param clockActive приходят ли ещё импульсы MIDI Clock, которому следует
 *   прибор; не учитывается, если прибор клоку не следует.
 */
export function ringLook(ring: HxRing, state: HxStompState, clockActive: boolean): RingLook {
  switch (ring.light) {
    case 'off':
      return { kind: 'off' };
    case 'on':
    case 'dim':
      return { kind: 'lit', color: ring.color ? LED_COLORS[ring.color] : LED_PRESET_COLOR, dim: ring.light === 'dim' };
    case 'tempo': {
      const tempo = state.tempo;
      const lostClock = tempo.clock !== null && !clockActive;
      if (lostClock) {
        return {
          kind: 'tempo',
          color: LED_COLORS.red,
          bpm: tempo.own ? tempo.own.bpm : null,
          beatTime: tempo.own ? tempo.own.beatTime : null,
        };
      }
      return { kind: 'tempo', color: LED_COLORS[ring.color ?? 'red'], bpm: tempo.bpm, beatTime: tempo.beatTime };
    }
    case 'tuner':
    case 'unknown':
      return { kind: 'neutral' };
  }
}

/**
 * Проверяет, приходится ли момент `now` на вспышку кольца, мигающего в
 * темпе: вспышки длительностью {@link FLASH_MS} (не больше половины доли)
 * начинаются в `beatTime` и далее через 60000 / `bpm` мс, в том числе до
 * `beatTime`.
 *
 * @param bpm темп; при значении не больше 0 вспышек нет.
 * @param beatTime время доли; null — фаза неизвестна, доли отсчитываются от
 *   нуля Unix-времени.
 * @param now момент, миллисекунды Unix-времени.
 */
export function beatFlash(bpm: number, beatTime: number | null, now: number): boolean {
  if (!(bpm > 0)) {
    return false;
  }
  const period = 60000 / bpm;
  const elapsed = now - (beatTime ?? 0);
  const phase = ((elapsed % period) + period) % period;
  return phase < Math.min(FLASH_MS, period / 2);
}

/**
 * Возвращает, через сколько миллисекунд после `now` вспышка кольца, мигающего
 * в темпе, начнётся или закончится (см. {@link beatFlash}); всегда больше 0.
 *
 * @param bpm темп, больше 0.
 * @param beatTime время доли; null — доли отсчитываются от нуля Unix-времени.
 * @param now момент, миллисекунды Unix-времени.
 */
export function nextFlashChange(bpm: number, beatTime: number | null, now: number): number {
  const period = 60000 / bpm;
  const flash = Math.min(FLASH_MS, period / 2);
  const elapsed = now - (beatTime ?? 0);
  const phase = ((elapsed % period) + period) % period;
  return Math.max(1, (phase < flash ? flash : period) - phase);
}

/**
 * Кольцо значка футсвитча на экране: `fill` — заливка, null — только обводка
 * (состояние неизвестно); `stroke` — обводка.
 */
export interface IconRing {
  fill: string | null;
  stroke: string;
}

/**
 * Возвращает кольцо значка футсвитча на экране в Play view.
 *
 * Значок TAP/TUNER всегда красный; горящее кольцо — цветом кольца (кольцо с
 * цветом из пресета — белым), погашенное и тусклое — серым, кольцо с
 * неизвестным состоянием — только серой обводкой.
 */
export function iconRing(display: HxSwitchDisplay): IconRing {
  const { label, ring } = display;
  if (label.kind === 'text' && label.color === 'red') {
    return { fill: SCREEN.red, stroke: SCREEN.red };
  }
  switch (ring.light) {
    case 'on':
    case 'tempo': {
      const color = ring.color ? SCREEN_RING_COLORS[ring.color] : SCREEN.text;
      return { fill: color, stroke: color };
    }
    case 'off':
    case 'dim':
      return { fill: SCREEN.gray, stroke: SCREEN.gray };
    case 'tuner':
    case 'unknown':
      return { fill: null, stroke: SCREEN.gray };
  }
}

/**
 * Подпись футсвитча в одну или две строки Play view.
 *
 * `chevron` — шеврон под первой строкой вместо второй: `down` — «∨»,
 * `up` — «∧».
 */
export interface LabelLines {
  lines: readonly string[];
  color: string;
  chevron: 'down' | 'up' | null;
}

/** Обозначение неизвестного значения на экране. */
export const UNKNOWN_TEXT = '—';

/**
 * Делит подпись на две строки, как прибор: по пробелу, при котором длинная
 * строка короче всего (из равных — по последнему), а без пробелов — после
 * косой черты (`TAP/` и `TUNER`). Подпись без пробелов и косой черты
 * остаётся одной строкой.
 */
export function splitLabel(text: string): string[] {
  const breaks: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      breaks.push(i);
    }
  }
  if (breaks.length > 0) {
    let best = breaks[0];
    for (const i of breaks) {
      if (Math.max(i, text.length - i - 1) <= Math.max(best, text.length - best - 1)) {
        best = i;
      }
    }
    return [text.slice(0, best), text.slice(best + 1)];
  }
  const slash = text.indexOf('/');
  if (slash > 0 && slash < text.length - 1) {
    return [text.slice(0, slash + 1), text.slice(slash + 1)];
  }
  return [text];
}

/**
 * Возвращает строки подписи футсвитча для подписей из текста: назначение
 * пресета и неизвестная подпись — серый прочерк, надписи прошивки — их
 * цветом (`PRESET ∨` и `PRESET ∧` — слово и шеврон под ним), функция FS3 —
 * белым в две строки.
 *
 * @returns null для подписей `preset` и `snapshot`: они рисуются номером
 *   пресета и значком камеры.
 */
export function labelLines(label: HxSwitchLabel): LabelLines | null {
  switch (label.kind) {
    case 'assignment':
    case 'unknown':
      return { lines: [UNKNOWN_TEXT], color: SCREEN.gray, chevron: null };
    case 'text': {
      const color = label.color === 'red' ? SCREEN.red : SCREEN.text;
      const chevron = label.text.endsWith(' ∨') ? 'down' : label.text.endsWith(' ∧') ? 'up' : null;
      if (chevron) {
        return { lines: [label.text.slice(0, -2)], color, chevron };
      }
      return { lines: splitLabel(label.text), color, chevron: null };
    }
    case 'function':
      return { lines: splitLabel(label.name), color: SCREEN.text, chevron: null };
    case 'preset':
    case 'snapshot':
      return null;
  }
}

/**
 * Возвращает цвет `hex` (`#rrggbb`) с яркостью, умноженной на `factor`.
 *
 * @param factor 0 — чёрный, 1 — исходный цвет.
 */
export function shade(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
