import type { ChannelSetting, DeviceEngine, DeviceId, DeviceSettings } from './devices/types.ts';
import { DEVICE_IDS, resolveSettings } from './devices/types.ts';

/** Сохраняемые настройки одного процессора. */
export interface DeviceConfig {
  channel: ChannelSetting;
  /** Настройки, с которыми устройство включается и сбрасывается. */
  settings: DeviceSettings;
}

/** Конфигурация приложения, хранящаяся в браузере. */
export interface AppConfig {
  midi: {
    /**
     * Выбор пользователя для входных портов: имя порта → слушать ли его.
     * Порты без выбора слушаются.
     */
    ports: Record<string, boolean>;
  };
  log: {
    /**
     * Записывать ли в журнал каждый импульс Timing Clock и Active Sensing.
     * Если нет, они только подсчитываются.
     */
    realtime: boolean;
    /** Наибольшее число записей журнала; старые удаляются. */
    limit: number;
  };
  devices: Record<DeviceId, DeviceConfig>;
}

/** Каналы по умолчанию: так процессоры подключены у пользователя. */
export const DEFAULT_CHANNELS: Record<DeviceId, number> = { hxstomp: 1, qc: 2 };

/** Наименьший и наибольший допустимый размер журнала. */
export const LOG_LIMIT_RANGE = { min: 100, max: 100000 } as const;

/**
 * Проверяет значение MIDI-канала из конфигурации или из адреса страницы.
 *
 * @returns канал 1–16, `omni` или null, если значение недопустимо.
 */
export function parseChannel(value: unknown): ChannelSetting | null {
  if (value === 'omni') {
    return 'omni';
  }
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 16 ? n : null;
}

/**
 * Версия формата сохранённой конфигурации. Сохраняется в поле `version`
 * рядом с конфигурацией и читается {@link migrateConfig}.
 */
export const CONFIG_VERSION = 2;

/**
 * Переводит прочитанную конфигурацию прежних версий в текущую.
 *
 * Конфигурация без поля `version` или с версией меньше 2 сохранена, когда
 * «Режим при включении» Quad Cortex по умолчанию был «неизвестен», и хранит
 * это значение, даже если пользователь его не выбирал. Такое значение
 * удаляется, и {@link normalizeConfig} подставит текущее значение по
 * умолчанию; остальные значения не меняются.
 *
 * @param raw разобранный JSON; допускается что угодно, в том числе undefined.
 * @returns новый объект с исправленными значениями или `raw` без изменений,
 *   если исправлять нечего. Сам `raw` не изменяется.
 */
export function migrateConfig(raw: unknown): unknown {
  const root = asRecord(raw);
  const version = typeof root.version === 'number' ? root.version : 1;
  const qc = asRecord(asRecord(root.devices).qc);
  const settings = asRecord(qc.settings);
  if (version >= 2 || settings.startModeSlot !== 'unknown') {
    return raw;
  }
  const { startModeSlot: _, ...rest } = settings;
  return { ...root, devices: { ...asRecord(root.devices), qc: { ...qc, settings: rest } } };
}

/**
 * Строит полную конфигурацию из прочитанных данных.
 *
 * Отсутствующие и недопустимые значения заменяются значениями по умолчанию:
 * выбора портов нет, Timing Clock и Active Sensing не пишутся в журнал, журнал на
 * 10 000 записей, HX Stomp — канал 1, Quad Cortex — канал 2, настройки
 * устройств — по умолчанию их моделей.
 *
 * @param raw разобранный JSON; допускается что угодно, в том числе
 *   undefined.
 * @param engines модели устройств, чьи настройки проверяются.
 */
export function normalizeConfig(raw: unknown, engines: Record<DeviceId, DeviceEngine>): AppConfig {
  const root = asRecord(raw);
  const midi = asRecord(root.midi);
  const log = asRecord(root.log);
  const devices = asRecord(root.devices);
  const limit = Number(log.limit);
  const result: AppConfig = {
    midi: {
      ports: Object.fromEntries(
        Object.entries(asRecord(midi.ports)).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'),
      ),
    },
    log: {
      realtime: log.realtime === true,
      limit:
        Number.isInteger(limit) && limit >= LOG_LIMIT_RANGE.min && limit <= LOG_LIMIT_RANGE.max ? limit : 10000,
    },
    devices: {} as Record<DeviceId, DeviceConfig>,
  };
  for (const id of DEVICE_IDS) {
    const device = asRecord(devices[id]);
    result.devices[id] = {
      channel: parseChannel(device.channel) ?? DEFAULT_CHANNELS[id],
      settings: resolveSettings(engines[id].settings, asRecord(device.settings) as Partial<DeviceSettings>),
    };
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
