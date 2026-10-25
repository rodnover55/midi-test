import { describe, expect, it } from 'vitest';
import type { HxStompState } from '../../../core/devices/hxStomp/engine.ts';
import { parseSequence, replay } from '../../../core/replay.ts';
import { LED_COLORS } from './look.ts';
import { statusLine, statusParts } from './status.ts';

function stateAfter(midi: string, settings?: Record<string, string | boolean>, gap = 100): HxStompState {
  return replay('hxstomp', parseSequence(midi), { channel: 1, gap, start: 1_000_000, settings })
    .state as HxStompState;
}

describe('statusLine', () => {
  it('после включения всё неизвестно', () => {
    expect(statusLine(stateAfter(''), false)).toBe(
      'Пресет неизвестен · снапшот неизвестен · Play view · режим Stomp · темп неизвестен · лупер: пусто',
    );
  });

  it('пресет, снапшот и темп пресета', () => {
    expect(statusLine(stateAfter('C0 7A'), false)).toBe(
      'Пресет 41C · снапшот — сохранённый в пресете · Play view · режим Stomp · темп из пресета (неизвестен) · ' +
        'лупер: пусто',
    );
    expect(statusLine(stateAfter('C0 7A;B0 45 01'), false)).toContain('Пресет 41C · снапшот 2 ·');
  });

  it('Tap Tempo, лупер и номер пресета числом', () => {
    const state = stateAfter('C0 05;B0 40 7F;B0 40 7F;B0 3C 7F;B0 41 7F;B0 41 7F;B0 41 7F;B0 41 7F', {
      presetNumber: 'numbers',
    });
    expect(statusLine(state, false)).toMatch(/^Пресет 005 · .* · темп 600\.0 BPM \(Tap\) · лупер: /);
  });

  it('Tuner, All Bypass, банк в очереди', () => {
    expect(statusLine(stateAfter('B0 44 7F;B0 51 7F'), false)).toContain('Tuner, страница 2 из 4');
    expect(statusLine(stateAfter('B0 46 00', { bypassType: 'dsp' }), false)).toContain('Play view, DSP Bypass');
    expect(statusLine(stateAfter('C0 7A;B0 34 7F', { fs4Function: 'bankUp' }), false)).toContain(
      'режим Preset, банк 42 в очереди',
    );
  });

  it('Edit view: изменённый пресет и значения Knob 1–3; педали EXP', () => {
    const state = stateAfter('C0 7A;B0 49 7F;B0 4B 40;B0 01 7F');
    const line = statusLine(state, false);
    expect(line).toContain('Пресет 41C (изменён, «E»)');
    expect(line).toContain('Edit view');
    expect(line).toContain('Knob 1–3: 64 / — / —');
    expect(line).toContain('EXP 1/2: 127 / —');
  });

  it('MIDI Clock: темп клока, пока импульсы приходят, и собственный, когда пропали', () => {
    const clock = Array.from({ length: 49 }, () => 'F8').join(';');
    const state = stateAfter(`B0 40 7F;B0 40 7F;${clock}`, undefined, 500 / 24);
    expect(statusLine(state, true)).toContain('темп 120.0 BPM по MIDI Clock');
    expect(statusLine(state, false)).toContain('MIDI Clock пропал, темп ');
  });

  it('точка цвета кольца лупера пропадает, пока кольца погашены All Bypass или показывают Tuner', () => {
    const looperLed = (midi: string) =>
      statusParts(stateAfter(midi), false).find((part) => part.text.startsWith('лупер:'))?.led;
    expect(looperLed('B0 3C 7F')).toBe(LED_COLORS.red);
    expect(looperLed('B0 3C 7F;B0 46 00')).toBeNull();
    expect(looperLed('B0 3C 7F;B0 44 00')).toBeNull();
  });
});
