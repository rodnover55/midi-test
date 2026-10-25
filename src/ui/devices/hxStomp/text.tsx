/**
 * Текст экрана HX Stomp: шрифт экрана и надписи, которые уменьшаются, чтобы
 * поместиться по ширине.
 */

/** Шрифт экрана с запасными: прибор пишет семейством Roboto. */
export const SCREEN_FONT = "Roboto, 'Noto Sans', 'DejaVu Sans', sans-serif";

/** Начертания шрифта экрана. */
export const WEIGHT = { thin: 100, light: 300, regular: 400, bold: 700 } as const;

let context: CanvasRenderingContext2D | null | undefined;

/**
 * Возвращает ширину строки, набранной шрифтом экрана, в px экрана.
 *
 * @param size размер шрифта, px экрана.
 * @param weight начертание, 100–900.
 * @returns null, если измерить нельзя: страница без DOM.
 */
export function textWidth(text: string, size: number, weight: number): number | null {
  if (context === undefined) {
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!context) {
    return null;
  }
  context.font = `${weight} ${size}px ${SCREEN_FONT}`;
  return context.measureText(text).width;
}

/**
 * Возвращает размер шрифта не больше `size`, при котором строка помещается в
 * ширину `maxWidth`; если ширину измерить нельзя — `size`.
 */
export function fitSize(text: string, size: number, weight: number, maxWidth: number): number {
  const width = textWidth(text, size, weight);
  return width !== null && width > maxWidth ? (size * maxWidth) / width : size;
}

/** Свойства надписи экрана. */
export interface ScreenTextProps {
  x: number;
  /** Базовая линия. */
  y: number;
  text: string;
  /** Размер шрифта, px экрана. */
  size: number;
  weight: number;
  fill: string;
  /** Привязка `x`: к началу, середине или концу строки; по умолчанию к середине. */
  anchor?: 'start' | 'middle' | 'end';
  /** Наибольшая ширина: более длинная строка набирается мельче. */
  maxWidth?: number;
  className?: string;
}

/** Надпись экрана шрифтом экрана; при `maxWidth` уменьшается, чтобы поместиться. */
export function ScreenText(props: ScreenTextProps) {
  const { x, y, text, size, weight, fill, anchor = 'middle', maxWidth, className } = props;
  const fontSize = maxWidth === undefined ? size : fitSize(text, size, weight, maxWidth);
  return (
    <text x={x} y={y} fontSize={fontSize} fontWeight={weight} fill={fill} textAnchor={anchor} className={className}>
      {text}
    </text>
  );
}
