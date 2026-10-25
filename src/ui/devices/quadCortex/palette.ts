/** Цвета и шрифт изображения Quad Cortex: корпус, светодиоды и интерфейс CorOS 4.1.1. */

import type { Letter } from '../../../core/devices/quadCortex/engine.ts';

/**
 * Шрифт надписей корпуса и интерфейса: IBM Plex Sans начертаний 300–700 из
 * `QuadCortexView.css`; пока он не загружен — близкие по виду гротески.
 */
export const FONT = "'IBM Plex Sans', 'Noto Sans', 'DejaVu Sans', sans-serif";

/** Цвета букв слотов A–H в обозначении пресета: шапка The Grid, плитки Gig View и светодиоды в PRESET. */
export const SLOT_COLORS: Readonly<Record<Letter, string>> = {
  A: '#45F862',
  B: '#0A74E0',
  C: '#FF7000',
  D: '#FF02C2',
  E: '#87DAFF',
  F: '#6954FF',
  G: '#FFD236',
  H: '#FF2727',
};

/**
 * Цвет сцены на плитках Gig View и светодиодах в SCENE. Цвета сцен задаёт
 * пользователь в пресете, по MIDI их не узнать, поэтому у всех сцен — цвет
 * индикатора сцены.
 */
export const SCENE_COLOR = '#FFD236';

/** Палитра интерфейса CorOS. */
export const UI = {
  /** Фон The Grid и окна Tempo. */
  black: '#000000',
  /** Фон Gig View, Tuner, Looper X и блоков входа и выхода. */
  background: '#121212',
  /** Плитки Gig View, кнопка режима, дорожка LIVE TUNER. */
  surface: '#1E1E1E',
  /** Кнопка ✓, плитки Looper X, панели параметров. */
  panel: '#2E2E2E',
  /** Неактивные точки долей окна Tempo. */
  dots: '#404040',
  /** Неизвестные значения на месте данных пресета. */
  faint: '#606060',
  /** Индикатор неизвестной сцены. */
  sceneUnknown: '#616161',
  /** Приглушённый текст и значки. */
  muted: '#959595',
  /** Сигнальная линия The Grid. */
  cable: '#C1C1C1',
  white: '#FFFFFF',
  /** Акцент: BPM, LIVE TUNER «в строю», выбранные переключатели. */
  accent: '#45F862',
  /** Красный: MUTED, запись, «Looper X». */
  danger: '#FF2727',
} as const;

/** Цвета свечения служебных светодиодов. */
export const LED_COLORS = {
  green: '#45F862',
  blue: '#2E86FF',
  red: '#FF2727',
  white: '#F2F2F4',
} as const;

/**
 * Смешивает цвет с фоном, как полупрозрачную заливку поверх фона.
 *
 * @param color цвет `#RRGGBB`.
 * @param amount доля цвета 0–1: 0 — фон, 1 — сам цвет.
 * @param base цвет фона `#RRGGBB`.
 * @returns цвет `#RRGGBB`.
 */
export function mix(color: string, amount: number, base: string): string {
  const a = channels(color);
  const b = channels(base);
  return toHex(a.map((value, i) => b[i] + (value - b[i]) * amount));
}

/**
 * Затемняет цвет умножением каналов.
 *
 * @param color цвет `#RRGGBB`.
 * @param factor множитель 0–1: 0 — чёрный, 1 — цвет без изменений.
 * @returns цвет `#RRGGBB`.
 */
export function shade(color: string, factor: number): string {
  return toHex(channels(color).map((value) => value * factor));
}

function channels(color: string): number[] {
  return [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
}

function toHex(values: number[]): string {
  return `#${values.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}
