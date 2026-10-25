/** Экран Quad Cortex: интерфейс 800×480, вписанный в окно стекла. */

import type { QuadCortexSettings, QuadCortexState } from '../../../../core/devices/quadCortex/engine.ts';
import { SCREEN_WINDOW } from '../Body.tsx';
import { beatInBar, looperAvailable, looperProgress } from '../timeline.ts';
import { GigViewScreen } from './GigViewScreen.tsx';
import { GridScreen } from './GridScreen.tsx';
import { LooperScreen } from './LooperScreen.tsx';
import { TempoScreen } from './TempoScreen.tsx';
import { TunerScreen } from './TunerScreen.tsx';

/**
 * Экран прибора: верхний экран из `state.screens` (Gig View, Tuner, окно
 * Tempo, Looper X), без них — The Grid. Интерфейс рисуется в пикселях
 * 800×480 и растягивается на окно стекла без сохранения пропорций, как на
 * приборе с неквадратными пикселями.
 *
 * @param state состояние на момент `now` (см. `quadCortexAt`).
 * @param settings действующие настройки из `state.settings`.
 * @param now момент изображения, миллисекунды Unix-времени.
 */
export function Screen({
  state,
  settings,
  now,
}: {
  state: QuadCortexState;
  settings: QuadCortexSettings;
  now: number;
}) {
  const { x, y, width, height } = SCREEN_WINDOW;
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 800 480" preserveAspectRatio="none">
      <TopScreen state={state} settings={settings} now={now} />
    </svg>
  );
}

function TopScreen({ state, settings, now }: { state: QuadCortexState; settings: QuadCortexSettings; now: number }) {
  switch (state.screens.at(-1)) {
    case 'gigView':
      return <GigViewScreen state={state} settings={settings} />;
    case 'tuner':
      return <TunerScreen settings={settings} />;
    case 'tempo':
      return <TempoScreen tempo={state.tempo} settings={settings} beat={beatInBar(state.tempo, now)} />;
    case 'looper':
      return (
        <LooperScreen
          state={state}
          settings={settings}
          progress={looperProgress(state.looper, now)}
          available={looperAvailable(state.looper, now)}
        />
      );
    default:
      return <GridScreen state={state} />;
  }
}
