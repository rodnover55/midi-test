/**
 * Части Play view HX Stomp в координатах экрана 320 × 240 px: верхняя
 * половина с пресетом и снапшотом, отметка режима футсвитчей, подписи и
 * значки футсвитчей, банк в очереди и панель All Bypass.
 */

import type { HxStompState, HxSwitchDisplay } from '../../../core/devices/hxStomp/engine.ts';
import { MODE_ORDER, presetLabel } from '../../../core/devices/hxStomp/engine.ts';
import { BankPointers, Camera, CAMERA_WIDTH, Chevron, SwitchIcon, WarningSign } from './icons.tsx';
import { iconRing, labelLines, SCREEN, UNKNOWN_TEXT } from './look.ts';
import { fitSize, ScreenText, textWidth, WEIGHT } from './text.tsx';

/** Центры колонок подписей и значков FS1–FS3 в нижней половине Play view, px. */
export const COLUMNS: readonly number[] = [53.3, 159.4, 267.0];

/** Левые края позиций блоков мини-схемы сигнала Play view, px. */
const MINI_BLOCKS: readonly number[] = [83, 103.7, 123.7, 143.8, 163.8, 183.8, 203.9, 223.9];

/** Наибольшая ширина подписи футсвитча, px. */
const LABEL_WIDTH = 100;

/**
 * Значок «E» несохранённых правок пресета: белая буква `height` px высотой.
 *
 * @param x левый край.
 * @param y верх.
 */
export function EditedMark({ x, y, height }: { x: number; y: number; height: number }) {
  const w = height * 0.57;
  return (
    <path
      d={`M${x + w} ${y}H${x}V${y + height}H${x + w}M${x} ${y + height / 2}H${x + w * 0.82}`}
      fill="none"
      stroke={SCREEN.text}
      strokeWidth={height * 0.16}
    />
  );
}

/**
 * Возвращает ширину надписи шрифтом экрана; если измерить нельзя — оценку
 * по числу знаков.
 */
export function measuredWidth(text: string, size: number, weight: number): number {
  return textWidth(text, size, weight) ?? text.length * size * 0.5;
}

/**
 * Верхняя половина Play view: номер пресета, камера с номером снапшота, имя
 * пресета со значком «E» и мини-схема сигнала. Имя и блоки пресета модели
 * неизвестны: вместо имени — прочерк, вместо блоков — пустые позиции.
 */
export function PresetHeader({ state }: { state: HxStompState }) {
  const preset = state.preset;
  const name = preset?.name ?? null;
  const nameText = name ?? UNKNOWN_TEXT;
  const nameSize = fitSize(nameText, 40, WEIGHT.light, 296);
  const nameWidth = measuredWidth(nameText, nameSize, WEIGHT.light);
  const snapshot = state.snapshot;
  return (
    <g>
      <ScreenText
        x={160}
        y={38.6}
        text={preset ? preset.label : UNKNOWN_TEXT}
        size={46.7}
        weight={WEIGHT.bold}
        fill={preset ? SCREEN.text : SCREEN.gray}
      />
      <Camera
        x={256.6}
        y={4.9}
        stroke={state.settings.snapshotEdits === 'discard' ? SCREEN.red : SCREEN.gray}
        strokeWidth={1.16}
        label={snapshot === null ? '–' : String(snapshot)}
        labelColor={snapshot === null ? SCREEN.gray : SCREEN.text}
        labelSize={28.9}
        labelBaseline={34.1}
      />
      <text
        x={160}
        y={73.2}
        fontSize={nameSize}
        fontWeight={WEIGHT.light}
        fill={name ? SCREEN.text : SCREEN.gray}
        textAnchor="middle"
      >
        {nameText}
      </text>
      {state.edited && <EditedMark x={160 + nameWidth / 2 + 4} y={44} height={14} />}
      <line x1={73.8} y1={93} x2={246} y2={93} stroke={SCREEN.gray} strokeWidth={1.04} />
      <circle cx={70.1} cy={93} r={3.8} fill={SCREEN.ink} stroke={SCREEN.gray} strokeWidth={1.04} />
      <circle cx={249.8} cy={93} r={3.8} fill={SCREEN.ink} stroke={SCREEN.gray} strokeWidth={1.04} />
      {MINI_BLOCKS.map((x) => (
        <rect
          key={x}
          x={x}
          y={86.9}
          width={12.2}
          height={12.2}
          rx={2}
          fill="#000"
          stroke={SCREEN.track}
          strokeWidth={1.04}
        />
      ))}
    </g>
  );
}

/**
 * Разделитель верхней и нижней половин Play view с отметкой режима
 * футсвитчей: белый отрезок в четверть ширины на месте режима (слева направо
 * Stomp, Scroll, Preset, Snapshot).
 */
export function ModeBar({ mode }: { mode: HxStompState['footswitchMode'] }) {
  const x = MODE_ORDER.indexOf(mode) * 80;
  return (
    <g>
      <line x1={0} y1={121.8} x2={320} y2={121.8} stroke="#fff" strokeOpacity={0.4} strokeWidth={1.16} />
      <line x1={x} y1={122.4} x2={x + 80} y2={122.4} stroke="#fff" strokeWidth={2.31} />
    </g>
  );
}

/** Подпись одного футсвитча над его значком. */
function SwitchLabel({ display, cx, queued }: { display: HxSwitchDisplay; cx: number; queued: boolean }) {
  const label = display.label;
  const big = { size: queued ? 46.7 : 52.1, baseline: queued ? 167.4 : 173.1 };
  switch (label.kind) {
    case 'preset':
      return (
        <ScreenText
          x={cx}
          y={big.baseline}
          text={label.label}
          size={big.size}
          weight={WEIGHT.bold}
          fill={SCREEN.text}
          maxWidth={LABEL_WIDTH}
          className={label.blinking ? 'hx-blink' : undefined}
        />
      );
    case 'unknown':
      return (
        <ScreenText
          x={cx}
          y={big.baseline}
          text={UNKNOWN_TEXT}
          size={big.size}
          weight={WEIGHT.bold}
          fill={SCREEN.gray}
        />
      );
    case 'snapshot':
      return (
        <Camera
          x={cx - CAMERA_WIDTH / 2}
          y={135.8}
          stroke={SCREEN.gray}
          strokeWidth={1.14}
          label={String(label.snapshot)}
          labelColor={label.current ? SCREEN.ink : SCREEN.text}
          labelSize={30.1}
          labelBaseline={165}
          filled={label.current === true}
        />
      );
    default: {
      const text = labelLines(label);
      if (!text) {
        return null;
      }
      if (text.chevron) {
        return (
          <g>
            <ScreenText x={cx} y={150.4} text={text.lines[0]} size={22.2} weight={WEIGHT.regular} fill={text.color} />
            <Chevron x={cx - 11.2} y={159.2} direction={text.chevron} />
          </g>
        );
      }
      const baselines = text.lines.length === 1 ? [161.7] : [150.2, 173.2];
      return (
        <g>
          {text.lines.map((line, i) => (
            <ScreenText
              key={i}
              x={cx}
              y={baselines[i]}
              text={line}
              size={22.2}
              weight={WEIGHT.regular}
              fill={text.color}
              maxWidth={LABEL_WIDTH}
            />
          ))}
        </g>
      );
    }
  }
}

/**
 * Нижняя половина Play view: подписи FS1–FS3 по режиму футсвитчей, значки
 * футсвитчей с кольцами и, в режимах Preset и Snapshot, указатели банка.
 *
 * @param queued банк в очереди: номера пресетов набираются мельче, как на
 *   экране ожидания выбора пресета.
 */
export function SwitchRow({ state, queued }: { state: HxStompState; queued: boolean }) {
  const mode = state.footswitchMode;
  return (
    <g>
      {state.switches.map((display, i) => (
        <g key={i}>
          <SwitchLabel display={display} cx={COLUMNS[i]} queued={queued} />
          <SwitchIcon cx={COLUMNS[i]} ring={iconRing(display)} />
        </g>
      ))}
      {(mode === 'preset' || mode === 'snapshot') && <BankPointers />}
    </g>
  );
}

/**
 * Верхняя половина экрана ожидания выбора пресета из банка в очереди: три
 * строки «номер имя». Имена пресетов неизвестны; при неизвестном банке
 * неизвестны и номера.
 */
export function BankQueueHeader({ state }: { state: HxStompState }) {
  const bank = state.bankQueue ? state.bankQueue.bank : null;
  return (
    <g>
      {[28, 67.8, 107.6].map((baseline, position) => {
        const number =
          bank === null ? UNKNOWN_TEXT : presetLabel((bank - 1) * 3 + position, state.settings.presetNumber);
        const nameX = Math.max(60.2, 9 + measuredWidth(number, 28.9, WEIGHT.bold) + 7.5);
        return (
          <g key={position}>
            <ScreenText
              x={9}
              y={baseline}
              text={number}
              size={28.9}
              weight={WEIGHT.bold}
              fill={bank === null ? SCREEN.gray : SCREEN.text}
              anchor="start"
            />
            <ScreenText
              x={nameX}
              y={baseline}
              text={UNKNOWN_TEXT}
              size={28.9}
              weight={WEIGHT.light}
              fill={SCREEN.gray}
              anchor="start"
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Сообщение All Bypass вместо нижней половины экрана: жёлтый
 * предупреждающий знак и «Analog Bypass!» или «DSP Bypass!» по Bypass Type,
 * под ним «Press any switch».
 */
export function BypassPanel({ state }: { state: HxStompState }) {
  const type = state.settings.bypassType === 'dsp' ? 'DSP' : 'Analog';
  return (
    <g>
      <WarningSign x={22} y={151} />
      <ScreenText
        x={84}
        y={168}
        text={`${type} Bypass!`}
        size={28.9}
        weight={WEIGHT.light}
        fill={SCREEN.text}
        anchor="start"
        maxWidth={226}
      />
      <ScreenText
        x={84}
        y={204}
        text="Press any switch"
        size={28.9}
        weight={WEIGHT.light}
        fill={SCREEN.text}
        anchor="start"
        maxWidth={226}
      />
    </g>
  );
}
