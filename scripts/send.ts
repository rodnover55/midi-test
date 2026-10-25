/**
 * Отправка MIDI-сообщений в «Midi Through» (или другой порт) для проверки
 * монитора без процессоров и DAW.
 *
 * Запуск: `npm run send -- [--port <часть имени>] [--list] <команда>...`
 *
 * Команды выполняются по порядку:
 * - `pc <канал> <программа>` — Program Change;
 * - `cc <канал> <контроллер> <значение>` — Control Change;
 * - `on <канал> <нота> <velocity>`, `off <канал> <нота>` — Note On/Off;
 * - `clock <BPM> <секунды>` — Timing Clock с заданным темпом;
 * - `start`, `stop`, `continue` — транспорт;
 * - `hex <байты>` — сырые байты, например `hex "F0 7E 7F 06 01 F7"`;
 * - `wait <мс>` — пауза.
 *
 * Каналы — 1–16. Без --port сообщения идут в «Midi Through», который
 * слушает страница монитора.
 */

import { Output } from '@julusian/midi';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Порт по умолчанию: системный «Midi Through», его слушает страница монитора. */
const DEFAULT_PORT = 'Midi Through';

/** Шаг сценария отправки. */
export type Step =
  | { type: 'send'; bytes: number[] }
  | { type: 'wait'; ms: number }
  | { type: 'clock'; bpm: number; seconds: number };

function int(value: string | undefined, min: number, max: number, what: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${what}: ожидается целое ${min}–${max}, получено «${value ?? ''}»`);
  }
  return n;
}

/**
 * Разбирает команды командной строки в шаги отправки.
 *
 * @throws ошибку с описанием первой неверной команды или аргумента.
 */
export function parseSteps(args: readonly string[]): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < args.length; ) {
    const command = args[i++];
    switch (command) {
      case 'pc': {
        const channel = int(args[i++], 1, 16, 'канал');
        steps.push({ type: 'send', bytes: [0xc0 + channel - 1, int(args[i++], 0, 127, 'программа')] });
        break;
      }
      case 'cc': {
        const channel = int(args[i++], 1, 16, 'канал');
        const controller = int(args[i++], 0, 127, 'контроллер');
        steps.push({ type: 'send', bytes: [0xb0 + channel - 1, controller, int(args[i++], 0, 127, 'значение')] });
        break;
      }
      case 'on': {
        const channel = int(args[i++], 1, 16, 'канал');
        const note = int(args[i++], 0, 127, 'нота');
        steps.push({ type: 'send', bytes: [0x90 + channel - 1, note, int(args[i++], 0, 127, 'velocity')] });
        break;
      }
      case 'off': {
        const channel = int(args[i++], 1, 16, 'канал');
        steps.push({ type: 'send', bytes: [0x80 + channel - 1, int(args[i++], 0, 127, 'нота'), 0] });
        break;
      }
      case 'clock':
        steps.push({ type: 'clock', bpm: int(args[i++], 20, 300, 'BPM'), seconds: int(args[i++], 1, 600, 'секунды') });
        break;
      case 'start':
        steps.push({ type: 'send', bytes: [0xfa] });
        break;
      case 'stop':
        steps.push({ type: 'send', bytes: [0xfc] });
        break;
      case 'continue':
        steps.push({ type: 'send', bytes: [0xfb] });
        break;
      case 'hex': {
        const text = args[i++] ?? '';
        const bytes = text
          .trim()
          .split(/[\s,]+/)
          .map((b) => Number.parseInt(b, 16));
        if (bytes.length === 0 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
          throw new Error(`hex: неверные байты «${text}»`);
        }
        steps.push({ type: 'send', bytes });
        break;
      }
      case 'wait':
        steps.push({ type: 'wait', ms: int(args[i++], 0, 600000, 'пауза') });
        break;
      default:
        throw new Error(`неизвестная команда «${command}»`);
    }
  }
  return steps;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    console.log(Output.getPortNames().join('\n'));
    return;
  }
  let portPart: string | null = null;
  const portIndex = args.indexOf('--port');
  if (portIndex >= 0) {
    portPart = args[portIndex + 1] ?? '';
    args.splice(portIndex, 2);
  }
  const steps = parseSteps(args);
  portPart ??= DEFAULT_PORT;
  const output = new Output();
  const names = Output.getPortNames();
  const index = names.findIndex((n) => n.includes(portPart));
  if (index < 0) {
    throw new Error(`порт с «${portPart}» в имени не найден; доступны:\n${names.join('\n')}`);
  }
  output.openPort(index);
  try {
    for (const step of steps) {
      if (step.type === 'send') {
        output.sendMessage(step.bytes);
      } else if (step.type === 'wait') {
        await sleep(step.ms);
      } else {
        const interval = 60000 / (step.bpm * 24);
        const end = performance.now() + step.seconds * 1000;
        let next = performance.now();
        while (next < end) {
          output.sendMessage([0xf8]);
          next += interval;
          await sleep(Math.max(0, next - performance.now()));
        }
      }
    }
    await sleep(50);
  } finally {
    output.closePort();
    output.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
