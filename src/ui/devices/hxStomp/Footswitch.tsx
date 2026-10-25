/**
 * Футсвитч HX Stomp на корпусе: LED-кольцо и хромированный колпачок.
 */

import { FOOTSWITCH_Y } from './Body.tsx';
import { useBeatFlash } from './hooks.ts';
import type { RingLook } from './look.ts';
import { shade } from './look.ts';

/** Наружный радиус светящегося кольца, мм. */
const RING_OUTER = 9.25;
/** Внутренний радиус светящегося кольца, мм. */
const RING_INNER = 6.0;
/** Яркость тусклого кольца относительно горящего. */
const DIM = 0.38;
/** Цвет сегментов кольца с неизвестным состоянием. */
const NEUTRAL = '#6c6c72';
/** Длина сегмента и промежутка кольца с неизвестным состоянием по средней линии кольца, мм. */
const NEUTRAL_DASH = 1.25;

/**
 * Возвращает контур кольца между радиусами `outer` и `inner` вокруг центра
 * футсвитча `cx`; заливать с `fill-rule="evenodd"`.
 */
function annulus(cx: number, outer: number, inner: number): string {
  const y = FOOTSWITCH_Y;
  return (
    `M${cx - outer} ${y}a${outer} ${outer} 0 1 0 ${2 * outer} 0a${outer} ${outer} 0 1 0 ${-2 * outer} 0Z` +
    `M${cx - inner} ${y}a${inner} ${inner} 0 1 1 ${2 * inner} 0a${inner} ${inner} 0 1 1 ${-2 * inner} 0Z`
  );
}

/** Кольцо, горящее цветом `color`: ярко — со свечением вокруг, тускло — без него. */
function LitRing({ cx, color, dim }: { cx: number; color: string; dim: boolean }) {
  const middle = (RING_OUTER + RING_INNER) / 2;
  return (
    <g>
      {!dim && (
        <>
          <circle
            cx={cx}
            cy={FOOTSWITCH_Y}
            r={middle + 0.6}
            fill="none"
            stroke={color}
            strokeWidth={6}
            opacity={0.32}
            filter="url(#hx-bloom)"
          />
          <circle
            cx={cx}
            cy={FOOTSWITCH_Y}
            r={middle}
            fill="none"
            stroke={color}
            strokeWidth={RING_OUTER - RING_INNER + 1.2}
            opacity={0.85}
            filter="url(#hx-glow)"
          />
        </>
      )}
      <path d={annulus(cx, RING_OUTER, RING_INNER)} fill={dim ? shade(color, DIM) : color} fillRule="evenodd" />
      <path
        d={annulus(cx, RING_INNER + 1.3, RING_INNER)}
        fill="#fff"
        fillRule="evenodd"
        opacity={dim ? 0.06 : 0.42}
      />
      <path d={annulus(cx, RING_OUTER, RING_OUTER - 0.9)} fill="#000" fillRule="evenodd" opacity={0.28} />
    </g>
  );
}

/** Кольцо, мигающее в темпе: вспышка на каждую долю, между вспышками — тускло. */
function TempoRing(props: { cx: number; color: string; bpm: number | null; beatTime: number | null }) {
  const { cx, color, bpm, beatTime } = props;
  const flash = useBeatFlash(bpm, beatTime);
  return <LitRing cx={cx} color={color} dim={!flash} />;
}

/** LED-кольцо футсвитча `cx` вида `look`. */
function Ring({ cx, look }: { cx: number; look: RingLook }) {
  switch (look.kind) {
    case 'off':
      return <path d={annulus(cx, RING_OUTER, RING_INNER)} fill="url(#hx-ring-off)" fillRule="evenodd" />;
    case 'neutral':
      // Сегменты отличают неизвестное состояние от тускло горящего кольца того же серого тона.
      return (
        <g>
          <path d={annulus(cx, RING_OUTER, RING_INNER)} fill="url(#hx-ring-off)" fillRule="evenodd" />
          <circle
            cx={cx}
            cy={FOOTSWITCH_Y}
            r={(RING_OUTER + RING_INNER) / 2}
            fill="none"
            stroke={NEUTRAL}
            strokeWidth={RING_OUTER - RING_INNER - 0.8}
            strokeDasharray={`${NEUTRAL_DASH} ${NEUTRAL_DASH}`}
          />
        </g>
      );
    case 'lit':
      return <LitRing cx={cx} color={look.color} dim={look.dim} />;
    case 'tempo':
      return <TempoRing cx={cx} color={look.color} bpm={look.bpm} beatTime={look.beatTime} />;
  }
}

/**
 * Футсвитч FS1–FS3 с LED-кольцом вида `look`; кольцо `tempo` мигает само.
 *
 * @param cx центр футсвитча по горизонтали, мм.
 * @param pressed удерживается ли футсвитч (эмуляция CC49–CC51 без
 *   отпускания): колпачок нарисован утопленным и затенённым.
 */
export function Footswitch({ cx, look, pressed }: { cx: number; look: RingLook; pressed: boolean }) {
  const y = FOOTSWITCH_Y;
  const cap = pressed ? 4.95 : 5.25;
  return (
    <g>
      <circle cx={cx} cy={y} r={RING_OUTER + 0.35} fill="#141417" stroke="#4a4a52" strokeWidth={0.12} />
      <Ring cx={cx} look={look} />
      <circle cx={cx} cy={y} r={RING_INNER} fill="#2a272a" />
      <circle cx={cx} cy={y} r={5.4} fill="#141214" />
      {!pressed && <circle cx={cx + 0.15} cy={y + 0.45} r={5.3} fill="#000" opacity={0.6} filter="url(#hx-soft)" />}
      <circle cx={cx} cy={y} r={cap} fill="url(#hx-cap)" stroke="#6b676b" strokeWidth={0.15} />
      <circle cx={cx} cy={y} r={cap - 1.15} fill="none" stroke="#fff" strokeWidth={0.18} opacity={0.22} />
      <ellipse
        cx={cx - 1.7}
        cy={y - 1.9}
        rx={2.1}
        ry={1.15}
        fill="#fff"
        opacity={pressed ? 0.25 : 0.5}
        transform={`rotate(-35 ${cx - 1.7} ${y - 1.9})`}
      />
      {pressed && <circle cx={cx} cy={y} r={cap} fill="#000" opacity={0.35} />}
    </g>
  );
}
