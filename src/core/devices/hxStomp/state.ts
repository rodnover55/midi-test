/**
 * Состояние модели Line 6 HX Stomp с прошивкой 3.80: то, что видно на
 * приборе, — экран, режим и кольца футсвитчей, лупер, темп, — и то, что нужно
 * для обработки следующих MIDI-сообщений.
 *
 * Все объекты неизменяемы и пригодны для JSON. Время — миллисекунды
 * Unix-времени из `HandleContext.time`.
 *
 * Содержимое пресетов — имена, блоки, назначения футсвитчей и контроллеров,
 * сохранённые в пресете снапшот, темп и положения педалей — модели
 * недоступно: зависящие от него значения равны null или помечены как
 * неизвестные.
 */

import type { DeviceStateBase } from '../types.ts';
import type { HxFootswitchMode, HxSettings } from './settings.ts';

/** Пресет в банке: A, B или C. */
export type HxSlot = 'A' | 'B' | 'C';

/** Номер снапшота: у пресета HX Stomp три снапшота. */
export type HxSnapshot = 1 | 2 | 3;

/** Номер страницы настроек экрана Tuner. */
export type HxTunerPage = 1 | 2 | 3 | 4;

/** Пресет прибора: место в памяти и обозначение на экране. */
export interface HxPreset {
  /** Номер пресета 0–125, он же номер Program Change, который загружает пресет. */
  index: number;
  /** Банк 1–42. */
  bank: number;
  slot: HxSlot;
  /** Обозначение на экране по настройке Preset Number: `01A`…`42C` или `000`…`125`. */
  label: string;
  /** Имя пресета; null — неизвестно: имена пресетов модели недоступны. */
  name: string | null;
}

/**
 * Банк, выбранный функцией Bank Up или Bank Down и ожидающий выбора пресета.
 * Пока банк в очереди, футсвитчи показывают режим Preset, номера пресетов
 * банка мигают, а нажатие FS1–FS3 загружает пресет A–C этого банка.
 */
export interface HxBankQueue {
  /** Банк 1–42; null — неизвестен, потому что был неизвестен текущий пресет. */
  bank: number | null;
  /** Режим футсвитчей, в который прибор вернётся после выбора пресета. */
  returnMode: HxFootswitchMode;
}

/**
 * Откуда действующий темп: `tap` — Tap Tempo, `clock` — внешний MIDI Clock,
 * `preset` и `snapshot` — сохранён в пресете или снапшоте (по Tempo Select).
 */
export type HxTempoSource = 'tap' | 'clock' | 'preset' | 'snapshot';

/** Собственный темп прибора, к которому он вернётся, когда пропадёт внешний MIDI Clock. */
export interface HxOwnTempo {
  /** Темп, BPM с точностью 0,1; null — неизвестен. */
  bpm: number | null;
  /** Откуда темп; null — неизвестно. */
  source: Exclude<HxTempoSource, 'clock'> | null;
  /** Время доли, от которой отсчитывалось мигание TAP; null — неизвестно. */
  beatTime: number | null;
}

/** Серия ударов Tap Tempo. */
export interface HxTapSeries {
  /**
   * Число ударов в серии; 0 — ударов не было. Серию прерывает пауза дольше
   * 1,5 с: удары реже 40 BPM темп не задают.
   */
  count: number;
  /** Время последних ударов серии, до пяти, по возрастанию; темп — по среднему интервалу между ними. */
  times: readonly number[];
}

/** Следование внешнему MIDI Clock. */
export interface HxClockFollow {
  /** Число импульсов Timing Clock с начала следования; каждые 24 импульса — доля. */
  ticks: number;
  /**
   * Время последнего импульса. Если импульсов нет дольше 250 мс, прибор
   * возвращается к собственному темпу (`HxTempo.own`) и красному миганию TAP;
   * модель отмечает это только при следующем сообщении, поэтому изображение
   * может считать клок пропавшим уже через 250 мс после `lastTick`.
   */
  lastTick: number;
}

/** Темп прибора. */
export interface HxTempo {
  /**
   * Действующий темп, BPM с точностью 0,1; null — неизвестен. В этом темпе
   * мигает кольцо TAP и звучат эффекты с длительностями в нотах.
   */
  bpm: number | null;
  /** Откуда действующий темп; null — неизвестно: прибор только что включён. */
  source: HxTempoSource | null;
  /**
   * Время доли, от которой отсчитывается мигание TAP: последний удар, задавший
   * темп Tap Tempo, или первый импульс последней доли MIDI Clock; null —
   * неизвестно. Вспышки — в это время и далее через 60000 / `bpm` мс.
   */
  beatTime: number | null;
  /** Текущая серия ударов Tap Tempo. */
  tap: HxTapSeries;
  /** Собственный темп на время следования MIDI Clock; null, пока прибор клоку не следует. */
  own: HxOwnTempo | null;
  /** Следование внешнему MIDI Clock; null — прибор клоку не следует. */
  clock: HxClockFollow | null;
}

/** Цвет кольца футсвитча, который задаёт прошивка, а не пресет. */
export type HxRingColor = 'red' | 'green' | 'amber' | 'white' | 'blue';

/** LED-кольцо футсвитча. */
export interface HxRing {
  /**
   * Как горит кольцо:
   * - `off` — не горит;
   * - `on` — горит ярко;
   * - `dim` — горит тускло;
   * - `tempo` — мигает в темпе: вспышки в `tempo.beatTime` и далее через
   *   60000 / `tempo.bpm` мс; если `tempo.bpm` или `tempo.beatTime` равны
   *   null, кольцо мигает в неизвестном темпе или фазе;
   * - `tuner` — показывает настройку тюнера, показания зависят от звука;
   * - `unknown` — зависит от содержимого пресета (назначений и состояния
   *   блоков) и неизвестно.
   */
  light: 'off' | 'on' | 'dim' | 'tempo' | 'tuner' | 'unknown';
  /**
   * Цвет при `on`, `dim` и `tempo`; null — цвет задан пресетом (цвет
   * категории блока или пользовательский) и неизвестен. При `off`, `tuner` и
   * `unknown` — null.
   */
  color: HxRingColor | null;
}

/**
 * Подпись футсвитча в нижней половине Play view:
 * - `assignment` — назначение режима Stomp: имя блока, команда или
 *   пользовательская подпись из пресета, неизвестно;
 * - `text` — надпись прошивки: `TAP/TUNER` (красная), `PRESET ∨` и
 *   `PRESET ∧` (белые);
 * - `function` — функция FS3 из настройки FS3 Function, кроме TAP/Tuner и
 *   Stomp 3; `name` — название функции, точная надпись прибора не
 *   подтверждена;
 * - `preset` — пресет банка в режиме Preset: `index` — номер, `label` —
 *   обозначение, `current` — загружен ли он, `blinking` — мигает ли, потому
 *   что банк в очереди;
 * - `snapshot` — снапшот в режиме Snapshot: значок камеры с номером
 *   `snapshot`; `current` — выбран ли он, null — неизвестно. Пользовательское
 *   имя снапшота, если оно задано в пресете, неизвестно;
 * - `unknown` — неизвестно: режим Preset при неизвестном банке.
 */
export type HxSwitchLabel =
  | { kind: 'assignment' }
  | { kind: 'text'; text: string; color: 'red' | 'white' }
  | { kind: 'function'; name: string }
  | { kind: 'preset'; index: number; label: string; current: boolean; blinking: boolean }
  | { kind: 'snapshot'; snapshot: HxSnapshot; current: boolean | null }
  | { kind: 'unknown' };

/** Подпись и кольцо одного из футсвитчей FS1–FS3 на корпусе. */
export interface HxSwitchDisplay {
  /** Подпись в Play view; Edit view и Tuner подписей футсвитчей не показывают. */
  label: HxSwitchLabel;
  ring: HxRing;
}

/** Эмулированный футсвитч FS1–FS5 (CC49–CC53). */
export interface HxFootswitch {
  /**
   * Удерживается ли футсвитч: после нажатия значением 64–127 и до отпускания
   * значением 0–63. У FS4 и FS5 всегда false: любое их значение — нажатие и
   * сразу отпускание.
   */
  pressed: boolean;
  /**
   * Переключило ли удерживаемое нажатие назначения пресета (функция Stomp):
   * отпускание вернёт назначения типа Momentary.
   */
  stompHeld: boolean;
  /** Время последнего нажатия; null — с включения не нажимался. */
  lastPress: number | null;
}

/**
 * Состояние петли 1 Switch Looper: `empty` — петли нет, `recording` — запись,
 * `playing` — воспроизведение, `overdubbing` — наложение (Overdub),
 * `stopped` — остановлен, петля в памяти.
 */
export type HxLooperStatus = 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped';

/** Блок 1 Switch Looper. */
export interface HxLooper {
  status: HxLooperStatus;
  /**
   * Воспроизводится ли петля один раз (Play Once); true бывает только при
   * `playing`. Когда однократное воспроизведение закончится, модель не знает.
   */
  playOnce: boolean;
  /** Reverse — воспроизведение задом наперёд; false — Forward. */
  reverse: boolean;
  /** Half Speed — половинная скорость; false — Full Speed. */
  halfSpeed: boolean;
  /**
   * Undo/Redo: `none` — отменять нечего, `undo` — последний слой Overdub можно
   * отменить, `redo` — слой отменён, его можно вернуть.
   */
  undo: 'none' | 'undo' | 'redo';
  /** Время последней смены `status`; null — не менялся с включения. */
  since: number | null;
  /**
   * Кольцо футсвитча, на который назначен лупер: красное — запись, зелёное —
   * воспроизведение, янтарное — Overdub, белое — остановлен, тускло-белое —
   * петли нет. Какой это футсвитч, задано пресетом и неизвестно.
   */
  ring: HxRing;
}

/** Состояние Line 6 HX Stomp. */
export interface HxStompState extends DeviceStateBase {
  settings: HxSettings;
  /**
   * Домашний экран: `play` — Play view (номер и имя пресета, мини-схема,
   * подписи футсвитчей), `edit` — Edit view (схема блоков и параметры
   * выбранного блока). После включения — Play view.
   */
  view: 'play' | 'edit';
  /**
   * Открыт ли экран Tuner. Он закрывает собой домашний экран; пресет,
   * снапшот, режим и вид под ним продолжают меняться.
   */
  tuner: boolean;
  /**
   * Страница настроек Tuner над Knob 1–3, пока открыт Tuner; названия
   * параметров страниц — `TUNER_PAGES`, значения — глобальные настройки,
   * модели неизвестные. При открытии Tuner — 1.
   */
  tunerPage: HxTunerPage;
  /**
   * Включён ли All Bypass: в инспекторе надпись «Analog Bypass! Press any
   * switch» или «DSP Bypass! Press any switch» по `settings.bypassType`.
   */
  allBypass: boolean;
  /**
   * Режим футсвитчей; отметка режима в Play view — четверть ширины экрана,
   * слева направо Stomp, Scroll, Preset, Snapshot. Пока банк в очереди —
   * `preset`.
   */
  footswitchMode: HxFootswitchMode;
  /** Банк в очереди; null — очереди нет. */
  bankQueue: HxBankQueue | null;
  /**
   * Загруженный пресет; null — неизвестен: после включения пресет по MIDI ещё
   * не выбирался или выбран соседний к неизвестному (CC72, Preset Up/Down).
   */
  preset: HxPreset | null;
  /**
   * Показан ли значок «E»: пресет изменён после загрузки или сохранения.
   * Модель отмечает изменение только ручками Knob 1–3 (CC75–CC77): что
   * меняют назначенные футсвитчи и контроллеры, ей неизвестно.
   */
  edited: boolean;
  /**
   * Пресет только что сменился и, возможно, ещё загружается: true от смены
   * пресета до следующего сообщения канала, которое прибор выполнил;
   * сообщения без действия флаг не снимают. Снапшот, выбранный CC69 в это
   * время, прибор применяет к новому пресету после загрузки. На изображении
   * не показывается.
   */
  presetLoading: boolean;
  /**
   * Активный снапшот — номер в значке камеры в правом верхнем углу Play
   * view; null — неизвестен: после смены пресета действует снапшот,
   * сохранённый в пресете. Значок серый при `settings.snapshotEdits` =
   * `recall` и красный при `discard`.
   */
  snapshot: HxSnapshot | null;
  tempo: HxTempo;
  /** 1 Switch Looper; null — в пресетах лупера нет (настройка `looper`). */
  looper: HxLooper | null;
  /**
   * Положения педалей `[EXP 1, EXP 2]` 0–127 (0 — пятка, 127 — носок), заданные
   * CC1 и CC2; null — неизвестно: CC ещё не приходил или прибор восстановил
   * положение из пресета или снапшота по EXP 1/2 Position. Индикатора
   * положения на экране прибора нет.
   */
  exp: readonly (number | null)[];
  /**
   * Значения `[Knob 1, Knob 2, Knob 3]` 0–127, заданные CC75–CC77 параметрам
   * текущей страницы выбранного блока (видны в Edit view); null — значение
   * задано пресетом и неизвестно. Смена пресета, снапшота и страницы
   * параметров делает значения неизвестными.
   */
  knobs: readonly (number | null)[];
  /** Эмулированные футсвитчи FS1–FS5 по порядку. */
  footswitches: readonly HxFootswitch[];
  /**
   * Подписи и кольца футсвитчей FS1–FS3 по порядку, производные от остальных
   * полей. В режиме Snapshot кольцо выбранного снапшота горит цветом из
   * пресета (по умолчанию Auto — белый).
   */
  switches: readonly HxSwitchDisplay[];
}
