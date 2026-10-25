import { describe, expect, it } from 'vitest';
import { TestDevice } from '../../../core/devices/quadCortex/testDevice.ts';
import { statusText } from './status.ts';

function status(device: TestDevice, after = 0): string {
  return statusText(device.state, device.time + after);
}

describe('строка состояния', () => {
  it('только что включённый прибор: всё неизвестно', () => {
    expect(status(new TestDevice())).toBe(
      'Пресет неизвестен, сетлист неизвестен · сцена неизвестна · режим неизвестен · экран The Grid · темп неизвестен',
    );
  });

  it('пресет, сетлист, сцена и режим', () => {
    const device = new TestDevice();
    device.cc(32, 1);
    device.pc(10);
    device.cc(47, 1);
    device.cc(43, 2);
    expect(status(device)).toBe(
      'Пресет 2C, сетлист 1 «My Presets» · сцена C · режим SCENE · экран The Grid · темп неизвестен',
    );
  });

  it('Bank Select, ожидающий Program Change', () => {
    const device = new TestDevice({ startSetlist: '5' });
    device.cc(0, 1);
    device.cc(32, 3);
    expect(status(device)).toContain('Пресет неизвестен, сетлист 5 (ждут Program Change: CC#0 = 1, CC#32 = 3)');
  });

  it('переключённые стомпы и HYBRID с банками по 4', () => {
    const device = new TestDevice({ modeSlot1: 'PRESET+STOMP', modeSlot2: 'SCENE', modeSlot3: 'EMPTY' });
    device.pc(10);
    device.cc(47, 0);
    device.cc(39, 127);
    device.cc(41, 127);
    expect(status(device)).toContain('Пресет 3C (2C при банках по 8)');
    expect(status(device)).toContain('режим HYBRID (A–D PRESET, E–H STOMP), переключены стомпы E, G');
  });

  it('экраны поверх друг друга', () => {
    const device = new TestDevice();
    device.cc(46, 127);
    device.cc(45, 127);
    expect(status(device)).toContain('экран Tuner поверх Gig View');
  });

  it('Looper X: запись со временем, затем воспроизведение с длиной петли', () => {
    const device = new TestDevice();
    device.cc(48, 0);
    device.cc(53, 127);
    expect(status(device, 3200)).toContain('экран Looper X (Perform) · Looper X: запись 0:03');
    device.cc(53, 127, 4000);
    expect(status(device)).toContain('Looper X: воспроизведение, петля 0:04.0');
  });

  it('темп Tap Tempo и MIDI Clock', () => {
    const tap = new TestDevice();
    tap.cc(44, 127);
    tap.cc(44, 127, 500);
    expect(status(tap)).toContain('экран Tempo · темп 120 BPM (Tap Tempo)');
    const clock = new TestDevice({ midiClockIn: true });
    clock.ticks(49, 100);
    expect(status(clock)).toContain('темп 100 BPM (MIDI Clock)');
  });
});
