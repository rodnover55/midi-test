import { describe, expect, it } from 'vitest';
import { readQuadCortexSettings } from '../../../core/devices/quadCortex/engine.ts';
import { TestDevice } from '../../../core/devices/quadCortex/testDevice.ts';
import { dimLensColor, quadCortexLeds, TEMPO_FLASH_MS, tempoBlink, tempoLit } from './leds.ts';
import { LED_COLORS, SCENE_COLOR, SLOT_COLORS } from './palette.ts';

function leds(device: TestDevice) {
  return quadCortexLeds(device.state, readQuadCortexSettings(device.state.settings));
}

/** Прибор с загруженным пресетом 2C (сетлист 1) в режиме из Mode Slot `slot`. */
function withPreset(slot: number, settings = {}): TestDevice {
  const device = new TestDevice(settings);
  device.cc(32, 1);
  device.pc(10);
  device.cc(47, slot);
  return device;
}

describe('светодиоды футсвитчей', () => {
  it('режим неизвестен — ни один не горит', () => {
    const device = new TestDevice();
    device.pc(10);
    expect(leds(device).footswitches.every((led) => led.level === 'off')).toBe(true);
  });

  it('PRESET: загруженный пресет горит цветом слота, остальные тускло цветами своих слотов', () => {
    const result = leds(withPreset(0));
    expect(result.footswitches[2]).toEqual({ color: SLOT_COLORS.C, level: 'on' });
    expect(result.footswitches[0]).toEqual({ color: SLOT_COLORS.A, level: 'dim' });
    expect(result.footswitches[7]).toEqual({ color: SLOT_COLORS.H, level: 'dim' });
  });

  it('PRESET при Dimmed LEDs = Off: невыбранные не горят', () => {
    const result = leds(withPreset(0, { dimmedLeds: false }));
    expect(result.footswitches[2].level).toBe('on');
    expect(result.footswitches.filter((led) => led.level === 'off')).toHaveLength(7);
  });

  it('PRESET с банками по 4: цвет по букве слота пресета', () => {
    const device = withPreset(0, { modeSlot1: 'PRESET+STOMP', modeSlot2: 'SCENE', modeSlot3: 'EMPTY' });
    const result = leds(device);
    expect(device.state.footswitches[4].role).toBe('stomp');
    expect(result.footswitches.slice(0, 4).map((led) => led.color)).toEqual([
      SLOT_COLORS.A,
      SLOT_COLORS.B,
      SLOT_COLORS.C,
      SLOT_COLORS.D,
    ]);
    expect(result.footswitches[4].level).toBe('off');
  });

  it('SCENE: текущая сцена горит, остальные тускло; после загрузки пресета сцена неизвестна — не горят', () => {
    const device = withPreset(1);
    device.cc(43, 2);
    expect(leds(device).footswitches[2]).toEqual({ color: SCENE_COLOR, level: 'on' });
    expect(leds(device).footswitches[0]).toEqual({ color: SCENE_COLOR, level: 'dim' });
    device.pc(11);
    expect(leds(device).footswitches.every((led) => led.level === 'off')).toBe(true);
  });

  it('STOMP: состояние блоков неизвестно — не горят даже после нажатий', () => {
    const device = withPreset(2);
    device.cc(35, 127);
    expect(leds(device).footswitches.every((led) => led.level === 'off')).toBe(true);
  });

  it('Tuner: горит только G — красный при MUTE = On, белый при Off', () => {
    const muted = new TestDevice();
    muted.cc(45, 127);
    expect(leds(muted).footswitches[6]).toEqual({ color: LED_COLORS.red, level: 'on' });
    expect(leds(muted).footswitches.filter((led) => led.level === 'off')).toHaveLength(7);
    const open = new TestDevice({ tunerMute: false });
    open.cc(45, 127);
    expect(leds(open).footswitches[6]).toEqual({ color: LED_COLORS.white, level: 'on' });
  });

  it('Looper X: идущая запись горит красным, остальные действия тускло своими цветами', () => {
    const device = new TestDevice();
    device.cc(48, 0);
    device.cc(53, 127);
    const result = leds(device);
    expect(result.footswitches[4]).toEqual({ color: LED_COLORS.red, level: 'on' });
    expect(result.footswitches[5]).toEqual({ color: LED_COLORS.white, level: 'dim' });
    expect(result.footswitches[0]).toEqual({ color: LED_COLORS.red, level: 'dim' });
  });

  it('Looper X в режиме Parameters и окно Tempo — не горят', () => {
    const looper = new TestDevice();
    looper.cc(48, 0);
    looper.cc(60, 1);
    expect(leds(looper).footswitches.every((led) => led.level === 'off')).toBe(true);
    const tempo = new TestDevice();
    tempo.cc(44, 127);
    tempo.cc(44, 127, 500);
    expect(tempo.state.screens).toEqual(['tempo']);
    expect(leds(tempo).footswitches.every((led) => led.level === 'off')).toBe(true);
  });

  it('BANK UP и BANK DOWN не горят', () => {
    const result = leds(withPreset(0));
    expect(result.bankUp.level).toBe('off');
    expect(result.bankDown.level).toBe('off');
  });
});

describe('тусклый светодиод', () => {
  it('линза — цвет свечения на 30 % яркости поверх ободка #1A191E: белый тусклый темнее негорящей линзы', () => {
    expect(dimLensColor(LED_COLORS.white)).toBe('#5b5a5e');
    expect(dimLensColor(SLOT_COLORS.H)).toBe('#5f1d21');
    expect(dimLensColor(SLOT_COLORS.A)).toBe('#275c32');
  });
});

describe('светодиод TEMPO', () => {
  it('не мигает, пока темп неизвестен', () => {
    expect(tempoBlink(new TestDevice().state.tempo)).toBeNull();
  });

  it('мигает зелёным в темп Tap Tempo со вспышкой в начале каждой доли', () => {
    const device = new TestDevice();
    device.cc(44, 127);
    device.cc(44, 127, 500);
    const blink = tempoBlink(device.state.tempo);
    expect(blink).toEqual({ color: LED_COLORS.green, period: 500, phase: device.time });
    expect(tempoLit(blink, device.time)).toBe(true);
    expect(tempoLit(blink, device.time + TEMPO_FLASH_MS - 1)).toBe(true);
    expect(tempoLit(blink, device.time + TEMPO_FLASH_MS)).toBe(false);
    expect(tempoLit(blink, device.time + 1000 + 10)).toBe(true);
    expect(tempoLit(blink, device.time - 490)).toBe(true);
  });

  it('красный, когда прибор передаёт MIDI Clock; не мигает при TEMPO LED = Off', () => {
    const red = new TestDevice({ midiClockOut: 'USB' });
    red.cc(44, 127);
    red.cc(44, 127, 500);
    expect(tempoBlink(red.state.tempo)?.color).toBe(LED_COLORS.red);
    const off = new TestDevice({ tempoLed: false });
    off.cc(44, 127);
    off.cc(44, 127, 500);
    expect(tempoBlink(off.state.tempo)).toBeNull();
    expect(tempoLit(null, off.time)).toBe(false);
  });

  it('синий при синхронизации к входящему MIDI Clock', () => {
    const device = new TestDevice({ midiClockIn: true });
    device.ticks(49, 120);
    expect(device.state.tempo.bpm).toBe(120);
    expect(tempoBlink(device.state.tempo)?.color).toBe(LED_COLORS.blue);
  });
});
