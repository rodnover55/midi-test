/**
 * Воспроизведение последовательности MIDI-сообщений через модель устройства
 * без сервера и MIDI-портов — для предпросмотра изображения и проверки модели
 * в любом состоянии.
 */

import { ClockTracker } from './clock.ts';
import { ENGINES } from './devices/registry.ts';
import type { DeviceId, DeviceSettings, DeviceStateBase } from './devices/types.ts';
import { resolveSettings } from './devices/types.ts';
import { parseMidi } from './midi.ts';
import type { TargetDescription } from './monitor.ts';

/** Результат воспроизведения: итоговое состояние и описание каждого сообщения. */
export interface ReplayResult {
  state: DeviceStateBase;
  steps: { hex: string; description: TargetDescription | null }[];
}

/**
 * Разбирает запись последовательности: сообщения через `;`, байты внутри
 * сообщения — шестнадцатеричные пары через пробел, запятую или подряд.
 * Пример: `B1 2B 02;C1 05` или `b12b02;c105`.
 *
 * @throws ошибку с номером сообщения, если байт не шестнадцатеричный.
 */
export function parseSequence(text: string): number[][] {
  return text
    .split(';')
    .map((part) => part.replace(/[\s,]+/g, ''))
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.length % 2 !== 0 || /[^0-9a-f]/i.test(part)) {
        throw new Error(`сообщение №${index + 1}: «${part}» — не шестнадцатеричные байты`);
      }
      return part.match(/../g)!.map((pair) => Number.parseInt(pair, 16));
    });
}

/**
 * Прогоняет сообщения через модель устройства так, как это делает монитор
 * для устройства на канале `channel`: сообщения других каналов пропускаются,
 * системные передаются всегда.
 *
 * @param gap интервал между сообщениями, мс; влияет на tap tempo и MIDI Clock.
 * @param start время первого сообщения, миллисекунды Unix-времени.
 */
export function replay(
  device: DeviceId,
  messages: readonly number[][],
  options: { channel: number | 'omni'; gap: number; start: number; settings?: Partial<DeviceSettings> },
): ReplayResult {
  const engine = ENGINES[device];
  let state = engine.createState(resolveSettings(engine.settings, options.settings));
  const clock = new ClockTracker();
  const steps: ReplayResult['steps'] = [];
  messages.forEach((bytes, index) => {
    const time = options.start + index * options.gap;
    const message = parseMidi(bytes);
    const hex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    if (message.kind === 'clock') {
      clock.tick(time);
    } else if (message.kind === 'start' || message.kind === 'continue') {
      clock.start();
    } else if (message.kind === 'stop') {
      clock.stop();
    }
    const addressed =
      message.kind !== 'invalid' &&
      (!('channel' in message) || options.channel === 'omni' || message.channel === options.channel);
    if (!addressed) {
      steps.push({ hex, description: null });
      return;
    }
    const result = engine.handle(state, message, { time, clock: clock.info() });
    state = result.state;
    steps.push({ hex, description: { device, ...result.description } });
  });
  return { state, steps };
}
