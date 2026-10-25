/**
 * Адресация пресетов HX Stomp: 42 банка по три пресета A, B, C — всего 126
 * пресетов с номерами Program Change 0–125.
 */

import type { HxPresetNumbering } from './settings.ts';
import type { HxPreset, HxSlot } from './state.ts';

/** Число пресетов: номера Program Change 0–125. */
export const PRESET_COUNT = 126;

/** Число банков: банки 1–42. */
export const BANK_COUNT = 42;

const SLOTS: readonly HxSlot[] = ['A', 'B', 'C'];

/**
 * Возвращает пресет в банке по его номеру в банке.
 *
 * @param position 0 — A, 1 — B, 2 — C.
 */
export function slotAt(position: number): HxSlot {
  return SLOTS[position];
}

/**
 * Возвращает обозначение пресета на экране: при `banks` — банк из двух цифр и
 * слот, например `01A` для 0 и `41C` для 122; при `numbers` — номер из трёх
 * цифр, например `122`.
 *
 * @param index номер пресета 0–125.
 */
export function presetLabel(index: number, numbering: HxPresetNumbering): string {
  if (numbering === 'numbers') {
    return String(index).padStart(3, '0');
  }
  return `${String(Math.floor(index / 3) + 1).padStart(2, '0')}${SLOTS[index % 3]}`;
}

/**
 * Возвращает пресет с номером `index`: банк ⌊index / 3⌋ + 1, слот A, B, C по
 * остатку от деления на 3, обозначение по `numbering`; имя неизвестно.
 *
 * @param index номер пресета 0–125.
 */
export function presetRef(index: number, numbering: HxPresetNumbering): HxPreset {
  return {
    index,
    bank: Math.floor(index / 3) + 1,
    slot: SLOTS[index % 3],
    label: presetLabel(index, numbering),
    name: null,
  };
}

/**
 * Возвращает обозначения первого и последнего пресетов банка через тире,
 * например `17A–17C` или `048–050`.
 *
 * @param bank банк 1–42.
 */
export function bankRange(bank: number, numbering: HxPresetNumbering): string {
  const first = (bank - 1) * 3;
  return `${presetLabel(first, numbering)}–${presetLabel(first + 2, numbering)}`;
}

/** Приводит номер пресета к 0–125 по кругу: за 125 следует 0, перед 0 — 125. */
export function wrapPreset(index: number): number {
  return ((index % PRESET_COUNT) + PRESET_COUNT) % PRESET_COUNT;
}

/** Приводит номер банка к 1–42 по кругу: за 42 следует 1, перед 1 — 42. */
export function wrapBank(bank: number): number {
  return ((((bank - 1) % BANK_COUNT) + BANK_COUNT) % BANK_COUNT) + 1;
}
