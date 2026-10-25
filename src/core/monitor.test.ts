import { describe, expect, it } from 'vitest';
import type { DeviceEngine, DeviceId, DeviceStateBase } from './devices/types.ts';
import type { MonitorOptions } from './monitor.ts';
import { Monitor } from './monitor.ts';

interface CountingState extends DeviceStateBase {
  count: number;
}

function countingEngine(id: DeviceId): DeviceEngine<CountingState> {
  return {
    id,
    name: id,
    vendor: 'test',
    model: id,
    firmware: 'test',
    settings: [{ key: 'flag', label: 'флаг', type: 'boolean', default: false }],
    createState: (settings) => ({ settings, count: 0 }),
    applySettings: (state, settings) => ({ ...state, settings }),
    handle: (state, message) =>
      message.kind === 'clock'
        ? { state, description: { text: 'clock', effect: 'ignored' } }
        : { state: { ...state, count: state.count + 1 }, description: { text: `${id}:${message.kind}`, effect: 'applied' } },
  };
}

const engines = { qc: countingEngine('qc'), hxstomp: countingEngine('hxstomp') } as Record<DeviceId, DeviceEngine>;

function options(overrides: Partial<MonitorOptions> = {}): MonitorOptions {
  return {
    devices: { qc: { channel: 2, settings: {} }, hxstomp: { channel: 1, settings: {} } },
    logRealtime: false,
    logLimit: 100,
    ...overrides,
  };
}

describe('Monitor', () => {
  it('передаёт сообщения канала только устройству этого канала', () => {
    const monitor = new Monitor(engines, options());
    const result = monitor.process({ time: 1000, port: 'p', bytes: [0xc0, 5] });
    expect(result.changed).toEqual(['hxstomp']);
    expect(result.entry?.targets.map((t) => t.device)).toEqual(['hxstomp']);
    const none = monitor.process({ time: 1001, port: 'p', bytes: [0xc4, 5] });
    expect(none.entry?.targets).toEqual([]);
    expect(none.entry?.delta).toBe(1);
  });

  it('передаёт системные сообщения всем устройствам, а Omni получает все каналы', () => {
    const monitor = new Monitor(engines, options({ devices: { qc: { channel: 'omni', settings: {} }, hxstomp: { channel: 1, settings: {} } } }));
    expect(monitor.process({ time: 1, port: 'p', bytes: [0xc5, 1] }).changed).toEqual(['qc']);
    expect(monitor.process({ time: 2, port: 'p', bytes: [0xfa] }).changed).toEqual(['qc', 'hxstomp']);
  });

  it('не пишет Timing Clock в журнал без записи реального времени, но считает темп', () => {
    const monitor = new Monitor(engines, options());
    let time = 0;
    for (let i = 0; i < 30; i++) {
      expect(monitor.process({ time, port: 'p', bytes: [0xf8] }).entry).toBeNull();
      time += 60000 / (120 * 24);
    }
    expect(monitor.log()).toHaveLength(0);
    expect(monitor.realtime().clock.bpm).toBe(120);
    expect(monitor.realtime().clock.ticks).toBe(30);
  });

  it('ограничивает размер журнала', () => {
    const monitor = new Monitor(engines, options({ logLimit: 100 }));
    for (let i = 0; i < 250; i++) {
      monitor.process({ time: i, port: 'p', bytes: [0xc0, i % 128] });
    }
    const log = monitor.log();
    expect(log).toHaveLength(100);
    expect(log[0].id).toBe(151);
  });

  it('некорректное сообщение пишется в журнал без адресатов', () => {
    const monitor = new Monitor(engines, options());
    const result = monitor.process({ time: 1, port: 'p', bytes: [0xc0] });
    expect(result.entry?.message.kind).toBe('invalid');
    expect(result.entry?.targets).toEqual([]);
  });
});
