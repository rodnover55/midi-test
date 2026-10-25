/**
 * Адресация пресетов Quad Cortex: сетлисты, группы Bank Select и
 * обозначения пресетов вида `9D`.
 */

import type { ModeSlotValue } from './settings.ts';

/** Наибольший номер сетлиста в CC#32: 0 — Factory Presets, 1 — My Presets, 2–12 — пользовательские. */
export const MAX_SETLIST = 12;

/** Пресетов в сетлисте: индексы 0–255. */
export const PRESETS_PER_SETLIST = 256;

const SLOT_LETTERS = 'ABCDEFGH';

/** Обозначение пресета на приборе. */
export interface PresetDesignation {
  /** Номер банка: 1–32 при банках по 8, 1–64 при банках по 4. */
  bank: number;
  /** Буква слота: A–H при банках по 8, A–D при банках по 4. */
  slot: string;
  /** Номер банка и буква слота, например `9D`. */
  label: string;
}

/**
 * Возвращает обозначение пресета по индексу в сетлисте.
 *
 * При банках по 8 индекс 67 — `9D`; при банках по 4 (HYBRID с PRESET) банк —
 * четвёрка пресетов, буквы всегда A–D: индекс 67 — `17D`.
 *
 * @param index индекс 0–255.
 */
export function presetDesignation(index: number, banksOfFour: boolean): PresetDesignation {
  const size = banksOfFour ? 4 : 8;
  const bank = Math.floor(index / size) + 1;
  const slot = SLOT_LETTERS[index % size];
  return { bank, slot, label: `${bank}${slot}` };
}

/**
 * Возвращает обозначение пресета для журнала: при банках по 8 — `9D`, при
 * банках по 4 — `9D (в HYBRID — 17D)`.
 */
export function presetText(index: number, banksOfFour: boolean): string {
  const standard = presetDesignation(index, false).label;
  return banksOfFour ? `${standard} (в HYBRID — ${presetDesignation(index, true).label})` : standard;
}

/**
 * Возвращает имя сетлиста с постоянным номером.
 *
 * @returns `Factory Presets` для 0, `My Presets` для 1, null для
 *   пользовательских сетлистов (их имена неизвестны) и для null.
 */
export function setlistName(setlist: number | null): string | null {
  return setlist === 0 ? 'Factory Presets' : setlist === 1 ? 'My Presets' : null;
}

/** Возвращает сетлист для журнала: `сетлист 1 «My Presets»`, `сетлист 5`, `сетлист ?` для неизвестного. */
export function setlistText(setlist: number | null): string {
  if (setlist === null) {
    return 'сетлист ?';
  }
  const name = setlistName(setlist);
  return name ? `сетлист ${setlist} «${name}»` : `сетлист ${setlist}`;
}

/**
 * Возвращает диапазон обозначений группы пресетов, которую выбирает CC#0:
 * `1A–16H` для 0, `17A–32H` для 1; при банках по 4 добавляет обозначения
 * HYBRID, например `17A–32H (в HYBRID — 33A–64D)`.
 *
 * @param msb 0 или 1.
 */
export function groupText(msb: number, banksOfFour: boolean): string {
  const first = msb * 128;
  const last = first + 127;
  const range = `${presetDesignation(first, false).label}–${presetDesignation(last, false).label}`;
  return banksOfFour
    ? `${range} (в HYBRID — ${presetDesignation(first, true).label}–${presetDesignation(last, true).label})`
    : range;
}

/**
 * Проверяет, делятся ли банки на 4 пресета: так бывает, если в Modes
 * Configuration есть HYBRID с PRESET.
 */
export function hasBanksOfFour(slots: readonly ModeSlotValue[]): boolean {
  return slots.some((slot) => slot.includes('+') && slot.includes('PRESET'));
}
