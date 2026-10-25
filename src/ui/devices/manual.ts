/**
 * Ручное управление устройствами со страницы: MIDI-сообщения, которые
 * отправил бы пользователь, чтобы нажать футсвитч, выбрать пресет, сцену,
 * снапшот или открыть тюнер. Сообщения строятся на канале устройства и
 * проходят через монитор как полученные с порта {@link MANUAL_PORT}.
 */

import type { ChannelSetting } from '../../core/devices/types.ts';

/** Имя порта, с которого в журнал записываются сообщения ручного управления. */
export const MANUAL_PORT = 'Вручную';

/** MIDI-сообщение — байты статуса и данных. */
export type MidiBytes = readonly number[];

/** Ручное управление, доступное изображению и панели устройства. */
export interface ManualControl {
  /** Канал сообщений 1–16. */
  channel: number;
  /** Подаёт сообщения в монитор по порядку, как полученные с порта {@link MANUAL_PORT}. */
  send(messages: readonly MidiBytes[]): void;
}

/** Возвращает канал 1–16 для ручных сообщений: канал устройства, для Omni — 1. */
export function manualChannel(channel: ChannelSetting): number {
  return channel === 'omni' ? 1 : channel;
}

/**
 * Возвращает Control Change.
 *
 * @param channel канал 1–16.
 * @param controller номер контроллера 0–127.
 * @param value значение 0–127.
 */
export function controlChange(channel: number, controller: number, value: number): MidiBytes {
  return [0xb0 | (channel - 1), controller, value];
}

/**
 * Возвращает Program Change.
 *
 * @param channel канал 1–16.
 * @param program номер программы 0–127 (счёт с нуля).
 */
export function programChange(channel: number, program: number): MidiBytes {
  return [0xc0 | (channel - 1), program];
}

/** Буквы футсвитчей и сцен Quad Cortex по порядку. */
export const QC_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Номер CC нажатия футсвитча Quad Cortex A–H. */
export function qcFootswitchCc(footswitch: number): number {
  return 35 + footswitch;
}

/**
 * Возвращает нажатие футсвитча Quad Cortex: CC#35–42 со значением 127. Оно
 * делает то же, что нажатие футсвитча в текущем режиме.
 *
 * @param footswitch 0 — A … 7 — H.
 */
export function qcFootswitch(channel: number, footswitch: number): MidiBytes {
  return controlChange(channel, qcFootswitchCc(footswitch), 127);
}

/**
 * Возвращает сообщения загрузки пресета Quad Cortex: CC#32 (сетлист), CC#0
 * (группа: 0 — банки 1–16, 1 — банки 17–32) и Program Change.
 *
 * @param setlist сетлист 0–12: 0 — Factory Presets, 1 — My Presets.
 * @param index индекс пресета в сетлисте 0–255: (банк − 1) × 8 + слот, слот A — 0 … H — 7.
 */
export function qcLoadPreset(channel: number, setlist: number, index: number): MidiBytes[] {
  return [controlChange(channel, 32, setlist), controlChange(channel, 0, index >> 7), programChange(channel, index & 0x7f)];
}

/**
 * Возвращает выбор сцены Quad Cortex: CC#43.
 *
 * @param scene 0 — A … 7 — H.
 */
export function qcScene(channel: number, scene: number): MidiBytes {
  return controlChange(channel, 43, scene);
}

/** Возвращает открытие (127) или закрытие (0) Tuner Quad Cortex: CC#45. */
export function qcTuner(channel: number, open: boolean): MidiBytes {
  return controlChange(channel, 45, open ? 127 : 0);
}

/** Возвращает открытие (127) или закрытие (0) Gig View Quad Cortex: CC#46. */
export function qcGigView(channel: number, open: boolean): MidiBytes {
  return controlChange(channel, 46, open ? 127 : 0);
}

/** Номер CC эмуляции футсвитча HX Stomp FS1–FS3. */
export function hxFootswitchCc(footswitch: number): number {
  return 49 + footswitch;
}

/**
 * Возвращает нажатие (127) или отпускание (0) футсвитча HX Stomp: CC#49–51.
 *
 * @param footswitch 0 — FS1, 1 — FS2, 2 — FS3.
 */
export function hxFootswitch(channel: number, footswitch: number, pressed: boolean): MidiBytes {
  return controlChange(channel, hxFootswitchCc(footswitch), pressed ? 127 : 0);
}

/**
 * Возвращает загрузку пресета HX Stomp: Program Change.
 *
 * @param index номер пресета 0–125: 01A — 0, 42C — 125.
 */
export function hxPreset(channel: number, index: number): MidiBytes {
  return programChange(channel, index);
}

/**
 * Возвращает выбор снапшота HX Stomp: CC#69 со значением 0–2.
 *
 * @param snapshot снапшот 1–3.
 */
export function hxSnapshot(channel: number, snapshot: number): MidiBytes {
  return controlChange(channel, 69, snapshot - 1);
}

/** Возвращает переключение экрана Tuner HX Stomp: CC#68 (любое значение открывает или закрывает тюнер). */
export function hxTuner(channel: number): MidiBytes {
  return controlChange(channel, 68, 127);
}
