/** Часы изображения Quad Cortex: момент, на который рисуется прибор между сообщениями. */

import { useEffect, useState } from 'react';
import type { QuadCortexState } from '../../../core/devices/quadCortex/engine.ts';
import { useModelClock } from '../modelClock.ts';
import { changesOverTime, timeKey } from './timeline.ts';

/**
 * Возвращает момент, на который рисуется прибор, и перерисовывает компонент,
 * пока изображение меняется со временем (см. `changesOverTime`): каждый раз,
 * когда меняется ключ изображения `timeKey`, но не чаще кадра анимации.
 *
 * Момент берётся из часов модели (`useModelClock`): на странице монитора это
 * текущее время.
 *
 * @param state состояние модели на момент последнего сообщения.
 * @returns миллисекунды Unix-времени.
 */
export function useModelTime(state: QuadCortexState): number {
  const read = useModelClock();
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!changesOverTime(state)) {
      return undefined;
    }
    let key = timeKey(state, read());
    let request = requestAnimationFrame(function frame() {
      const next = timeKey(state, read());
      if (next !== key) {
        key = next;
        setFrame((n) => n + 1);
      }
      request = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(request);
  }, [state, read]);
  return read();
}
