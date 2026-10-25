/**
 * Хуки изображения HX Stomp, зависящие от текущего времени: мигание кольца в
 * темпе и пропадание MIDI Clock.
 */

import { useEffect, useState } from 'react';
import { useModelClock } from '../modelClock.ts';
import { beatFlash, CLOCK_STALE_MS, nextFlashChange } from './look.ts';

/**
 * Возвращает, горит ли сейчас вспышка кольца, мигающего в темпе (см.
 * {@link beatFlash}), и перерисовывает компонент в начале и в конце каждой
 * вспышки. Время — часы модели (`useModelClock`).
 *
 * @param bpm темп; null или не больше 0 — вспышек нет, всегда false.
 * @param beatTime время доли; null — фаза неизвестна.
 */
export function useBeatFlash(bpm: number | null, beatTime: number | null): boolean {
  const [flash, setFlash] = useState(false);
  const clock = useModelClock();
  const active = bpm !== null && bpm > 0;
  useEffect(() => {
    if (bpm === null || !(bpm > 0)) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const now = clock();
      setFlash(beatFlash(bpm, beatTime, now));
      timer = setTimeout(update, nextFlashChange(bpm, beatTime, now) + 1);
    };
    timer = setTimeout(update, 0);
    return () => clearTimeout(timer);
  }, [bpm, beatTime, clock]);
  return active && flash;
}

/**
 * Возвращает, приходят ли ещё импульсы MIDI Clock, которому следует прибор:
 * true, пока время последнего импульса меняется хотя бы раз в
 * {@link CLOCK_STALE_MS} по часам страницы. Компонент перерисовывается, когда
 * импульсы перестают приходить.
 *
 * Паузу отсчитывает страница от получения состояния, а не от времени импульса,
 * поэтому расхождение часов сервера и страницы не влияет на результат.
 *
 * @param lastTick время последнего импульса из состояния модели; null —
 *   прибор клоку не следует, результат false.
 */
export function useClockActive(lastTick: number | null): boolean {
  const [staleTick, setStaleTick] = useState<number | null>(null);
  useEffect(() => {
    if (lastTick === null) {
      return;
    }
    const timer = setTimeout(() => setStaleTick(lastTick), CLOCK_STALE_MS);
    return () => clearTimeout(timer);
  }, [lastTick]);
  return lastTick !== null && staleTick !== lastTick;
}
