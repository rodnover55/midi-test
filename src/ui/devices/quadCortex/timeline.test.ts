import { describe, expect, it } from 'vitest';
import { LOOPER_MAX_RECORD_MS } from '../../../core/devices/quadCortex/engine.ts';
import type { LooperState, TempoState } from '../../../core/devices/quadCortex/engine.ts';
import { START_TIME, TestDevice } from '../../../core/devices/quadCortex/testDevice.ts';
import {
  beatInBar,
  changesOverTime,
  formatDuration,
  looperAvailable,
  looperProgress,
  timeKey,
} from './timeline.ts';

function tapped(): TestDevice {
  const device = new TestDevice();
  device.cc(44, 127);
  device.cc(44, 127, 500);
  return device;
}

function looper(changes: Partial<LooperState>): LooperState {
  return { ...new TestDevice().state.looper, ...changes };
}

describe('доля такта', () => {
  it('отсчитывается от первой доли такта по темпу', () => {
    const device = tapped();
    const tempo = device.state.tempo;
    expect(beatInBar(tempo, device.time)).toBe(0);
    expect(beatInBar(tempo, device.time + 499)).toBe(0);
    expect(beatInBar(tempo, device.time + 500)).toBe(1);
    expect(beatInBar(tempo, device.time + 1500)).toBe(3);
    expect(beatInBar(tempo, device.time + 2000)).toBe(0);
    expect(beatInBar(tempo, device.time - 1)).toBe(3);
  });

  it('неизвестна без темпа или фазы', () => {
    const tempo = new TestDevice().state.tempo;
    expect(beatInBar(tempo, START_TIME)).toBeNull();
    const noPhase: TempoState = { ...tempo, bpm: 120 };
    expect(beatInBar(noPhase, START_TIME)).toBeNull();
  });
});

describe('ход Looper X', () => {
  it('запись: время с начала записи', () => {
    expect(looperProgress(looper({ transport: 'recording', recordStart: 1000 }), 3500)).toEqual({
      kind: 'recording',
      elapsed: 2500,
    });
    expect(looperProgress(looper({ transport: 'recording', recordStart: null }), 3500)).toBeNull();
  });

  it('воспроизведение: позиция в петле с учётом HALF SPEED и REVERSE', () => {
    const base = { transport: 'playing' as const, loopStart: 1000, length: 4000 };
    expect(looperProgress(looper(base), 2000)).toEqual({ kind: 'loop', position: 0.25, length: 4000 });
    expect(looperProgress(looper(base), 9000)).toEqual({ kind: 'loop', position: 0, length: 4000 });
    const halfSpeed = looperProgress(looper({ ...base, halfSpeed: true }), 3000);
    expect(halfSpeed).toEqual({ kind: 'loop', position: 0.25, length: 4000 });
    const reverse = looperProgress(looper({ ...base, reverse: true }), 2000);
    expect(reverse).toEqual({ kind: 'loop', position: 0.75, length: 4000 });
    expect(looperProgress(looper({ ...base, transport: 'overdubbing' }), 2000)?.kind).toBe('loop');
  });

  it('без петли, у остановленной или с неизвестной длиной — нет хода', () => {
    expect(looperProgress(looper({}), 2000)).toBeNull();
    expect(looperProgress(looper({ transport: 'stopped', length: 4000, loopStart: null }), 2000)).toBeNull();
    expect(looperProgress(looper({ transport: 'playing', length: null, loopStart: 1000 }), 2000)).toBeNull();
  });

  it('свободное время записи', () => {
    expect(looperAvailable(looper({}), 0)).toBe(LOOPER_MAX_RECORD_MS);
    const recording = (recordStart: number) => looper({ transport: 'recording', recordStart });
    expect(looperAvailable(recording(1000), 4000)).toBe(LOOPER_MAX_RECORD_MS - 3000);
    expect(looperAvailable(recording(0), LOOPER_MAX_RECORD_MS + 5000)).toBe(0);
    expect(looperAvailable(looper({ transport: 'recording', recordStart: null }), 4000)).toBeNull();
    expect(looperAvailable(looper({ transport: 'stopped', length: 4000 }), 0)).toBe(LOOPER_MAX_RECORD_MS - 4000);
    expect(looperAvailable(looper({ transport: 'playing', length: null }), 0)).toBeNull();
  });
});

describe('ключ изображения', () => {
  it('меняется со вспышкой TEMPO и закрытием окна Tempo, а между ними нет', () => {
    const device = tapped();
    const state = device.state;
    expect(timeKey(state, device.time + 10)).toBe(timeKey(state, device.time + 90));
    expect(timeKey(state, device.time + 90)).not.toBe(timeKey(state, device.time + 110));
    expect(timeKey(state, device.time + 4810)).not.toBe(timeKey(state, device.time + 5010));
    expect(timeKey(state, device.time + 5010)).toBe(timeKey(state, device.time + 5050));
  });

  it('состояние меняется со временем при мигании TEMPO, записи петли, но не у выключенного прибора', () => {
    expect(changesOverTime(new TestDevice().state)).toBe(false);
    expect(changesOverTime(tapped().state)).toBe(true);
    const noLed = new TestDevice({ tempoLed: false, tempoWindowSeconds: 0 });
    noLed.cc(44, 127);
    noLed.cc(44, 127, 500);
    expect(changesOverTime(noLed.state)).toBe(true);
    noLed.cc(45, 127);
    expect(changesOverTime(noLed.state)).toBe(false);
    const recording = new TestDevice();
    recording.cc(48, 0);
    recording.cc(53, 127);
    expect(changesOverTime(recording.state)).toBe(true);
  });
});

describe('длительность', () => {
  it('минуты и секунды, с десятыми по запросу', () => {
    expect(formatDuration(278_000)).toBe('4:38');
    expect(formatDuration(4_250, true)).toBe('0:04.2');
    expect(formatDuration(61_000, true)).toBe('1:01.0');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
