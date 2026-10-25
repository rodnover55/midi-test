/** Общие вспомогательные функции модели Quad Cortex: результат обработки, стек экранов, сравнение, форматирование. */

import type { CommandDescription, Effect } from '../types.ts';
import type { QuadCortexState, Screen } from './state.ts';

/**
 * Результат обработки сообщения до пересчёта производных полей состояния:
 * обозначений пресета, футсвитчей и цвета светодиода TEMPO.
 */
export interface Outcome {
  /** Тот же объект, если сообщение ничего не изменило. */
  state: QuadCortexState;
  description: CommandDescription;
}

/** Создаёт результат обработки сообщения. */
export function outcome(state: QuadCortexState, effect: Effect, text: string): Outcome {
  return { state, description: { text, effect } };
}

/**
 * Возвращает объект с изменёнными полями.
 *
 * @returns исходный объект, если каждое поле `changes` строго равно
 *   (`===`) полю исходного объекта, иначе новый объект; исходный не меняется.
 */
export function patch<T extends object>(target: T, changes: Partial<T>): T {
  for (const key of Object.keys(changes) as (keyof T)[]) {
    if (target[key] !== changes[key]) {
      return { ...target, ...changes };
    }
  }
  return target;
}

/** Проверяет, что у объектов одни и те же собственные поля и значения каждого поля строго равны (`===`). */
export function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && a[key] === b[key]);
}

/**
 * Возвращает стек экранов, в котором экран открыт сверху: открытый ниже
 * поднимается наверх, закрытый добавляется.
 *
 * @returns исходный массив, если экран уже сверху.
 */
export function openScreen(screens: readonly Screen[], screen: Screen): readonly Screen[] {
  return screens.at(-1) === screen ? screens : [...screens.filter((s) => s !== screen), screen];
}

/**
 * Возвращает стек экранов без экрана.
 *
 * @returns исходный массив, если экран не открыт.
 */
export function closeScreen(screens: readonly Screen[], screen: Screen): readonly Screen[] {
  return screens.includes(screen) ? screens.filter((s) => s !== screen) : screens;
}

/** Возвращает темп с одним знаком после точки, например `120.0`. */
export function formatBpm(bpm: number): string {
  return bpm.toFixed(1);
}
