import { Fragment } from 'react';
import type { HxStompState } from '../../../core/devices/hxStomp/engine.ts';
import type { ManualControl } from '../manual.ts';
import { hxFootswitch, hxFootswitchCc } from '../manual.ts';
import { SwitchHit } from '../SwitchHit.tsx';
import { BODY_SIZE, FOOTSWITCH_X, FOOTSWITCH_Y, HxBody, HxDefs, SCREEN_RECT } from './Body.tsx';
import { Footswitch } from './Footswitch.tsx';
import { useClockActive } from './hooks.ts';
import { ringLook } from './look.ts';
import { Screen } from './Screen.tsx';
import { statusParts } from './status.ts';
import './hxStomp.css';

/**
 * Изображение HX Stomp в текущем состоянии: корпус в виде сверху с экраном и
 * LED-кольцами футсвитчей, под ним — строка состояния. Занимает всё место
 * родителя-flex-колонки; изображение масштабируется с сохранением пропорций
 * {@link BODY_SIZE}. Кольцо TAP мигает в темпе модели по часам страницы.
 *
 * С `control` нажатие мыши на FS1–FS3 отправляет CC#49–51 со значением 127,
 * отпускание — со значением 0.
 */
export function HxStompView({ state, control }: { state: HxStompState; control?: ManualControl }) {
  const clockActive = useClockActive(state.tempo.clock ? state.tempo.clock.lastTick : null);
  const parts = statusParts(state, clockActive);
  const status = parts.map((part) => part.text).join(' · ');
  return (
    <div className="hx-view">
      <svg
        className="device-svg hx-svg"
        viewBox={`0 0 ${BODY_SIZE.width} ${BODY_SIZE.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Line 6 HX Stomp: ${status}`}
      >
        <HxDefs />
        <HxBody />
        <Screen state={state} />
        <rect
          x={SCREEN_RECT.x - 0.7}
          y={SCREEN_RECT.y - 0.7}
          width={SCREEN_RECT.width + 1.4}
          height={SCREEN_RECT.height + 1.4}
          rx={1.2}
          fill="url(#hx-glass)"
          pointerEvents="none"
        />
        {FOOTSWITCH_X.map((cx, i) => (
          <Footswitch
            key={cx}
            cx={cx}
            look={ringLook(state.switches[i].ring, state, clockActive)}
            pressed={state.footswitches[i].pressed}
          />
        ))}
        {control &&
          FOOTSWITCH_X.map((cx, i) => (
            <SwitchHit
              key={cx}
              cx={cx}
              cy={FOOTSWITCH_Y}
              r={9.6}
              title={`Нажатие футсвитча FS${i + 1} — CC#${hxFootswitchCc(i)} (127 — нажатие, 0 — отпускание)`}
              onPress={() => control.send([hxFootswitch(control.channel, i, true)])}
              onRelease={() => control.send([hxFootswitch(control.channel, i, false)])}
            />
          ))}
      </svg>
      <div className="hx-status">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="hx-status-sep"> · </span>}
            <span className="hx-status-part">
              {part.led && <span className="hx-led" style={{ background: part.led, color: part.led }} />}
              {part.text}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
