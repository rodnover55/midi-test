import { describe, expect, it } from 'vitest';
import { describeMessage, formatHex, isRealtime, noteName, parseMidi } from './midi.ts';

describe('parseMidi', () => {
  it('разбирает сообщения канала с каналами 1–16', () => {
    expect(parseMidi([0xc0, 0x7a])).toEqual({ kind: 'programChange', channel: 1, program: 122 });
    expect(parseMidi([0xb1, 43, 2])).toEqual({ kind: 'controlChange', channel: 2, controller: 43, value: 2 });
    expect(parseMidi([0x9f, 60, 100])).toEqual({ kind: 'noteOn', channel: 16, note: 60, velocity: 100 });
    expect(parseMidi([0xe0, 0x00, 0x40])).toEqual({ kind: 'pitchBend', channel: 1, value: 0 });
    expect(parseMidi([0xe0, 0x7f, 0x7f])).toEqual({ kind: 'pitchBend', channel: 1, value: 8191 });
    expect(parseMidi([0xe0, 0x00, 0x00])).toEqual({ kind: 'pitchBend', channel: 1, value: -8192 });
  });

  it('разбирает системные сообщения', () => {
    expect(parseMidi([0xf8])).toEqual({ kind: 'clock' });
    expect(parseMidi([0xfa])).toEqual({ kind: 'start' });
    expect(parseMidi([0xf2, 0x10, 0x01])).toEqual({ kind: 'songPosition', position: 0x90 });
    expect(parseMidi([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])).toEqual({ kind: 'sysex', data: [0x7e, 0x7f, 0x06, 0x01] });
    expect(parseMidi([0xf1, 0x35])).toEqual({ kind: 'mtcQuarterFrame', piece: 3, value: 5 });
  });

  it('отмечает некорректные сообщения', () => {
    expect(parseMidi([]).kind).toBe('invalid');
    expect(parseMidi([0x40, 0x10]).kind).toBe('invalid');
    expect(parseMidi([0xc0]).kind).toBe('invalid');
    expect(parseMidi([0xc0, 1, 2]).kind).toBe('invalid');
    expect(parseMidi([0xb0, 0x80, 1]).kind).toBe('invalid');
    expect(parseMidi([0xf0, 0x01]).kind).toBe('invalid');
    expect(parseMidi([0xf7]).kind).toBe('invalid');
    expect(parseMidi([0xf4]).kind).toBe('invalid');
  });
});

describe('описания', () => {
  it('форматирует байты и ноты', () => {
    expect(formatHex([0xb1, 0x2b, 0x02])).toBe('B1 2B 02');
    expect(formatHex([1, 2, 3, 4], 2)).toBe('01 02 …');
    expect(noteName(60)).toBe('C4');
    expect(noteName(0)).toBe('C-1');
  });

  it('описывает Bank Select и Program Change', () => {
    expect(describeMessage(parseMidi([0xb0, 0, 1]))).toBe('Control Change · CC#0 (Bank Select MSB) = 1');
    expect(describeMessage(parseMidi([0xc0, 122]))).toBe('Program Change · 122 (№123 при счёте с 1)');
    expect(describeMessage(parseMidi([0x90, 60, 0]))).toContain('= Note Off');
    expect(isRealtime(parseMidi([0xf8]))).toBe(true);
    expect(isRealtime(parseMidi([0xc0, 1]))).toBe(false);
  });
});
