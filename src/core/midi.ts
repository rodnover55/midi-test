/**
 * Разбор сырых MIDI 1.0-сообщений и их общее описание, не зависящее от
 * устройства-получателя.
 */

/**
 * Разобранное MIDI-сообщение.
 *
 * Каналы нумеруются с 1 (1–16), как в настройках устройств. Номера нот,
 * контроллеров и программ — сырые значения 0–127. Сообщение, которое нельзя
 * разобрать, имеет вид `invalid` с причиной.
 */
export type MidiMessage =
  | { kind: 'noteOff'; channel: number; note: number; velocity: number }
  | { kind: 'noteOn'; channel: number; note: number; velocity: number }
  | { kind: 'polyPressure'; channel: number; note: number; pressure: number }
  | { kind: 'controlChange'; channel: number; controller: number; value: number }
  | { kind: 'programChange'; channel: number; program: number }
  | { kind: 'channelPressure'; channel: number; pressure: number }
  /** Отклонение высоты тона −8192…+8191, 0 — центр. */
  | { kind: 'pitchBend'; channel: number; value: number }
  /** Байты между F0 и F7, без них самих. */
  | { kind: 'sysex'; data: number[] }
  | { kind: 'mtcQuarterFrame'; piece: number; value: number }
  /** Позиция в MIDI-долях (шестнадцатых нотах) от начала песни. */
  | { kind: 'songPosition'; position: number }
  | { kind: 'songSelect'; song: number }
  | { kind: 'tuneRequest' }
  | { kind: 'clock' }
  | { kind: 'start' }
  | { kind: 'continue' }
  | { kind: 'stop' }
  | { kind: 'activeSensing' }
  | { kind: 'reset' }
  | { kind: 'invalid'; reason: string };

/** Вид MIDI-сообщения. */
export type MidiKind = MidiMessage['kind'];

/** Сообщение, адресованное одному MIDI-каналу. */
export type ChannelMessage = Extract<MidiMessage, { channel: number }>;

const CHANNEL_DATA_LENGTH: Record<number, number> = {
  0x80: 2,
  0x90: 2,
  0xa0: 2,
  0xb0: 2,
  0xc0: 1,
  0xd0: 1,
  0xe0: 2,
};

const SYSTEM_DATA_LENGTH: Record<number, number> = {
  0xf1: 1,
  0xf2: 2,
  0xf3: 1,
  0xf6: 0,
  0xf8: 0,
  0xfa: 0,
  0xfb: 0,
  0xfc: 0,
  0xfe: 0,
  0xff: 0,
};

/**
 * Разбирает одно полное MIDI-сообщение.
 *
 * Ожидает ровно одно сообщение со статусным байтом в начале: running status
 * не поддерживается, потому что порт ввода передаёт сообщения целиком.
 * SysEx должен начинаться с F0 и заканчиваться F7.
 *
 * @param bytes байты сообщения, каждый 0–255.
 * @returns разобранное сообщение; для пустого ввода, ввода без статусного
 *   байта, с недостающими или лишними байтами данных, с байтом данных ≥ 0x80,
 *   SysEx без F7 и неопределённых статусов F4, F5, F9, FD, одиночного F7 —
 *   сообщение `invalid` с причиной на русском.
 */
export function parseMidi(bytes: readonly number[]): MidiMessage {
  if (bytes.length === 0) {
    return { kind: 'invalid', reason: 'пустое сообщение' };
  }
  const status = bytes[0];
  if (status < 0x80) {
    return { kind: 'invalid', reason: 'нет статусного байта' };
  }
  if (status === 0xf0) {
    return parseSysex(bytes);
  }
  const data = bytes.slice(1);
  const badData = data.findIndex((b) => b > 0x7f);
  if (status < 0xf0) {
    const type = status & 0xf0;
    const expected = CHANNEL_DATA_LENGTH[type];
    const lengthProblem = checkLength(data.length, expected);
    if (lengthProblem) {
      return { kind: 'invalid', reason: lengthProblem };
    }
    if (badData >= 0) {
      return { kind: 'invalid', reason: `байт данных №${badData + 1} не меньше 0x80` };
    }
    const channel = (status & 0x0f) + 1;
    switch (type) {
      case 0x80:
        return { kind: 'noteOff', channel, note: data[0], velocity: data[1] };
      case 0x90:
        return { kind: 'noteOn', channel, note: data[0], velocity: data[1] };
      case 0xa0:
        return { kind: 'polyPressure', channel, note: data[0], pressure: data[1] };
      case 0xb0:
        return { kind: 'controlChange', channel, controller: data[0], value: data[1] };
      case 0xc0:
        return { kind: 'programChange', channel, program: data[0] };
      case 0xd0:
        return { kind: 'channelPressure', channel, pressure: data[0] };
      default:
        return { kind: 'pitchBend', channel, value: (data[0] | (data[1] << 7)) - 8192 };
    }
  }
  const expected = SYSTEM_DATA_LENGTH[status];
  if (expected === undefined) {
    return status === 0xf7
      ? { kind: 'invalid', reason: 'F7 (End of Exclusive) без начала SysEx' }
      : { kind: 'invalid', reason: `неопределённый системный статус ${hexByte(status)}` };
  }
  const lengthProblem = checkLength(data.length, expected);
  if (lengthProblem) {
    return { kind: 'invalid', reason: lengthProblem };
  }
  if (badData >= 0) {
    return { kind: 'invalid', reason: `байт данных №${badData + 1} не меньше 0x80` };
  }
  switch (status) {
    case 0xf1:
      return { kind: 'mtcQuarterFrame', piece: (data[0] >> 4) & 0x07, value: data[0] & 0x0f };
    case 0xf2:
      return { kind: 'songPosition', position: data[0] | (data[1] << 7) };
    case 0xf3:
      return { kind: 'songSelect', song: data[0] };
    case 0xf6:
      return { kind: 'tuneRequest' };
    case 0xf8:
      return { kind: 'clock' };
    case 0xfa:
      return { kind: 'start' };
    case 0xfb:
      return { kind: 'continue' };
    case 0xfc:
      return { kind: 'stop' };
    case 0xfe:
      return { kind: 'activeSensing' };
    default:
      return { kind: 'reset' };
  }
}

function parseSysex(bytes: readonly number[]): MidiMessage {
  if (bytes.length < 2 || bytes[bytes.length - 1] !== 0xf7) {
    return { kind: 'invalid', reason: 'SysEx без завершающего F7' };
  }
  const data = bytes.slice(1, -1);
  const bad = data.findIndex((b) => b > 0x7f);
  if (bad >= 0) {
    return { kind: 'invalid', reason: `байт SysEx №${bad + 2} не меньше 0x80` };
  }
  return { kind: 'sysex', data };
}

function checkLength(actual: number, expected: number): string | null {
  if (actual < expected) {
    return `не хватает байтов данных: ${actual} из ${expected}`;
  }
  if (actual > expected) {
    return `лишние байты данных: ${actual} вместо ${expected}`;
  }
  return null;
}

/**
 * Проверяет, адресовано ли сообщение одному MIDI-каналу.
 *
 * @returns true для Note Off/On, Polyphonic и Channel Aftertouch, Control
 *   Change, Program Change и Pitch Bend.
 */
export function isChannelMessage(message: MidiMessage): message is ChannelMessage {
  return 'channel' in message;
}

/**
 * Проверяет, относится ли сообщение к однобайтным системным сообщениям
 * реального времени: Timing Clock, Start, Continue, Stop, Active Sensing,
 * System Reset.
 */
export function isRealtime(message: MidiMessage): boolean {
  switch (message.kind) {
    case 'clock':
    case 'start':
    case 'continue':
    case 'stop':
    case 'activeSensing':
    case 'reset':
      return true;
    default:
      return false;
  }
}

/** Возвращает байт в виде двух заглавных шестнадцатеричных цифр, например `0B`. */
export function hexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Форматирует байты сообщения шестнадцатеричными парами через пробел,
 * например `B1 2B 02`.
 *
 * @param limit наибольшее число выводимых байтов; при превышении после них
 *   добавляется `…`. Без ограничения выводятся все байты.
 */
export function formatHex(bytes: readonly number[], limit = Infinity): string {
  const shown = bytes.length > limit ? bytes.slice(0, limit) : bytes;
  const text = shown.map(hexByte).join(' ');
  return bytes.length > limit ? `${text} …` : text;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Возвращает название ноты в научной нотации: 60 — `C4`, 69 — `A4`,
 * 0 — `C-1`.
 */
export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

const CHANNEL_MODE_NAMES: Record<number, string> = {
  120: 'All Sound Off',
  121: 'Reset All Controllers',
  122: 'Local Control',
  123: 'All Notes Off',
  124: 'Omni Mode Off',
  125: 'Omni Mode On',
  126: 'Mono Mode On',
  127: 'Poly Mode On',
};

/**
 * Возвращает стандартное назначение контроллера по спецификации MIDI 1.0,
 * общее для всех устройств: Bank Select (CC#0 и CC#32) и сообщения режима
 * канала (CC#120–127).
 *
 * @returns название или null, если у контроллера нет общего назначения.
 */
export function standardControllerName(controller: number): string | null {
  if (controller === 0) {
    return 'Bank Select MSB';
  }
  if (controller === 32) {
    return 'Bank Select LSB';
  }
  return CHANNEL_MODE_NAMES[controller] ?? null;
}

const MANUFACTURERS: Record<string, string> = {
  '7D': 'некоммерческий ID',
  '7E': 'Universal Non-Real Time',
  '7F': 'Universal Real Time',
  '00 01 0C': 'Line 6',
};

/**
 * Возвращает идентификатор производителя из данных SysEx и его название,
 * если оно известно, например `00 01 0C (Line 6)`.
 *
 * @param data байты между F0 и F7.
 * @returns пустую строку для пустых данных.
 */
export function sysexManufacturer(data: readonly number[]): string {
  if (data.length === 0) {
    return '';
  }
  const id = formatHex(data[0] === 0 ? data.slice(0, 3) : data.slice(0, 1));
  const name = MANUFACTURERS[id];
  return name ? `${id} (${name})` : id;
}

/**
 * Возвращает общее описание сообщения на русском без номера канала,
 * например `Control Change · CC#43 = 2` или
 * `Program Change · 122 (№123 при счёте с 1)`.
 */
export function describeMessage(message: MidiMessage): string {
  switch (message.kind) {
    case 'noteOff':
      return `Note Off · ${noteName(message.note)} (${message.note}), velocity ${message.velocity}`;
    case 'noteOn':
      return message.velocity === 0
        ? `Note On с velocity 0 (= Note Off) · ${noteName(message.note)} (${message.note})`
        : `Note On · ${noteName(message.note)} (${message.note}), velocity ${message.velocity}`;
    case 'polyPressure':
      return `Polyphonic Aftertouch · ${noteName(message.note)} (${message.note}), давление ${message.pressure}`;
    case 'controlChange': {
      const name = standardControllerName(message.controller);
      return `Control Change · CC#${message.controller}${name ? ` (${name})` : ''} = ${message.value}`;
    }
    case 'programChange':
      return `Program Change · ${message.program} (№${message.program + 1} при счёте с 1)`;
    case 'channelPressure':
      return `Channel Aftertouch · давление ${message.pressure}`;
    case 'pitchBend':
      return `Pitch Bend · ${message.value > 0 ? '+' : ''}${message.value}`;
    case 'sysex': {
      const maker = sysexManufacturer(message.data);
      return `System Exclusive · ${message.data.length} байт данных${maker ? `, производитель ${maker}` : ''}`;
    }
    case 'mtcQuarterFrame':
      return `MTC Quarter Frame · часть ${message.piece}, значение ${message.value}`;
    case 'songPosition':
      return `Song Position Pointer · ${message.position} шестнадцатых от начала`;
    case 'songSelect':
      return `Song Select · песня ${message.song}`;
    case 'tuneRequest':
      return 'Tune Request';
    case 'clock':
      return 'Timing Clock (24 импульса на четверть)';
    case 'start':
      return 'Start';
    case 'continue':
      return 'Continue';
    case 'stop':
      return 'Stop';
    case 'activeSensing':
      return 'Active Sensing';
    case 'reset':
      return 'System Reset';
    case 'invalid':
      return `Некорректное сообщение: ${message.reason}`;
  }
}
