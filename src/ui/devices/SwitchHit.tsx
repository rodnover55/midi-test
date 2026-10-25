import { useRef } from 'react';

/**
 * Прозрачная область щелчка над футсвитчем на SVG-изображении устройства:
 * курсор-указатель, лёгкая подсветка при наведении, подсказка `title`.
 * Рисуется внутри `<svg>` поверх футсвитча, координаты — в единицах `viewBox`.
 *
 * @param onPress вызывается при нажатии основной кнопки мыши или касании.
 * @param onRelease вызывается один раз после `onPress`, когда кнопку
 *   отпустили, указатель ушёл с области или жест отменён; не задан — отпускание
 *   не отслеживается.
 */
export function SwitchHit(props: {
  cx: number;
  cy: number;
  r: number;
  title: string;
  onPress: () => void;
  onRelease?: () => void;
}) {
  const { cx, cy, r, title, onPress, onRelease } = props;
  const held = useRef(false);
  const release = () => {
    if (held.current) {
      held.current = false;
      onRelease?.();
    }
  };
  return (
    <circle
      className="switch-hit"
      cx={cx}
      cy={cy}
      r={r}
      onPointerDown={(e) => {
        if (e.button !== 0) {
          return;
        }
        e.preventDefault();
        held.current = true;
        onPress();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      <title>{title}</title>
    </circle>
  );
}
