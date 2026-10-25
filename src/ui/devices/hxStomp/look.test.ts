import { describe, expect, it } from 'vitest';
import type { HxStompState } from '../../../core/devices/hxStomp/engine.ts';
import { parseSequence, replay } from '../../../core/replay.ts';
import {
  beatFlash,
  iconRing,
  LED_COLORS,
  LED_PRESET_COLOR,
  labelLines,
  nextFlashChange,
  ringLook,
  SCREEN,
  shade,
  splitLabel,
} from './look.ts';

function stateAfter(midi: string, settings?: Record<string, string | boolean>, gap = 100): HxStompState {
  return replay('hxstomp', parseSequence(midi), { channel: 1, gap, start: 1_000_000, settings })
    .state as HxStompState;
}

/** 25 импульсов MIDI Clock через 21 мс — около 119 BPM, доля на первом импульсе. */
const CLOCK = Array.from({ length: 25 }, () => 'F8').join(';');

describe('beatFlash', () => {
  it('вспышка 100 мс в начале каждой доли', () => {
    expect(beatFlash(120, 1000, 1000)).toBe(true);
    expect(beatFlash(120, 1000, 1099)).toBe(true);
    expect(beatFlash(120, 1000, 1100)).toBe(false);
    expect(beatFlash(120, 1000, 1499)).toBe(false);
    expect(beatFlash(120, 1000, 1500)).toBe(true);
  });

  it('доли продолжаются и до beatTime', () => {
    expect(beatFlash(120, 1000, 999)).toBe(false);
    expect(beatFlash(120, 1000, 500)).toBe(true);
  });

  it('в быстром темпе вспышка не длиннее половины доли', () => {
    expect(beatFlash(400, 0, 74)).toBe(true);
    expect(beatFlash(400, 0, 76)).toBe(false);
  });

  it('nextFlashChange — время до начала или конца вспышки', () => {
    expect(nextFlashChange(120, 1000, 1000)).toBe(100);
    expect(nextFlashChange(120, 1000, 1050)).toBe(50);
    expect(nextFlashChange(120, 1000, 1100)).toBe(400);
    expect(nextFlashChange(120, 1000, 1499)).toBe(1);
    expect(nextFlashChange(400, 0, 75)).toBe(75);
  });

  it('без темпа вспышек нет; неизвестная фаза отсчитывается от нуля', () => {
    expect(beatFlash(0, 0, 0)).toBe(false);
    expect(beatFlash(120, null, 1000)).toBe(true);
    expect(beatFlash(120, null, 1250)).toBe(false);
  });
});

describe('ringLook', () => {
  it('Stomp: назначения неизвестны — нейтрально, TAP мигает красным в темпе Tap Tempo', () => {
    const state = stateAfter('B0 40 7F;B0 40 7F', undefined, 500);
    expect(ringLook(state.switches[0].ring, state, false)).toEqual({ kind: 'neutral' });
    expect(ringLook(state.switches[2].ring, state, false)).toEqual({
      kind: 'tempo',
      color: LED_COLORS.red,
      bpm: 120,
      beatTime: 1_000_500,
    });
  });

  it('TAP синий, пока приходит MIDI Clock, и красный в собственном темпе, когда клок пропал', () => {
    const state = stateAfter(`B0 40 7F;B0 40 7F;${CLOCK}`, undefined, 21);
    const tap = state.switches[2].ring;
    const following = ringLook(tap, state, true);
    expect(following).toMatchObject({ kind: 'tempo', color: LED_COLORS.blue, bpm: state.tempo.bpm });
    expect(ringLook(tap, state, false)).toEqual({
      kind: 'tempo',
      color: LED_COLORS.red,
      bpm: state.tempo.own?.bpm ?? null,
      beatTime: state.tempo.own?.beatTime ?? null,
    });
  });

  it('Preset: загруженный пресет красный, остальные тускло-белые', () => {
    const state = stateAfter('C0 7A;B0 47 02');
    expect(state.switches.map((s) => ringLook(s.ring, state, false))).toEqual([
      { kind: 'lit', color: LED_COLORS.white, dim: true },
      { kind: 'lit', color: LED_COLORS.white, dim: true },
      { kind: 'lit', color: LED_COLORS.red, dim: false },
    ]);
  });

  it('Snapshot: выбранный снапшот горит цветом из пресета — нейтральным белым', () => {
    const state = stateAfter('C0 7A;B0 45 01;B0 47 03');
    expect(ringLook(state.switches[1].ring, state, false)).toEqual({
      kind: 'lit',
      color: LED_PRESET_COLOR,
      dim: false,
    });
    expect(ringLook(state.switches[0].ring, state, false)).toEqual({ kind: 'lit', color: LED_COLORS.white, dim: true });
  });

  it('All Bypass гасит все кольца, Tuner делает их нейтральными', () => {
    const bypass = stateAfter('C0 7A;B0 47 02;B0 46 00');
    expect(bypass.switches.map((s) => ringLook(s.ring, bypass, false).kind)).toEqual(['off', 'off', 'off']);
    const tuner = stateAfter('C0 7A;B0 44 7F');
    expect(tuner.switches.map((s) => ringLook(s.ring, tuner, false).kind)).toEqual(['neutral', 'neutral', 'neutral']);
  });
});

describe('iconRing', () => {
  it('TAP/TUNER красный, PRESET ∨/∧ серые, назначения — только обводка', () => {
    const scroll = stateAfter('B0 47 01');
    expect(scroll.switches.map(iconRing)).toEqual([
      { fill: SCREEN.gray, stroke: SCREEN.gray },
      { fill: SCREEN.gray, stroke: SCREEN.gray },
      { fill: SCREEN.red, stroke: SCREEN.red },
    ]);
    const stomp = stateAfter('');
    expect(iconRing(stomp.switches[0])).toEqual({ fill: null, stroke: SCREEN.gray });
  });

  it('Snapshot: выбранный снапшот белый', () => {
    const state = stateAfter('C0 7A;B0 45 00;B0 47 03');
    expect(state.switches.map((s) => iconRing(s).fill)).toEqual([SCREEN.text, SCREEN.gray, SCREEN.gray]);
  });
});

describe('подписи', () => {
  it('splitLabel делит по пробелу ближе к середине, без пробелов — после косой черты', () => {
    expect(splitLabel('TAP/TUNER')).toEqual(['TAP/', 'TUNER']);
    expect(splitLabel('Toggle EXP 1/2')).toEqual(['Toggle', 'EXP 1/2']);
    expect(splitLabel('String 6 Offset')).toEqual(['String 6', 'Offset']);
    expect(splitLabel('Mute')).toEqual(['Mute']);
  });

  it('labelLines: шевроны PRESET, прочерк для неизвестного, функция FS3 белым', () => {
    expect(labelLines({ kind: 'text', text: 'PRESET ∨', color: 'white' })).toEqual({
      lines: ['PRESET'],
      color: SCREEN.text,
      chevron: 'down',
    });
    expect(labelLines({ kind: 'text', text: 'TAP/TUNER', color: 'red' })).toEqual({
      lines: ['TAP/', 'TUNER'],
      color: SCREEN.red,
      chevron: null,
    });
    expect(labelLines({ kind: 'assignment' })).toEqual({ lines: ['—'], color: SCREEN.gray, chevron: null });
    expect(labelLines({ kind: 'function', name: 'Preset Up' })).toEqual({
      lines: ['Preset', 'Up'],
      color: SCREEN.text,
      chevron: null,
    });
    expect(labelLines({ kind: 'snapshot', snapshot: 1, current: true })).toBeNull();
  });

  it('shade меняет яркость цвета', () => {
    expect(shade('#ff8000', 0.5)).toBe('#804000');
    expect(shade('#123456', 1)).toBe('#123456');
  });
});
