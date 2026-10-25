/**
 * Общий контракт модели процессора: как модель хранит состояние и как
 * сообщает, какую команду MIDI-сообщение выполняет на устройстве.
 */

import type { MidiMessage } from '../midi.ts';

/** Идентификатор поддерживаемого процессора. */
export type DeviceId = 'qc' | 'hxstomp';

/** Идентификаторы процессоров в порядке отображения. */
export const DEVICE_IDS: readonly DeviceId[] = ['qc', 'hxstomp'];

/** MIDI-канал, который слушает устройство: 1–16 или `omni` — все каналы. */
export type ChannelSetting = number | 'omni';

/** Значение настройки устройства. */
export type SettingValue = boolean | number | string;

/** Значения настроек устройства по ключам из {@link SettingDef}. */
export type DeviceSettings = Record<string, SettingValue>;

/**
 * Описание настройки устройства, влияющей на обработку входящих MIDI или на
 * отображение. По нему строится форма настроек.
 *
 * `label` и `hint` — подпись и пояснение на русском. Для `select` значение
 * по умолчанию — одно из `options[].value`; для `number` — число в пределах
 * `min`–`max` включительно.
 */
export type SettingDef =
  | { key: string; label: string; hint?: string; type: 'boolean'; default: boolean }
  | {
      key: string;
      label: string;
      hint?: string;
      type: 'select';
      default: string;
      options: readonly { value: string; label: string }[];
    }
  | { key: string; label: string; hint?: string; type: 'number'; default: number; min: number; max: number };

/**
 * Итог обработки сообщения устройством.
 *
 * - `applied` — команда выполнена;
 * - `pending` — значение запомнено и подействует вместе с последующим
 *   сообщением, например Bank Select до Program Change;
 * - `ignored` — сообщение входит в MIDI-реализацию, но по её правилам ничего
 *   не меняет: повтор того же пресета, значение вне диапазона, выключенная
 *   настройка приёма;
 * - `unsupported` — сообщение не входит в MIDI-реализацию устройства.
 */
export type Effect = 'applied' | 'pending' | 'ignored' | 'unsupported';

/** Команда, которую сообщение выполняет на устройстве. */
export interface CommandDescription {
  /** Описание на русском; названия функций и экранов — как на устройстве. */
  text: string;
  effect: Effect;
}

/** Состояние MIDI Clock на момент обработки сообщения. */
export interface ClockInfo {
  /** Темп по последним импульсам Timing Clock; null, пока импульсов мало или после паузы. */
  bpm: number | null;
  /** true после Start/Continue, false после Stop, null — транспортных сообщений не было. */
  running: boolean | null;
  /** Число импульсов Timing Clock с запуска монитора. */
  ticks: number;
}

/** Обстоятельства получения обрабатываемого сообщения. */
export interface HandleContext {
  /** Время получения, миллисекунды Unix-времени с дробной частью. */
  time: number;
  /** MIDI Clock с учётом этого сообщения. */
  clock: ClockInfo;
}

/** Общие поля состояния любого устройства. */
export interface DeviceStateBase {
  /**
   * Действующие настройки устройства. Могут отличаться от сохранённых в
   * конфигурации, если их изменило MIDI-сообщение.
   */
  settings: DeviceSettings;
}

/** Результат обработки сообщения: новое состояние и выполненная команда. */
export interface HandleResult<S> {
  /** Тот же объект, если состояние не изменилось, иначе новый. */
  state: S;
  description: CommandDescription;
}

/**
 * Модель процессора: начальное состояние и реакция на входящие MIDI-сообщения
 * согласно MIDI-реализации прошивки.
 *
 * Состояние — неизменяемые простые объекты, пригодные для JSON: модель
 * никогда не меняет переданное состояние, а возвращает новое. Модель не
 * читает текущее время и не держит таймеров — всё зависящее от времени она
 * вычисляет из {@link HandleContext.time}, поэтому одинаковая
 * последовательность сообщений всегда даёт одинаковое состояние.
 */
export interface DeviceEngine<S extends DeviceStateBase = DeviceStateBase> {
  readonly id: DeviceId;
  /** Короткое название для журнала, например `Quad Cortex`. */
  readonly name: string;
  readonly vendor: string;
  /** Модель, внешний вид которой рисуется, например `HX Stomp`. */
  readonly model: string;
  /** Версия прошивки, MIDI-реализацию которой воспроизводит модель. */
  readonly firmware: string;
  /** Настройки устройства в порядке показа в форме. */
  readonly settings: readonly SettingDef[];

  /**
   * Создаёт состояние только что включённого устройства.
   *
   * @param settings значения всех настроек из {@link settings}; вызывающий
   *   дополняет отсутствующие значениями по умолчанию.
   */
  createState(settings: DeviceSettings): S;

  /**
   * Применяет изменённые пользователем настройки к текущему состоянию.
   *
   * @param settings полный набор значений настроек.
   * @returns новое состояние с этими настройками.
   */
  applySettings(state: S, settings: DeviceSettings): S;

  /**
   * Обрабатывает сообщение, адресованное устройству: сообщение канала
   * устройства или системное сообщение.
   *
   * @returns новое состояние и описание выполненной команды; описание есть
   *   всегда, в том числе для неподдерживаемых сообщений.
   */
  handle(state: S, message: MidiMessage, context: HandleContext): HandleResult<S>;
}

/**
 * Дополняет настройки значениями по умолчанию и отбрасывает недопустимые.
 *
 * Неизвестные ключи удаляются. Значение неверного типа, вне диапазона
 * `min`–`max` или не из списка вариантов заменяется значением по умолчанию.
 *
 * @param values исходные значения; отсутствующий объект равнозначен пустому.
 */
export function resolveSettings(defs: readonly SettingDef[], values: Partial<DeviceSettings> | undefined): DeviceSettings {
  const result: DeviceSettings = {};
  for (const def of defs) {
    const value = values?.[def.key];
    switch (def.type) {
      case 'boolean':
        result[def.key] = typeof value === 'boolean' ? value : def.default;
        break;
      case 'number':
        result[def.key] =
          typeof value === 'number' && Number.isFinite(value) && value >= def.min && value <= def.max
            ? value
            : def.default;
        break;
      case 'select':
        result[def.key] =
          typeof value === 'string' && def.options.some((o) => o.value === value) ? value : def.default;
        break;
    }
  }
  return result;
}
