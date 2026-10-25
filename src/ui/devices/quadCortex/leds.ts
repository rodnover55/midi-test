/**
 * Светодиоды над футсвитчами Quad Cortex по состоянию модели: что горит, каким
 * цветом и как ярко.
 *
 * Состояние, которого приложение не знает (назначенные блоки в STOMP,
 * неизвестные пресет, сцена или режим, меню Tuner и окно Tempo, кроме
 * футсвитча MUTE), рисуется негорящим светодиодом.
 */

import type {
  FootswitchState,
  LooperAction,
  QuadCortexSettings,
  QuadCortexState,
  TempoState,
} from '../../../core/devices/quadCortex/engine.ts';
import { LED_COLORS, mix, SCENE_COLOR, SLOT_COLORS } from './palette.ts';

/** Длительность вспышки светодиода TEMPO на каждой доле, мс. */
export const TEMPO_FLASH_MS = 100;

/** Цвет тёмного ободка вокруг линзы светодиода. */
export const LED_BEZEL = '#1A191E';

/** Яркость тусклого светодиода — доля цвета свечения поверх ободка. */
const DIM_LEVEL = 0.3;

/**
 * Номер футсвитча, светодиод которого показывает MUTE в меню Tuner: G — третий
 * в нижнем ряду, под параметром MUTE нижней панели меню.
 */
const TUNER_MUTE_FOOTSWITCH = 6;

/** Действия Looper X с красным значком; у остальных значок белый. */
const RED_LOOPER_ACTIONS: readonly LooperAction[] = ['DUPLICATE', 'PUNCH IN', 'RECORD'];

/** Яркость светодиода: `on` — горит, `dim` — светится тускло, `off` — не горит или состояние неизвестно. */
export type LedLevel = 'on' | 'dim' | 'off';

/** Светодиод над футсвитчем. */
export interface LedLight {
  /** Цвет свечения `#RRGGBB`; у светодиода с уровнем `off` не используется. */
  color: string;
  level: LedLevel;
}

/** Светодиоды прибора, кроме TEMPO. */
export interface QuadCortexLeds {
  /** Светодиоды футсвитчей A–H по порядку. */
  footswitches: readonly LedLight[];
  bankUp: LedLight;
  bankDown: LedLight;
}

/** Мигание светодиода TEMPO в темп. */
export interface TempoBlink {
  /** Цвет вспышки `#RRGGBB`. */
  color: string;
  /** Период мигания — длительность доли, мс. */
  period: number;
  /** Момент одной из вспышек, миллисекунды Unix-времени; от него вспышки идут через `period`. */
  phase: number;
}

const OFF: LedLight = { color: LED_COLORS.white, level: 'off' };

/**
 * Возвращает светодиоды футсвитчей A–H, BANK UP и BANK DOWN.
 *
 * Правила по назначению футсвитча:
 * - пресет — цвет буквы слота его пресета; загруженный горит, остальные
 *   светятся тускло (при Dimmed LEDs = Off не горят);
 * - сцена — цвет сцены; текущая горит, остальные тускло;
 * - стомп — не горит: цвет и состояние блоков неизвестны;
 * - Looper X (Perform) — красный у DUPLICATE, PUNCH IN и RECORD, белый у
 *   остальных; идущее или включённое действие горит, остальные тускло;
 * - меню Tuner — горит только футсвитч G (MUTE): красный при MUTE = On,
 *   белый при Off;
 * - окно Tempo, Looper X (Parameters), неизвестные режим, пресет или сцена —
 *   не горят.
 *
 * BANK UP и BANK DOWN не горят: навигация по банкам (Blinking Mode), при
 * которой они светятся, по MIDI не вызывается.
 *
 * @param state состояние на момент изображения (см. `quadCortexAt`).
 * @param settings действующие настройки из `state.settings`.
 */
export function quadCortexLeds(state: QuadCortexState, settings: QuadCortexSettings): QuadCortexLeds {
  const dimmed: LedLevel = settings.dimmedLeds ? 'dim' : 'off';
  const footswitches = state.footswitches.map((fs, i): LedLight => {
    switch (fs.role) {
      case 'preset':
        return lit(presetColor(fs), fs.active, dimmed);
      case 'scene':
        return lit(SCENE_COLOR, fs.active, dimmed);
      case 'looper': {
        const color = RED_LOOPER_ACTIONS.includes(settings.looperActions[i]) ? LED_COLORS.red : LED_COLORS.white;
        return lit(color, fs.active, dimmed);
      }
      case 'tuner':
        return i === TUNER_MUTE_FOOTSWITCH
          ? { color: settings.tunerMute ? LED_COLORS.red : LED_COLORS.white, level: 'on' }
          : OFF;
      default:
        return OFF;
    }
  });
  return { footswitches, bankUp: OFF, bankDown: OFF };
}

/**
 * Возвращает мигание светодиода TEMPO.
 *
 * Цвет — по `tempo.led`: зелёный — внутренний темп, синий — синхронизация к
 * входящему MIDI Clock, красный — прибор передаёт MIDI Clock. Если фаза доли
 * неизвестна, вспышки идут с тем же периодом от нулевого момента.
 *
 * @returns null, если светодиод не мигает: TEMPO LED = Off или темп неизвестен.
 */
export function tempoBlink(tempo: TempoState): TempoBlink | null {
  if (tempo.led === 'off' || tempo.bpm === null || tempo.bpm <= 0) {
    return null;
  }
  return { color: LED_COLORS[tempo.led], period: 60000 / tempo.bpm, phase: tempo.beatTime ?? 0 };
}

/**
 * Проверяет, горит ли светодиод TEMPO в момент `now`: вспышка длится
 * {@link TEMPO_FLASH_MS} с начала каждой доли.
 *
 * @param blink мигание; null — светодиод не мигает и не горит.
 * @param now момент, миллисекунды Unix-времени.
 */
export function tempoLit(blink: TempoBlink | null, now: number): boolean {
  if (blink === null) {
    return false;
  }
  const phase = (((now - blink.phase) % blink.period) + blink.period) % blink.period;
  return phase < TEMPO_FLASH_MS;
}

/**
 * Возвращает цвет линзы тусклого светодиода: цвет свечения с яркостью 30 %
 * поверх тёмного ободка {@link LED_BEZEL}. Такая линза темнее негорящей
 * светло-серой, поэтому тусклый светодиод отличим от негорящего при любом
 * цвете, в том числе белом.
 *
 * @param color цвет свечения `#RRGGBB`.
 * @returns цвет `#RRGGBB`.
 */
export function dimLensColor(color: string): string {
  return mix(color, DIM_LEVEL, LED_BEZEL);
}

function lit(color: string, active: boolean | null, dimmed: LedLevel): LedLight {
  if (active === null) {
    return OFF;
  }
  return { color, level: active ? 'on' : dimmed };
}

/** Цвет буквы слота пресета футсвитча: по последней букве подписи, без подписи — по букве футсвитча. */
function presetColor(fs: FootswitchState): string {
  const slot = fs.label?.at(-1);
  return slot !== undefined && slot in SLOT_COLORS
    ? SLOT_COLORS[slot as keyof typeof SLOT_COLORS]
    : SLOT_COLORS[fs.letter];
}
