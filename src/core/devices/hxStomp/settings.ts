/**
 * Глобальные настройки HX Stomp, от которых зависят обработка входящих MIDI и
 * вид прибора, и допущения модели о подключении и содержимом пресетов.
 */

import type { DeviceSettings, SettingDef } from '../types.ts';
import { resolveSettings } from '../types.ts';

/** Порт HX Stomp, по которому приходит отслеживаемый поток: `midi` — разъём MIDI IN, `usb` — USB. */
export type HxPort = 'midi' | 'usb';

/** Порты, с которых принимается Program Change: `off` — ни один, `both` — MIDI IN и USB. */
export type HxPcRx = 'off' | 'midi' | 'usb' | 'both';

/** Приём внешнего MIDI Clock: `off` — не принимается, `midi` и `usb` — только с этого порта, `auto` — с любого. */
export type HxClockRx = 'off' | 'midi' | 'usb' | 'auto';

/**
 * Где хранится значение, которое прибор восстанавливает при смене снапшота
 * или пресета: `snapshot` — в каждом снапшоте (восстанавливается при смене
 * снапшота и пресета), `preset` — в пресете (при смене пресета), `global` —
 * одно для всех пресетов (не восстанавливается).
 */
export type HxRecallScope = 'snapshot' | 'preset' | 'global';

/** Вид номера пресета: `banks` — банк и слот `01A`…`42C`, `numbers` — номер `000`…`125`. */
export type HxPresetNumbering = 'banks' | 'numbers';

/**
 * Snapshot Edits: `recall` — правки снапшота запоминаются при переходе на
 * другой снапшот, `discard` — отбрасываются при уходе со снапшота и при его
 * повторном вызове.
 */
export type HxSnapshotEdits = 'recall' | 'discard';

/**
 * Bypass Type: `analog` — при All Bypass сигнал идёт с входов на выходы через
 * реле без обработки, `dsp` — хвосты задержек и реверберации затухают
 * естественно.
 */
export type HxBypassType = 'analog' | 'dsp';

/** Режим футсвитчей HX Stomp; порядок перебора — {@link MODE_ORDER}. */
export type HxFootswitchMode = 'stomp' | 'scroll' | 'preset' | 'snapshot';

/**
 * Функция футсвитча FS3, FS4 или FS5 (Global Settings > Footswitches);
 * названия на приборе — {@link FS_FUNCTION_NAMES}. `stomp` — назначения
 * пресета (Stomp 3, Stomp 4, Stomp 5).
 */
export type HxFsFunction =
  | 'tapTuner'
  | 'stomp'
  | 'bankUp'
  | 'bankDown'
  | 'presetUp'
  | 'presetDown'
  | 'snapshotUp'
  | 'snapshotDown'
  | 'nextMode'
  | 'prevMode'
  | 'allBypass'
  | 'toggleExp';

/** Значения настроек HX Stomp. */
export type HxSettings = {
  /** Порт, по которому HX Stomp получает отслеживаемый поток. */
  port: HxPort;
  /** USB MIDI: принимаются ли сообщения, пришедшие по USB. */
  usbMidi: boolean;
  /** MIDI PC Rx. */
  pcRx: HxPcRx;
  /** Rx MIDI Clock. */
  rxClock: HxClockRx;
  /** Tempo Select: где хранится темп. */
  tempoSelect: HxRecallScope;
  /** EXP 1 Position: где хранится положение педали EXP 1. */
  exp1Position: HxRecallScope;
  /** EXP 2 Position: где хранится положение педали EXP 2. */
  exp2Position: HxRecallScope;
  /**
   * FS3 Function: функция FS3 в режимах Stomp и Scroll и его эмуляции CC51;
   * `bankUp`, `bankDown`, `nextMode` и `prevMode` для FS3 недопустимы.
   */
  fs3Function: HxFsFunction;
  /** FS4 Function: функция внешнего футсвитча FS4 и его эмуляции CC52. */
  fs4Function: HxFsFunction;
  /** FS5 Function: функция внешнего футсвитча FS5 и его эмуляции CC53. */
  fs5Function: HxFsFunction;
  /** Preset Number. */
  presetNumber: HxPresetNumbering;
  /** Snapshot Edits; значок камеры серый при `recall` и красный при `discard`. */
  snapshotEdits: HxSnapshotEdits;
  /** Bypass Type. */
  bypassType: HxBypassType;
  /** Tap LED: мигает ли кольцо TAP в темпе. */
  tapLed: boolean;
  /** Режим футсвитчей сразу после включения. */
  initialMode: HxFootswitchMode;
  /**
   * Есть ли в пресетах блок 1 Switch Looper, назначенный на футсвитч режима
   * Stomp; без него команды лупера CC60–CC66 не действуют.
   */
  looper: boolean;
};

/** Режимы футсвитчей в порядке перебора кнопками PAGE: слева направо по отметке режима на экране. */
export const MODE_ORDER: readonly HxFootswitchMode[] = ['stomp', 'scroll', 'preset', 'snapshot'];

/** Названия режимов футсвитчей, как на приборе. */
export const MODE_NAMES: Record<HxFootswitchMode, string> = {
  stomp: 'Stomp',
  scroll: 'Scroll',
  preset: 'Preset',
  snapshot: 'Snapshot',
};

/** Названия функций футсвитчей, как на приборе; к `Stomp` прибор добавляет номер футсвитча. */
export const FS_FUNCTION_NAMES: Record<HxFsFunction, string> = {
  tapTuner: 'TAP/Tuner',
  stomp: 'Stomp',
  bankUp: 'Bank Up',
  bankDown: 'Bank Down',
  presetUp: 'Preset Up',
  presetDown: 'Preset Down',
  snapshotUp: 'Snapshot Up',
  snapshotDown: 'Snapshot Down',
  nextMode: 'Next Footswitch Mode',
  prevMode: 'Previous Footswitch Mode',
  allBypass: 'All Bypass',
  toggleExp: 'Toggle EXP 1/2',
};

/** Названия портов для описаний команд. */
export const PORT_NAMES: Record<HxPort, string> = { midi: 'MIDI IN', usb: 'USB' };

/** Названия значений MIDI PC Rx. */
export const PC_RX_NAMES: Record<HxPcRx, string> = { off: 'Off', midi: 'MIDI', usb: 'USB', both: 'MIDI+USB' };

/** Названия значений Rx MIDI Clock. */
export const CLOCK_RX_NAMES: Record<HxClockRx, string> = { off: 'Off', midi: 'MIDI', usb: 'USB', auto: 'Auto' };

const FS3_FUNCTIONS: readonly HxFsFunction[] = [
  'tapTuner',
  'stomp',
  'presetUp',
  'presetDown',
  'snapshotUp',
  'snapshotDown',
  'allBypass',
  'toggleExp',
];

const FS45_FUNCTIONS: readonly HxFsFunction[] = [
  'tapTuner',
  'stomp',
  'bankUp',
  'bankDown',
  'presetUp',
  'presetDown',
  'snapshotUp',
  'snapshotDown',
  'nextMode',
  'prevMode',
  'allBypass',
  'toggleExp',
];

/**
 * Возвращает название функции футсвитча, как на приборе; у `stomp` — с
 * номером футсвитча, например `Stomp 4`.
 *
 * @param footswitch номер футсвитча 1–5.
 */
export function fsFunctionName(fn: HxFsFunction, footswitch: number): string {
  return fn === 'stomp' ? `Stomp ${footswitch}` : FS_FUNCTION_NAMES[fn];
}

function fsFunctionOptions(footswitch: 3 | 4 | 5): { value: string; label: string }[] {
  return (footswitch === 3 ? FS3_FUNCTIONS : FS45_FUNCTIONS).map((fn) => ({
    value: fn,
    label: fsFunctionName(fn, footswitch),
  }));
}

const RECALL_OPTIONS = [
  { value: 'snapshot', label: 'Per Snapshot' },
  { value: 'preset', label: 'Per Preset' },
  { value: 'global', label: 'Global' },
];

const MODE_OPTIONS = MODE_ORDER.map((mode) => ({ value: mode, label: MODE_NAMES[mode] }));

/** Описание настройки HX Stomp: ключ — поле {@link HxSettings}. */
type HxSettingDef = SettingDef & { key: keyof HxSettings };

/**
 * Настройки HX Stomp в порядке показа в форме. Значения по умолчанию —
 * заводские значения прибора; где руководство их не называет — наиболее
 * вероятные.
 */
export const HX_SETTINGS: readonly HxSettingDef[] = [
  {
    key: 'port',
    label: 'Порт приёма',
    hint:
      'Через какой порт HX Stomp получает отслеживаемый поток: разъём MIDI IN или USB. ' +
      'От порта зависит действие настроек USB MIDI, MIDI PC Rx и Rx MIDI Clock.',
    type: 'select',
    default: 'midi',
    options: [
      { value: 'midi', label: 'MIDI IN' },
      { value: 'usb', label: 'USB' },
    ],
  },
  {
    key: 'usbMidi',
    label: 'Приём по USB (USB MIDI)',
    hint: 'Global Settings > MIDI/Tempo > USB MIDI. При Off сообщения, пришедшие по USB, не принимаются.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'pcRx',
    label: 'Приём Program Change (MIDI PC Rx)',
    hint:
      'Global Settings > MIDI/Tempo > MIDI PC Rx: с каких портов принимается Program Change; ' +
      'при Off пресеты по MIDI не переключаются.',
    type: 'select',
    default: 'both',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'midi', label: 'MIDI' },
      { value: 'usb', label: 'USB' },
      { value: 'both', label: 'MIDI+USB' },
    ],
  },
  {
    key: 'rxClock',
    label: 'Приём MIDI Clock (Rx MIDI Clock)',
    hint:
      'Global Settings > MIDI/Tempo > Rx MIDI Clock: следовать ли темпу внешнего MIDI Clock и с какого порта; ' +
      'Auto — с того, где клок появится. Пока прибор следует клоку, кольцо TAP мигает синим, а Tap Tempo не действует.',
    type: 'select',
    default: 'auto',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'midi', label: 'MIDI' },
      { value: 'usb', label: 'USB' },
      { value: 'auto', label: 'Auto' },
    ],
  },
  {
    key: 'tempoSelect',
    label: 'Хранение темпа (Tempo Select)',
    hint:
      'Global Settings > MIDI/Tempo > Tempo Select: темп хранится в каждом снапшоте, в пресете или один для всех. ' +
      'При Per Snapshot и Per Preset смена снапшота или пресета задаёт сохранённый в нём темп — модели он неизвестен.',
    type: 'select',
    default: 'preset',
    options: RECALL_OPTIONS,
  },
  {
    key: 'exp1Position',
    label: 'Положение EXP 1 (EXP 1 Position)',
    hint:
      'Global Settings > EXP Pedals > EXP 1 Position: положение педали EXP 1 (CC1) хранится в снапшоте, ' +
      'в пресете или одно для всех; восстановленное положение модели неизвестно.',
    type: 'select',
    default: 'preset',
    options: RECALL_OPTIONS,
  },
  {
    key: 'exp2Position',
    label: 'Положение EXP 2 (EXP 2 Position)',
    hint:
      'Global Settings > EXP Pedals > EXP 2 Position: положение педали EXP 2 (CC2) хранится в снапшоте, ' +
      'в пресете или одно для всех; восстановленное положение модели неизвестно.',
    type: 'select',
    default: 'preset',
    options: RECALL_OPTIONS,
  },
  {
    key: 'fs3Function',
    label: 'Функция FS3 (FS3 Function)',
    hint:
      'Global Settings > Footswitches > FS3 Function: что делают FS3 в режимах Stomp и Scroll и его эмуляция CC51; ' +
      'от функции зависит подпись FS3 на экране.',
    type: 'select',
    default: 'tapTuner',
    options: fsFunctionOptions(3),
  },
  {
    key: 'fs4Function',
    label: 'Функция FS4 (FS4 Function)',
    hint: 'Global Settings > Footswitches > FS4 Function: что делают внешний футсвитч FS4 и его эмуляция CC52.',
    type: 'select',
    default: 'allBypass',
    options: fsFunctionOptions(4),
  },
  {
    key: 'fs5Function',
    label: 'Функция FS5 (FS5 Function)',
    hint: 'Global Settings > Footswitches > FS5 Function: что делают внешний футсвитч FS5 и его эмуляция CC53.',
    type: 'select',
    default: 'toggleExp',
    options: fsFunctionOptions(5),
  },
  {
    key: 'presetNumber',
    label: 'Номер пресета (Preset Number)',
    hint:
      'Global Settings > Preferences > Preset Number: как показывается номер пресета на экране и в описаниях — ' +
      'банк и слот (01A–42C) или номер Program Change (000–125).',
    type: 'select',
    default: 'banks',
    options: [
      { value: 'banks', label: '01A–42C' },
      { value: 'numbers', label: '000–125' },
    ],
  },
  {
    key: 'snapshotEdits',
    label: 'Правки снапшотов (Snapshot Edits)',
    hint:
      'Global Settings > Preferences > Snapsht Edits: Recall — правки снапшота запоминаются при переходе ' +
      'на другой снапшот, Discard — отбрасываются. Значок камеры серый при Recall и красный при Discard.',
    type: 'select',
    default: 'recall',
    options: [
      { value: 'recall', label: 'Recall' },
      { value: 'discard', label: 'Discard' },
    ],
  },
  {
    key: 'bypassType',
    label: 'Тип All Bypass (Bypass Type)',
    hint:
      'Global Settings > Preferences > Bypass Type: при All Bypass (CC70) сигнал идёт через реле без обработки ' +
      '(Analog) или хвосты задержек и реверберации затухают (DSP); от типа зависит надпись на экране.',
    type: 'select',
    default: 'analog',
    options: [
      { value: 'analog', label: 'Analog' },
      { value: 'dsp', label: 'DSP' },
    ],
  },
  {
    key: 'tapLed',
    label: 'Мигание TAP (Tap LED)',
    hint: 'Global Settings > Displays > Tap LED: мигает ли кольцо TAP в темпе.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'initialMode',
    label: 'Режим футсвитчей при включении',
    hint:
      'С каким режимом футсвитчей устройство начинает работу после включения или сброса; руководство его ' +
      'не называет. Смена пресета режим не меняет.',
    type: 'select',
    default: 'stomp',
    options: MODE_OPTIONS,
  },
  {
    key: 'looper',
    label: '1 Switch Looper в пресетах',
    hint:
      'Есть ли в пресетах блок 1 Switch Looper, назначенный на футсвитч режима Stomp. Без него команды лупера ' +
      'CC60–CC66 не действуют; содержимое пресетов модели неизвестно.',
    type: 'boolean',
    default: true,
  },
];

/**
 * Возвращает значения настроек HX Stomp: отсутствующие и недопустимые
 * значения заменяются значениями по умолчанию, неизвестные ключи
 * отбрасываются.
 *
 * @param values исходные значения; отсутствующий объект равнозначен пустому.
 */
export function readSettings(values: Partial<DeviceSettings> | undefined): HxSettings {
  return resolveSettings(HX_SETTINGS, values) as HxSettings;
}

/**
 * Проверяет, принимает ли HX Stomp сообщения с порта приёма `settings.port`:
 * с MIDI IN — всегда, по USB — только при USB MIDI = On.
 */
export function receivesPort(settings: HxSettings): boolean {
  return settings.port === 'midi' || settings.usbMidi;
}

/** Проверяет, разрешает ли MIDI PC Rx принимать Program Change с порта приёма `settings.port`. */
export function pcAllowed(settings: HxSettings): boolean {
  return settings.pcRx === 'both' || settings.pcRx === settings.port;
}

/** Проверяет, разрешает ли Rx MIDI Clock следовать MIDI Clock с порта приёма `settings.port`. */
export function clockAllowed(settings: HxSettings): boolean {
  return settings.rxClock === 'auto' || settings.rxClock === settings.port;
}
