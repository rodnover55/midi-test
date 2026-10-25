/**
 * Настройки Quad Cortex, от которых зависит обработка входящего MIDI и
 * изображение прибора, и их чтение в типизированном виде.
 */

import type { DeviceSettings, SettingDef } from '../types.ts';
import { resolveSettings } from '../types.ts';
import type { Letter, RowMode } from './state.ts';
import { LETTERS } from './state.ts';

/**
 * Содержимое Mode Slot в Modes Configuration: режим, HYBRID в виде
 * `<режим ряда A–D>+<режим ряда E–H>` или `EMPTY` — пустой слот.
 */
export type ModeSlotValue =
  | RowMode
  | 'PRESET+SCENE'
  | 'SCENE+PRESET'
  | 'PRESET+STOMP'
  | 'STOMP+PRESET'
  | 'SCENE+STOMP'
  | 'STOMP+SCENE'
  | 'EMPTY';

/** Содержимое Mode Slot 1, 2 и 3 по порядку. */
export type ModeSlots = readonly [ModeSlotValue, ModeSlotValue, ModeSlotValue];

/** Действие Looper X, которое можно назначить на футсвитч (Assign Looper X Actions). */
export type LooperAction =
  | 'DUPLICATE'
  | 'RE-LOOP'
  | 'ONE SHOT'
  | 'HALF SPEED'
  | 'PUNCH IN'
  | 'RECORD'
  | 'PLAY'
  | 'REVERSE'
  | 'UNDO';

/** Поведение функции Looper X: переключение нажатием или работа, пока футсвитч нажат. */
export type LooperPressMode = 'Toggle' | 'Momentary';

/** Значение SCENE BYPASS BEHAVIOR. */
export type SceneBypassBehavior = 'overwrite' | 'footswitch' | 'none';

/** Значение MIDI Clock Out. */
export type ClockOut = 'OFF' | 'USB' | 'DIN' | 'USB+DIN';

/** Настройки Quad Cortex в типизированном виде. */
export interface QuadCortexSettings {
  ignoreDuplicatePc: boolean;
  midiClockIn: boolean;
  midiClockOut: ClockOut;
  /** Mode Slot 1–3; режим, который уже стоит в слоте с меньшим номером, заменён на `EMPTY`. */
  modeSlots: ModeSlots;
  /** Mode Slot режима после включения; null — режим неизвестен. */
  startModeSlot: 1 | 2 | 3 | null;
  sceneBypassBehavior: SceneBypassBehavior;
  tempoMode: 'GLOBAL' | 'PRESET';
  tempoLed: boolean;
  /** Через сколько миллисекунд после удара Tap Tempo окно Tempo закрывается само; 0 — не закрывается. */
  tempoWindowMs: number;
  /** Активный сетлист после включения; null — неизвестен. */
  startSetlist: number | null;
  /** Действия Looper X на футсвитчах A–H. */
  looperActions: readonly LooperAction[];
  looperRecordMode: LooperPressMode;
  looperOverdubMode: LooperPressMode;
  looperPunchMode: LooperPressMode;
  dimmedLeds: boolean;
  liveTuner: boolean;
  tunerMute: boolean;
}

/** Варианты содержимого Mode Slot в порядке показа и их подписи. */
const MODE_SLOT_OPTIONS: readonly { value: ModeSlotValue; label: string }[] = [
  { value: 'PRESET', label: 'PRESET' },
  { value: 'SCENE', label: 'SCENE' },
  { value: 'STOMP', label: 'STOMP' },
  { value: 'PRESET+SCENE', label: 'HYBRID: PRESET (A–D) + SCENE (E–H)' },
  { value: 'SCENE+PRESET', label: 'HYBRID: SCENE (A–D) + PRESET (E–H)' },
  { value: 'PRESET+STOMP', label: 'HYBRID: PRESET (A–D) + STOMP (E–H)' },
  { value: 'STOMP+PRESET', label: 'HYBRID: STOMP (A–D) + PRESET (E–H)' },
  { value: 'SCENE+STOMP', label: 'HYBRID: SCENE (A–D) + STOMP (E–H)' },
  { value: 'STOMP+SCENE', label: 'HYBRID: STOMP (A–D) + SCENE (E–H)' },
  { value: 'EMPTY', label: 'пусто' },
];

const LOOPER_ACTIONS: readonly LooperAction[] = [
  'DUPLICATE',
  'RE-LOOP',
  'ONE SHOT',
  'HALF SPEED',
  'PUNCH IN',
  'RECORD',
  'PLAY',
  'REVERSE',
  'UNDO',
];

/** Действия Looper X на футсвитчах A–H по умолчанию (экран Looper X в руководстве 4.1.1). */
const DEFAULT_LOOPER_ACTIONS: Record<Letter, LooperAction> = {
  A: 'DUPLICATE',
  B: 'ONE SHOT',
  C: 'HALF SPEED',
  D: 'PUNCH IN',
  E: 'RECORD',
  F: 'PLAY',
  G: 'REVERSE',
  H: 'UNDO',
};

const DEFAULT_MODE_SLOTS: readonly ModeSlotValue[] = ['PRESET', 'SCENE', 'STOMP'];

const PRESS_MODE_OPTIONS = [
  { value: 'Toggle', label: 'Toggle' },
  { value: 'Momentary', label: 'Momentary' },
] as const;

function modeSlotDef(slot: 1 | 2 | 3): SettingDef {
  return {
    key: `modeSlot${slot}`,
    label: `Modes Configuration: Mode Slot ${slot}`,
    hint:
      `Режим, который вызывает CC#47 = ${slot - 1}; значение CC#47 привязано к слоту, а не к режиму. ` +
      'HYBRID — ряды A–D и E–H в разных режимах; HYBRID с PRESET делит банки на 4 пресета. ' +
      'На приборе каждый режим стоит только в одном слоте: слот с режимом, который уже есть в слоте ' +
      'с меньшим номером, считается пустым.',
    type: 'select',
    default: DEFAULT_MODE_SLOTS[slot - 1],
    options: MODE_SLOT_OPTIONS,
  };
}

function looperActionDef(letter: Letter): SettingDef {
  return {
    key: `looperAction${letter}`,
    label: `Looper X: футсвитч ${letter}`,
    hint:
      `Действие футсвитча ${letter} в Looper X (Perform) по Assign Looper X Actions; ` +
      `его выполняет и CC#${35 + LETTERS.indexOf(letter)} при открытом Looper X.`,
    type: 'select',
    default: DEFAULT_LOOPER_ACTIONS[letter],
    options: LOOPER_ACTIONS.map((a) => ({ value: a, label: a })),
  };
}

function looperPressModeDef(key: string, name: string, cc: string): SettingDef {
  return {
    key,
    label: `Looper X: ${name}`,
    hint:
      `Параметр блока Looper X, по MIDI не задаётся. Momentary: ${cc} = 0–63 (отпускание кнопки контроллера) ` +
      'завершает действие; Toggle: 0–63 без действия. Заводское значение не документировано.',
    type: 'select',
    default: 'Toggle',
    options: PRESS_MODE_OPTIONS,
  };
}

/** Настройки Quad Cortex в порядке показа в форме. */
export const QUAD_CORTEX_SETTINGS: readonly SettingDef[] = [
  {
    key: 'ignoreDuplicatePc',
    label: 'Ignore Duplicate PC',
    hint:
      'On: Program Change текущего пресета (и CC#0, CC#32 вместе с ним) не перезагружает пресет; ' +
      'Off — перезагружает. Меняется и сообщением CC#62. По умолчанию Off (по снимку экрана в руководстве).',
    type: 'boolean',
    default: false,
  },
  {
    key: 'midiClockIn',
    label: 'MIDI Clock In',
    hint:
      'On: темп синхронизируется по входящему MIDI Clock, светодиод TEMPO синий; Off: Timing Clock не принимается. ' +
      'По умолчанию Off (по снимку экрана в руководстве).',
    type: 'boolean',
    default: false,
  },
  {
    key: 'midiClockOut',
    label: 'MIDI Clock Out',
    hint:
      'Передача MIDI Clock (светодиод TEMPO красный). При передаче входящий MIDI Clock не отображается: ' +
      'взаимодействие с MIDI Clock In не документировано. По умолчанию OFF (по снимку экрана в руководстве).',
    type: 'select',
    default: 'OFF',
    options: [
      { value: 'OFF', label: 'OFF' },
      { value: 'USB', label: 'USB' },
      { value: 'DIN', label: 'DIN' },
      { value: 'USB+DIN', label: 'USB+DIN' },
    ],
  },
  modeSlotDef(1),
  modeSlotDef(2),
  modeSlotDef(3),
  {
    key: 'startModeSlot',
    label: 'Режим при включении',
    hint:
      'Режим футсвитчей до первого CC#47; от него зависит действие CC#35–42. ' +
      'Прибор помнит режим сам, по MIDI его не узнать. По умолчанию — Mode Slot 2 (по умолчанию в нём SCENE).',
    type: 'select',
    default: '2',
    options: [
      { value: 'unknown', label: 'неизвестен' },
      { value: '1', label: 'Mode Slot 1' },
      { value: '2', label: 'Mode Slot 2' },
      { value: '3', label: 'Mode Slot 3' },
    ],
  },
  {
    key: 'startSetlist',
    label: 'Сетлист при включении',
    hint: 'Активный сетлист до первого CC#32: к нему относятся Program Change без Bank Select LSB.',
    type: 'select',
    default: 'unknown',
    options: [
      { value: 'unknown', label: 'неизвестен' },
      { value: '0', label: '0 — Factory Presets' },
      { value: '1', label: '1 — My Presets' },
      ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} — пользовательский` })),
    ],
  },
  {
    key: 'sceneBypassBehavior',
    label: 'SCENE BYPASS BEHAVIOR',
    hint:
      'Сохраняются ли в сцене переключения блоков футсвитчами в STOMP (CC#35–42 считаются нажатиями футсвитчей): ' +
      'без сохранения при возврате в сцену блоки снова такие, как при загрузке пресета.',
    type: 'select',
    default: 'overwrite',
    options: [
      { value: 'overwrite', label: 'Always overwrite bypass state' },
      { value: 'footswitch', label: 'Footswitch Presses are not saved' },
      { value: 'none', label: 'No changes are saved' },
    ],
  },
  {
    key: 'tempoMode',
    label: 'TEMPO MODE',
    hint:
      'GLOBAL — темп общий для всех пресетов; PRESET — темп задают пресет и сцены, после загрузки пресета ' +
      'и смены сцены он неизвестен. Влияет и на футсвитчи в окне Tempo. Заводское значение не документировано.',
    type: 'select',
    default: 'GLOBAL',
    options: [
      { value: 'GLOBAL', label: 'GLOBAL' },
      { value: 'PRESET', label: 'PRESET' },
    ],
  },
  {
    key: 'tempoLed',
    label: 'TEMPO LED',
    hint: 'Мигает ли светодиод TEMPO в темп.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'tempoWindowSeconds',
    label: 'Автозакрытие окна Tempo, с',
    hint:
      'Через сколько секунд после последнего удара Tap Tempo окно Tempo закрывается само; 0 — не закрывается. ' +
      'Время на приборе не документировано («через несколько секунд»); по умолчанию 5 с — рекомендация исследования.',
    type: 'number',
    default: 5,
    min: 0,
    max: 30,
  },
  {
    key: 'dimmedLeds',
    label: 'Dimmed LEDs',
    hint:
      'On: светодиоды невыбранных футсвитчей (не загруженных пресетов, не текущих сцен) светятся тускло; ' +
      'Off — не горят. Только изображение; заводское значение не документировано.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'liveTuner',
    label: 'LIVE TUNER',
    hint:
      'Переключатель меню Tuner, по MIDI не задаётся: полоса тюнера вверху Gig View. Только изображение; ' +
      'по умолчанию On — как на снимках Gig View в руководстве.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'tunerMute',
    label: 'Tuner: MUTE',
    hint:
      'Параметр меню Tuner, по MIDI не задаётся: глушение входов при открытом Tuner, футсвитч MUTE красный при On ' +
      'и белый при Off. Только изображение; по умолчанию On — как на снимке меню Tuner в руководстве.',
    type: 'boolean',
    default: true,
  },
  looperPressModeDef('looperRecordMode', 'RECORD MODE', 'CC#53'),
  looperPressModeDef('looperOverdubMode', 'OVERDUB MODE', 'CC#53'),
  looperPressModeDef('looperPunchMode', 'PUNCH MODE', 'CC#52'),
  ...LETTERS.map(looperActionDef),
];

/**
 * Читает настройки Quad Cortex в типизированном виде.
 *
 * @param values значения настроек; отсутствующие и недопустимые заменяются
 *   значениями по умолчанию из {@link QUAD_CORTEX_SETTINGS}.
 */
export function readSettings(values: DeviceSettings): QuadCortexSettings {
  const v = resolveSettings(QUAD_CORTEX_SETTINGS, values);
  const startMode = v.startModeSlot;
  const startSetlist = v.startSetlist;
  return {
    ignoreDuplicatePc: v.ignoreDuplicatePc as boolean,
    midiClockIn: v.midiClockIn as boolean,
    midiClockOut: v.midiClockOut as ClockOut,
    modeSlots: uniqueModes([v.modeSlot1 as ModeSlotValue, v.modeSlot2 as ModeSlotValue, v.modeSlot3 as ModeSlotValue]),
    startModeSlot: startMode === 'unknown' ? null : (Number(startMode) as 1 | 2 | 3),
    sceneBypassBehavior: v.sceneBypassBehavior as SceneBypassBehavior,
    tempoMode: v.tempoMode as 'GLOBAL' | 'PRESET',
    tempoLed: v.tempoLed as boolean,
    tempoWindowMs: (v.tempoWindowSeconds as number) * 1000,
    startSetlist: startSetlist === 'unknown' ? null : Number(startSetlist),
    looperActions: LETTERS.map((letter) => v[`looperAction${letter}`] as LooperAction),
    looperRecordMode: v.looperRecordMode as LooperPressMode,
    looperOverdubMode: v.looperOverdubMode as LooperPressMode,
    looperPunchMode: v.looperPunchMode as LooperPressMode,
    dimmedLeds: v.dimmedLeds as boolean,
    liveTuner: v.liveTuner as boolean,
    tunerMute: v.tunerMute as boolean,
  };
}

/** Заменяет на `EMPTY` слоты с режимом, который уже стоит в слоте с меньшим номером. */
function uniqueModes(slots: ModeSlots): ModeSlots {
  const used = new Set<RowMode>();
  const result = slots.map((slot) => {
    const rows = slotRows(slot);
    if (rows === null || rows.some((row) => used.has(row))) {
      return 'EMPTY';
    }
    rows.forEach((row) => used.add(row));
    return slot;
  });
  return [result[0], result[1], result[2]];
}

/**
 * Возвращает режим ряда A–D и ряда E–H для содержимого Mode Slot.
 *
 * @returns null для пустого слота.
 */
export function slotRows(value: ModeSlotValue): readonly [RowMode, RowMode] | null {
  if (value === 'EMPTY') {
    return null;
  }
  const [top, bottom = top] = value.split('+') as RowMode[];
  return [top, bottom];
}
