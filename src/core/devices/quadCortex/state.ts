/**
 * Состояние модели Quad Cortex: всё, что нужно, чтобы нарисовать прибор, его
 * экран и светодиоды после последовательности входящих MIDI-сообщений.
 *
 * Состояние неизменяемое и пригодно для JSON. Сведения, которых по MIDI не
 * узнать, — содержимое пресетов (имена, блоки, назначения футсвитчей, сцена
 * по умолчанию, темп пресета) и всё, что было до включения, — хранятся как
 * null, то есть «неизвестно». Моменты времени — миллисекунды Unix-времени из
 * `HandleContext.time` полученных сообщений. Поля с пометкой «служебное»
 * нужны модели для обработки следующих сообщений, для изображения — нет.
 */

import type { DeviceStateBase } from '../types.ts';

/** Буквы футсвитчей и сцен по порядку. */
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Буква футсвитча (A–D — верхний ряд, E–H — нижний) или сцены. */
export type Letter = (typeof LETTERS)[number];

/** Режим ряда футсвитчей: загрузка пресетов, вызов сцен или переключение блоков. */
export type RowMode = 'PRESET' | 'SCENE' | 'STOMP';

/** Режим футсвитчей прибора. */
export interface FootswitchMode {
  /**
   * Название на индикаторе режима в правом верхнем углу The Grid. `HYBRID` —
   * ряды футсвитчей в разных режимах.
   */
  name: RowMode | 'HYBRID';
  /** Режимы рядов: верхнего A–D и нижнего E–H. У режима не HYBRID одинаковы. */
  rows: readonly [RowMode, RowMode];
  /** Mode Slot в Modes Configuration, из которого выбран режим: его вызывает CC#47 = slot − 1. */
  slot: 1 | 2 | 3;
}

/**
 * Экран поверх The Grid: `gigView` — Gig View, `tuner` — меню Tuner,
 * `tempo` — окно Tempo (меню Tempo & Metronome), которое показывает Tap
 * Tempo, `looper` — редактор Looper X.
 */
export type Screen = 'gigView' | 'tuner' | 'tempo' | 'looper';

/**
 * Что делает нажатие футсвитча A–H: `preset` — загружает пресет, `scene` —
 * вызывает сцену, `stomp` — переключает назначенные на футсвитч блоки,
 * `looper` — действие Looper X (в режиме Parameters футсвитчи — энкодеры),
 * `tuner` и `tempo` — функцию меню Tuner или окна Tempo.
 */
export type FootswitchRole = 'preset' | 'scene' | 'stomp' | 'looper' | 'tuner' | 'tempo';

/** Футсвитч A–H: назначение, подпись и подсветка. */
export interface FootswitchState {
  letter: Letter;
  /**
   * Назначение по верхнему экрану из {@link QuadCortexState.screens}: Tuner,
   * окно Tempo и Looper X перехватывают футсвитчи, Gig View и The Grid —
   * нет, тогда назначение задаёт режим ряда. null — режим неизвестен.
   */
  role: FootswitchRole | null;
  /**
   * Подпись: обозначение пресета (`2C`; при банках по 4 — `17D`), буква
   * сцены или действие Looper X в текущем виде (`RECORD` или `OVERDUB`,
   * `PLAY` или `STOP`, `UNDO` или `REDO`, `PUNCH IN` или `PUNCH OUT` и т. д.).
   * null — неизвестна (пресет неизвестен) или подписи нет (`stomp`, `tuner`,
   * `tempo`, Looper X в режиме Parameters).
   */
  label: string | null;
  /** Имя пресета, сцены или стомпа. Содержимое пресетов неизвестно, поэтому всегда null. */
  name: string | null;
  /**
   * Активен ли футсвитч: его пресет загружен, его сцена текущая, его действие
   * Looper X идёт или включено. Активный футсвитч горит ярко, остальные —
   * тускло или не горят по настройке Dimmed LEDs. null — неизвестно:
   * состояние блоков в STOMP, неизвестные пресет, сцена или режим, меню
   * Tuner, окно Tempo, Looper X в режиме Parameters.
   */
  active: boolean | null;
  /**
   * Только для `stomp`: назначенные блоки переключены нечётное число раз с
   * загрузки пресета в текущей сцене, то есть их bypass противоположен
   * сохранённому в пресете. В остальных назначениях false.
   */
  toggled: boolean;
}

/** Загруженный пресет и активный сетлист. */
export interface PresetState {
  /**
   * Активный сетлист — номер CC#32: 0 — Factory Presets, 1 — My Presets,
   * 2–12 — пользовательские. К нему относятся PC без CC#32. null — неизвестен.
   */
  setlist: number | null;
  /** Имя активного сетлиста: `Factory Presets`, `My Presets`; у пользовательских и неизвестного — null. */
  setlistName: string | null;
  /** Индекс пресета в сетлисте 0–255 (CC#0 × 128 + PC). null — пресет неизвестен, например до первого PC. */
  index: number | null;
  /** Номер банка в обозначении на приборе: 1–32 при банках по 8, 1–64 при банках по 4; null — пресет неизвестен. */
  bank: number | null;
  /** Буква слота в обозначении на приборе: A–H при банках по 8, A–D при банках по 4; null — пресет неизвестен. */
  slot: string | null;
  /** Обозначение в верхней строке The Grid и в Gig View: `bank` и `slot`, например `9D` или `17D`. */
  label: string | null;
  /** Обозначение при банках по 8, например `9D`; совпадает с `label`, если `banksOfFour` = false. */
  standardLabel: string | null;
  /**
   * Банки по 4 пресета: в Modes Configuration есть HYBRID с PRESET, и ряд
   * PRESET переключает банки по 4 пресета с буквами A–D.
   */
  banksOfFour: boolean;
  /** Имя пресета. Приложению неизвестно, поэтому всегда null. */
  name: string | null;
}

/** Значения Bank Select: запомненная группа пресетов и значения, ожидающие Program Change. */
export interface BankSelectState {
  /** Последнее полученное CC#0 (0 или 1): группа пресетов, к которой относится каждый PC. После включения — 0. */
  msb: number;
  /** CC#0, полученный после последнего PC; null — не было. Отображение не меняет, ждёт PC. */
  pendingMsb: number | null;
  /** CC#32 (сетлист), полученный после последнего PC; null — не было. Станет активным сетлистом при следующем PC. */
  pendingLsb: number | null;
}

/**
 * Цвет светодиода TEMPO: `red` — Quad Cortex передаёт MIDI Clock (MIDI Clock
 * Out не OFF), `blue` — синхронизирован к входящему MIDI Clock, `green` —
 * внутренний темп, `off` — мигание выключено настройкой TEMPO LED.
 */
export type TempoLed = 'green' | 'blue' | 'red' | 'off';

/** Темп, Tap Tempo и синхронизация к внешнему MIDI Clock. */
export interface TempoState {
  /**
   * Действующий темп, BPM с точностью 0,1: при синхронизации — темп внешнего
   * MIDI Clock, иначе внутренний темп прибора. null — неизвестен: после
   * включения до Tap Tempo, после загрузки пресета и смены сцены при TEMPO
   * MODE = PRESET, в первые импульсы синхронизации. На The Grid и в Gig View
   * темп не выводится — только в окне Tempo и миганием светодиода TEMPO.
   */
  bpm: number | null;
  /**
   * Чем задан темп: `clock` — внешний MIDI Clock (при синхронизации, даже
   * пока `bpm` не определён), `tap` — Tap Tempo; null — темп неизвестен.
   */
  source: 'tap' | 'clock' | null;
  /**
   * Время доли, от которой отсчитывается мигание светодиода TEMPO: удара Tap
   * Tempo, задавшего темп, или последней доли внешнего MIDI Clock (каждого
   * 24-го импульса). Светодиод вспыхивает в этот момент и далее через каждые
   * 60 000 / `bpm` мс. null — фаза неизвестна.
   */
  beatTime: number | null;
  /**
   * Время первой доли такта, от которой Looper X с QUANTIZE отсчитывает
   * такты: удар Tap Tempo, задавший темп, или первая доля после MIDI Start
   * либо после начала синхронизации к MIDI Clock. null — неизвестно.
   */
  downbeatTime: number | null;
  led: TempoLed;
  /** Номер последнего удара в текущей серии Tap Tempo; 0 — ударов не было. */
  taps: number;
  /** Время последнего удара Tap Tempo; null — ударов не было. */
  lastTapTime: number | null;
  /** Синхронизирован ли темп к внешнему MIDI Clock: MIDI Clock In = On, MIDI Clock Out = OFF и импульсы идут. */
  clockSynced: boolean;
  /**
   * Только при синхронизации: внутренний темп, BPM, к которому прибор
   * вернётся, когда MIDI Clock прекратится. null — неизвестен или
   * синхронизации нет.
   */
  internalBpm: number | null;
  /** Только при синхронизации: время доли внутреннего темпа `internalBpm`; null — неизвестно или синхронизации нет. */
  internalBeatTime: number | null;
  /** Служебное: время начала синхронизации или последней доли MIDI Clock; по нему замечается остановка clock. */
  clockSeen: number | null;
  /** Служебное: номер импульса Timing Clock (`ClockInfo.ticks`), с которого начнётся следующая доля. */
  nextBeatTick: number | null;
  /** Служебное: номер импульса Timing Clock, который станет первой долей такта; null — не ожидается. */
  downbeatTick: number | null;
  /** Когда окно Tempo закроется само; null — окно закрыто или само не закрывается. */
  windowClosesAt: number | null;
}

/**
 * Состояние петли Looper X: `empty` — петли нет, `recording` — запись новой
 * петли, `playing` — воспроизведение, `overdubbing` — воспроизведение с
 * OVERDUB, `punching` — воспроизведение с PUNCH IN, `duplicating` —
 * воспроизведение с DUPLICATE, `stopped` — петля записана и остановлена.
 */
export type LooperTransport =
  | 'empty'
  | 'recording'
  | 'playing'
  | 'overdubbing'
  | 'punching'
  | 'duplicating'
  | 'stopped';

/** Взведённое действие Looper X: RECORD, DUPLICATE или PLAY. */
export type LooperArmed = 'record' | 'duplicate' | 'play';

/**
 * Looper X: вид редактора, петля и параметры блока. Открыт ли редактор,
 * показывает {@link QuadCortexState.screens}. Параметры блока, которые по
 * MIDI не задаются (THRESHOLD, PRE ROLL, RECORDING LENGTH), считаются
 * выключенными.
 */
export interface LooperState {
  /** Вид редактора: Perform — действия на футсвитчах A–H, Parameters — параметры на энкодерах. */
  view: 'perform' | 'parameters';
  transport: LooperTransport;
  /**
   * Взведённое действие — статус «Armed»: при MIDI CLOCK START = On RECORD,
   * DUPLICATE и PLAY ждут MIDI Start, при QUANTIZE запись новой петли ждёт
   * первой доли следующего такта. null — ничего не взведено.
   */
  armed: LooperArmed | null;
  /** Когда начнётся запись, взведённая QUANTIZE; null — взведённое действие ждёт MIDI Start или ничего не взведено. */
  armedUntil: number | null;
  /** ONE SHOT: петля проигрывается один раз и останавливается. */
  oneShot: boolean;
  /** HALF SPEED: воспроизведение на половинной скорости. */
  halfSpeed: boolean;
  /** REVERSE: воспроизведение в обратную сторону. */
  reverse: boolean;
  /** Подпись кнопки UNDO: `UNDO`, после отмены — `REDO`; null — отменять нечего. */
  undo: 'UNDO' | 'REDO' | null;
  /**
   * Длина петли при обычной скорости, мс; null — петли нет или длина
   * неизвестна (после RE-LOOP или записи с неизвестным началом).
   */
  length: number | null;
  /** Начало записи новой петли; null — такая запись не идёт или её начало неизвестно. */
  recordStart: number | null;
  /**
   * Когда закончится запись новой петли, которую QUANTIZE доводит до конца
   * такта, — после этого петля играет; null — запись сама не заканчивается.
   */
  recordEndsAt: number | null;
  /**
   * Момент, когда петля начала проигрываться с начала; позиция — остаток от
   * деления прошедшего времени на `length` (×2 при HALF SPEED). null — не
   * воспроизводится или позиция неизвестна.
   */
  loopStart: number | null;
  /** Когда петля остановится сама при ONE SHOT; null — сама не остановится или момент неизвестен. */
  stopsAt: number | null;
  /** DUPLICATE MODE (CC#57); null — неизвестен (параметр блока в пресете). */
  duplicateMode: 'Free' | 'Sync' | null;
  /** QUANTIZE в долях на такт (CC#58): 0 — Off, 1–8 или 16; null — неизвестен, действует как Off. */
  quantize: number | null;
  /** MIDI CLOCK START (CC#59); null — неизвестен, действует как Off. */
  midiClockStart: boolean | null;
  /** ROUTING MODE (CC#61), как на приборе: `Grid`, `Input 1`, …, `Multiple Outputs`; null — неизвестен. */
  routing: string | null;
}

/**
 * Состояние Quad Cortex в момент последнего обработанного сообщения. Что
 * наступает позже без сообщений — автозакрытие окна Tempo, остановка MIDI
 * Clock, события Looper X, — показывает состояние, пересчитанное на нужный
 * момент функцией `quadCortexAt`.
 */
export interface QuadCortexState extends DeviceStateBase {
  preset: PresetState;
  bankSelect: BankSelectState;
  /**
   * Текущая сцена — буква в правом верхнем углу The Grid. null — неизвестна:
   * до CC#43 и после загрузки пресета, потому что сцена по умолчанию хранится
   * в пресете.
   */
  scene: Letter | null;
  /** Режим футсвитчей; null — неизвестен. */
  mode: FootswitchMode | null;
  /** Футсвитчи A–H по порядку. */
  footswitches: readonly FootswitchState[];
  /**
   * Экраны поверх The Grid в порядке открытия: последний виден сверху и
   * перехватывает футсвитчи; пустой список — видна The Grid.
   */
  screens: readonly Screen[];
  tempo: TempoState;
  looper: LooperState;
  /** Положения EXP 1 и EXP 2 (CC#1, CC#2): 0 — пятка (Heel), 127 — носок (Toe); null — неизвестно. */
  expression: readonly [number | null, number | null];
  /**
   * Служебное: для каждой сцены (ключ — буква, `?` — неизвестная сцена)
   * флаги футсвитчей A–H, блоки которых в STOMP переключены нечётное число
   * раз с загрузки пресета.
   */
  stompFlips: Readonly<Partial<Record<Letter | '?', readonly boolean[]>>>;
  /**
   * Служебное: время последнего значения 64–127 для CC#35–42 и CC#44 (ключ —
   * номер CC); по нему значение 0–63 вскоре после него помечается как
   * возможное отпускание кнопки контроллера.
   */
  lastPress: Readonly<Record<string, number>>;
}
