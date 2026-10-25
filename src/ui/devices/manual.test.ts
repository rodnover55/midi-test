import { describe, expect, it } from 'vitest';
import type { QuadCortexState } from '../../core/devices/quadCortex/engine.ts';
import { ENGINES } from '../../core/devices/registry.ts';
import { Monitor } from '../../core/monitor.ts';
import {
  hxFootswitch,
  hxPreset,
  hxSnapshot,
  hxTuner,
  MANUAL_PORT,
  manualChannel,
  qcFootswitch,
  qcGigView,
  qcLoadPreset,
  qcScene,
  qcTuner,
} from './manual.ts';

describe('ручное управление', () => {
  it('Omni заменяет каналом 1', () => {
    expect(manualChannel('omni')).toBe(1);
    expect(manualChannel(2)).toBe(2);
  });

  it('строит сообщения Quad Cortex', () => {
    expect(qcFootswitch(2, 0)).toEqual([0xb1, 35, 127]);
    expect(qcFootswitch(2, 7)).toEqual([0xb1, 42, 127]);
    expect(qcScene(2, 4)).toEqual([0xb1, 43, 4]);
    expect(qcTuner(2, true)).toEqual([0xb1, 45, 127]);
    expect(qcTuner(2, false)).toEqual([0xb1, 45, 0]);
    expect(qcGigView(2, true)).toEqual([0xb1, 46, 127]);
  });

  it('загружает пресет Quad Cortex по формулам калькулятора', () => {
    // 9D в сетлисте 9: CC#0 = 0, PC 67; 17A в сетлисте 5: CC#0 = 1, PC 0; 19H: PC 23.
    expect(qcLoadPreset(2, 9, 67)).toEqual([
      [0xb1, 32, 9],
      [0xb1, 0, 0],
      [0xc1, 67],
    ]);
    expect(qcLoadPreset(2, 5, 128)).toEqual([
      [0xb1, 32, 5],
      [0xb1, 0, 1],
      [0xc1, 0],
    ]);
    expect(qcLoadPreset(1, 3, 151)[2]).toEqual([0xc0, 23]);
  });

  it('строит сообщения HX Stomp', () => {
    expect(hxFootswitch(1, 0, true)).toEqual([0xb0, 49, 127]);
    expect(hxFootswitch(1, 2, false)).toEqual([0xb0, 51, 0]);
    expect(hxPreset(1, 125)).toEqual([0xc0, 125]);
    expect(hxSnapshot(1, 1)).toEqual([0xb0, 69, 0]);
    expect(hxSnapshot(1, 3)).toEqual([0xb0, 69, 2]);
    expect(hxTuner(1)).toEqual([0xb0, 68, 127]);
  });

  it('загрузка пресета Quad Cortex через монитор меняет пресет модели', () => {
    const monitor = new Monitor(ENGINES, {
      devices: { qc: { channel: 2, settings: {} }, hxstomp: { channel: 1, settings: {} } },
      logRealtime: false,
      logLimit: 100,
    });
    let time = 1000;
    for (const bytes of qcLoadPreset(2, 9, 67)) {
      monitor.process({ port: MANUAL_PORT, bytes: [...bytes], time: time++ });
    }
    const preset = (monitor.states().qc as QuadCortexState).preset;
    expect(preset.setlist).toBe(9);
    expect(preset.label).toBe('9D');
    expect(monitor.log().map((e) => e.port)).toEqual([MANUAL_PORT, MANUAL_PORT, MANUAL_PORT]);
  });
});
