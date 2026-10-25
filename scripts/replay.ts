/**
 * Прогон последовательности MIDI-сообщений через модель устройства без
 * сервера: печатает описание каждого сообщения и итоговое состояние в JSON.
 *
 * Запуск: `npx tsx scripts/replay.ts <qc|hxstomp> '<сообщения>' [--channel N|omni] [--gap мс] [--settings JSON]`
 * Сообщения — шестнадцатеричные байты, сообщения разделяются `;`:
 * `'B1 2B 02;C1 05'`. Канал по умолчанию — канал устройства по умолчанию.
 */

import { DEFAULT_CHANNELS, parseChannel } from '../src/core/config.ts';
import type { DeviceId } from '../src/core/devices/types.ts';
import { DEVICE_IDS } from '../src/core/devices/types.ts';
import { parseSequence, replay } from '../src/core/replay.ts';

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) {
    return undefined;
  }
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

const args = process.argv.slice(2);
const channelArg = option(args, '--channel');
const gapArg = option(args, '--gap');
const settingsArg = option(args, '--settings');
const [device, sequence = ''] = args;
if (!(DEVICE_IDS as readonly string[]).includes(device)) {
  console.error(`Укажите устройство: ${DEVICE_IDS.join(' или ')}`);
  process.exit(1);
}
const id = device as DeviceId;
const result = replay(id, parseSequence(sequence), {
  channel: parseChannel(channelArg) ?? DEFAULT_CHANNELS[id],
  gap: gapArg ? Number(gapArg) : 100,
  start: Date.UTC(2026, 0, 1, 12),
  settings: settingsArg ? JSON.parse(settingsArg) : undefined,
});
for (const step of result.steps) {
  console.log(`${step.hex.padEnd(12)} → ${step.description ? `[${step.description.effect}] ${step.description.text}` : 'другой канал'}`);
}
console.log(JSON.stringify(result.state, null, 2));
