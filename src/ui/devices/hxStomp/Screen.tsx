/**
 * Экран HX Stomp: вложенный SVG с координатами реального разрешения
 * 320 × 240 px поверх активной области LCD на корпусе.
 */

import type { HxStompState } from '../../../core/devices/hxStomp/engine.ts';
import { SCREEN_RECT } from './Body.tsx';
import { EditScreen } from './EditScreen.tsx';
import { BankQueueHeader, BypassPanel, ModeBar, PresetHeader, SwitchRow } from './PlayScreen.tsx';
import { SCREEN_FONT } from './text.tsx';
import { TunerScreen } from './TunerScreen.tsx';

/** Содержимое экрана в текущем состоянии; правила выбора — у {@link Screen}. */
function Content({ state }: { state: HxStompState }) {
  if (state.tuner) {
    return <TunerScreen page={state.tunerPage} />;
  }
  if (state.bankQueue) {
    return (
      <g>
        <BankQueueHeader state={state} />
        <ModeBar mode={state.footswitchMode} />
        {state.allBypass ? <BypassPanel state={state} /> : <SwitchRow state={state} queued />}
      </g>
    );
  }
  if (state.view === 'edit') {
    return <EditScreen state={state} />;
  }
  return (
    <g>
      <PresetHeader state={state} />
      <ModeBar mode={state.footswitchMode} />
      {state.allBypass ? <BypassPanel state={state} /> : <SwitchRow state={state} queued={false} />}
    </g>
  );
}

/**
 * Экран прибора в текущем состоянии модели. Tuner закрывает собой всё; банк в
 * очереди показывает экран ожидания выбора пресета; иначе — Play view или
 * Edit view по `state.view`. All Bypass заменяет нижнюю половину экрана
 * сообщением.
 */
export function Screen({ state }: { state: HxStompState }) {
  return (
    <svg
      x={SCREEN_RECT.x}
      y={SCREEN_RECT.y}
      width={SCREEN_RECT.width}
      height={SCREEN_RECT.height}
      viewBox="0 0 320 240"
      overflow="hidden"
      fontFamily={SCREEN_FONT}
    >
      <rect width={320} height={240} fill="#000" />
      <Content state={state} />
    </svg>
  );
}
