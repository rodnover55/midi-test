import { describe, expect, it } from 'vitest';
import { LOOPER_MAX_RECORD_MS } from './looper.ts';
import { TestDevice } from './testDevice.ts';

/** Записывает петлю длиной `length` мс: после этого петля играет с начала. */
function recordLoop(qc: TestDevice, length = 2000): void {
  qc.cc(53, 127);
  qc.cc(53, 127, length);
}

describe('Looper X: редактор (CC#48, CC#60)', () => {
  it('CC#48 = 0–63 открывает редактор в режиме Perform, 64–127 закрывает', () => {
    const qc = new TestDevice();
    expect(qc.cc(48, 0)).toEqual({
      effect: 'applied',
      text: 'Looper X открыт (Perform), если в пресете есть блок Looper X',
    });
    expect(qc.state.screens).toEqual(['looper']);
    expect(qc.state.looper.view).toBe('perform');
    expect(qc.cc(48, 63)).toEqual({ effect: 'ignored', text: 'Looper X уже открыт' });
    expect(qc.cc(48, 64)).toEqual({ effect: 'applied', text: 'Looper X закрыт' });
    expect(qc.state.screens).toEqual([]);
    expect(qc.cc(48, 127)).toEqual({ effect: 'ignored', text: 'Looper X уже закрыт' });
  });

  it('CC#60 переключает Perform и Parameters открытого редактора; открывается редактор всегда в Perform', () => {
    const qc = new TestDevice();
    expect(qc.cc(60, 1)).toEqual({
      effect: 'ignored',
      text: 'Looper X: редактор закрыт — переключение на Parameters без действия (не документировано)',
    });
    qc.cc(48, 0);
    expect(qc.cc(60, 1)).toEqual({ effect: 'applied', text: 'Looper X: Parameters' });
    expect(qc.state.looper.view).toBe('parameters');
    expect(qc.state.footswitches.every((f) => f.role === 'looper' && f.label === null && f.active === null)).toBe(true);
    expect(qc.cc(60, 1)).toEqual({ effect: 'ignored', text: 'Looper X: уже Parameters' });
    expect(qc.cc(60, 2)).toEqual({ effect: 'ignored', text: 'CC#60 = 2: значение вне диапазона 0–1 — без действия' });
    qc.cc(48, 127);
    qc.cc(48, 0);
    expect(qc.state.looper.view).toBe('perform');
    expect(qc.cc(60, 0)).toEqual({ effect: 'ignored', text: 'Looper X: уже Perform' });
    qc.cc(60, 1);
    expect(qc.cc(60, 0)).toEqual({ effect: 'applied', text: 'Looper X: Perform' });
  });

  it('в Perform показывает действия футсвитчей A–H: по умолчанию — как на экране Looper X', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    qc.cc(48, 0);
    expect(qc.state.footswitches.map((f) => f.label)).toEqual([
      'DUPLICATE',
      'ONE SHOT',
      'HALF SPEED',
      'PUNCH IN',
      'RECORD',
      'PLAY',
      'REVERSE',
      'UNDO',
    ]);
    expect(qc.state.footswitches.every((f) => f.role === 'looper' && f.active === false)).toBe(true);
    qc.cc(46, 127);
    expect(qc.state.footswitches.every((f) => f.role === 'scene')).toBe(true);
  });
});

describe('Looper X: RECORD/OVERDUB (CC#53) и PLAY/STOP (CC#54)', () => {
  it('RECORD → конец записи и воспроизведение → OVERDUB вкл/выкл; STOP и PLAY; новая запись', () => {
    const qc = new TestDevice();
    qc.cc(48, 0);
    expect(qc.cc(53, 127)).toEqual({ effect: 'applied', text: 'Looper X: RECORD — запись новой петли' });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', recordStart: qc.time, undo: null });
    expect(qc.state.footswitches[4]).toMatchObject({ label: 'RECORD', active: true });
    expect(qc.state.footswitches[5]).toMatchObject({ label: 'STOP', active: false });
    expect(qc.cc(53, 127, 4000)).toEqual({ effect: 'applied', text: 'Looper X: запись завершена, воспроизведение' });
    expect(qc.state.looper).toMatchObject({
      transport: 'playing',
      length: 4000,
      loopStart: qc.time,
      recordStart: null,
      undo: 'UNDO',
      stopsAt: null,
    });
    expect(qc.state.footswitches[4]).toMatchObject({ label: 'OVERDUB', active: false });
    expect(qc.state.footswitches[5]).toMatchObject({ label: 'STOP', active: true });
    expect(qc.cc(53, 127)).toEqual({ effect: 'applied', text: 'Looper X: OVERDUB вкл' });
    expect(qc.state.looper.transport).toBe('overdubbing');
    expect(qc.state.footswitches[4]).toMatchObject({ label: 'OVERDUB', active: true });
    expect(qc.cc(53, 127)).toEqual({ effect: 'applied', text: 'Looper X: OVERDUB выкл' });
    expect(qc.state.looper.transport).toBe('playing');
    expect(qc.cc(54, 127)).toEqual({ effect: 'applied', text: 'Looper X: STOP — петля остановлена' });
    expect(qc.state.looper).toMatchObject({ transport: 'stopped', loopStart: null, length: 4000 });
    expect(qc.state.footswitches[5]).toMatchObject({ label: 'PLAY', active: false });
    expect(qc.cc(54, 127)).toEqual({ effect: 'applied', text: 'Looper X: PLAY — воспроизведение' });
    expect(qc.state.looper).toMatchObject({ transport: 'playing', loopStart: qc.time });
    qc.cc(54, 127);
    expect(qc.cc(53, 127)).toEqual({ effect: 'applied', text: 'Looper X: RECORD — запись новой петли' });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', length: null, undo: null });
  });

  it('PLAY/STOP во время записи завершает запись и останавливает петлю, во время OVERDUB — останавливает петлю', () => {
    const qc = new TestDevice();
    qc.cc(53, 127);
    expect(qc.cc(54, 127, 1500)).toEqual({ effect: 'applied', text: 'Looper X: запись завершена, STOP' });
    expect(qc.state.looper).toMatchObject({ transport: 'stopped', length: 1500, undo: 'UNDO' });
    qc.cc(54, 127);
    qc.cc(53, 127);
    expect(qc.cc(54, 127)).toEqual({ effect: 'applied', text: 'Looper X: STOP — петля остановлена, OVERDUB выкл' });
    expect(qc.state.looper.transport).toBe('stopped');
  });

  it('PLAY без записанной петли — без действия', () => {
    const qc = new TestDevice();
    const before = qc.state;
    expect(qc.cc(54, 127)).toEqual({ effect: 'ignored', text: 'Looper X: PLAY без действия — петля не записана' });
    expect(qc.state).toBe(before);
  });

  it('CC#53 = 0–63 завершает запись только при RECORD MODE = Momentary', () => {
    const toggle = new TestDevice();
    toggle.cc(53, 127);
    expect(toggle.cc(53, 0)).toEqual({
      effect: 'ignored',
      text: 'Looper X: STOP по значению 0–63 действует только при RECORD MODE = Momentary — без действия',
    });
    expect(toggle.state.looper.transport).toBe('recording');
    const momentary = new TestDevice({ looperRecordMode: 'Momentary' });
    momentary.cc(53, 127);
    expect(momentary.cc(53, 0, 3000)).toEqual({
      effect: 'applied',
      text: 'Looper X: запись завершена, воспроизведение (RECORD MODE = Momentary)',
    });
    expect(momentary.state.looper).toMatchObject({ transport: 'playing', length: 3000 });
    expect(momentary.cc(53, 0)).toEqual({
      effect: 'ignored',
      text: 'Looper X: значение 0–63 без действия — нет активной записи',
    });
  });

  it('CC#53 = 0–63 выключает OVERDUB только при OVERDUB MODE = Momentary', () => {
    const toggle = new TestDevice();
    recordLoop(toggle);
    toggle.cc(53, 127);
    expect(toggle.cc(53, 0)).toEqual({
      effect: 'ignored',
      text: 'Looper X: STOP по значению 0–63 действует только при OVERDUB MODE = Momentary — без действия',
    });
    const momentary = new TestDevice({ looperOverdubMode: 'Momentary' });
    recordLoop(momentary);
    momentary.cc(53, 127);
    expect(momentary.cc(53, 0)).toEqual({
      effect: 'applied',
      text: 'Looper X: OVERDUB выкл (OVERDUB MODE = Momentary)',
    });
    expect(momentary.state.looper.transport).toBe('playing');
  });

  it('запись дольше 4 мин 44 с завершается сама, и петля играет', () => {
    const qc = new TestDevice();
    qc.cc(53, 127);
    const start = qc.time;
    qc.send([0x91, 60, 1], LOOPER_MAX_RECORD_MS - 1);
    expect(qc.state.looper.transport).toBe('recording');
    qc.send([0x91, 60, 1], 1);
    expect(qc.state.looper).toMatchObject({
      transport: 'playing',
      length: LOOPER_MAX_RECORD_MS,
      loopStart: start + LOOPER_MAX_RECORD_MS,
      undo: 'UNDO',
    });
  });

  it('RECORD/OVERDUB во время PUNCH IN — без действия', () => {
    const qc = new TestDevice();
    recordLoop(qc);
    qc.cc(52, 127);
    expect(qc.cc(53, 127)).toEqual({
      effect: 'ignored',
      text: 'Looper X: RECORD/OVERDUB во время PUNCH IN не документирован — без действия',
    });
  });
});

describe('Looper X: переключатели 64–127 (CC#49–51, 54–56)', () => {
  it.each([49, 50, 51, 54, 55, 56])('CC#%i = 0–63 не документировано — без действия', (cc) => {
    const qc = new TestDevice();
    recordLoop(qc);
    const before = qc.state;
    expect(qc.cc(cc, 63)).toEqual({
      effect: 'ignored',
      text: `CC#${cc} = 63: значение 0–63 не документировано — без действия`,
    });
    expect(qc.state).toBe(before);
  });

  it('DUPLICATE (CC#49): во время воспроизведения удваивает длину петли, позиция сохраняется', () => {
    const qc = new TestDevice();
    expect(qc.cc(49, 127)).toEqual({
      effect: 'ignored',
      text: 'Looper X: DUPLICATE без действия — петля не воспроизводится',
    });
    recordLoop(qc);
    expect(qc.cc(49, 127, 600)).toEqual({
      effect: 'applied',
      text: 'Looper X: DUPLICATE вкл — наложение удваивает длину петли',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'duplicating', length: 4000, loopStart: qc.time - 600 });
    expect(qc.cc(49, 127)).toEqual({ effect: 'applied', text: 'Looper X: DUPLICATE выкл' });
    expect(qc.state.looper).toMatchObject({ transport: 'playing', length: 4000, undo: 'UNDO' });
  });

  it('ONE SHOT (CC#50): включённый во время воспроизведения останавливает петлю в конце прохода', () => {
    const qc = new TestDevice();
    recordLoop(qc);
    const loopStart = qc.time;
    expect(qc.cc(50, 127, 2500)).toEqual({
      effect: 'applied',
      text: 'Looper X: ONE SHOT вкл — петля остановится после конца записи',
    });
    expect(qc.state.looper).toMatchObject({ oneShot: true, transport: 'playing', stopsAt: loopStart + 4000 });
    qc.send([0x91, 60, 1], 1400);
    expect(qc.state.looper.transport).toBe('playing');
    qc.send([0x91, 60, 1], 100);
    expect(qc.state.looper).toMatchObject({ transport: 'stopped', stopsAt: null, loopStart: null });
    expect(qc.cc(54, 127).text).toBe('Looper X: PLAY — воспроизведение');
    expect(qc.state.looper.stopsAt).toBe(qc.time + 2000);
    expect(qc.cc(50, 127)).toEqual({ effect: 'applied', text: 'Looper X: ONE SHOT выкл' });
    expect(qc.state.looper).toMatchObject({ oneShot: false, stopsAt: null });
    qc.cc(54, 127);
    expect(qc.cc(50, 127)).toEqual({ effect: 'applied', text: 'Looper X: ONE SHOT вкл' });
  });

  it('HALF SPEED (CC#51): позиция в петле сохраняется, проход удлиняется вдвое', () => {
    const qc = new TestDevice();
    recordLoop(qc);
    expect(qc.cc(51, 127, 500)).toEqual({ effect: 'applied', text: 'Looper X: HALF SPEED вкл' });
    expect(qc.state.looper).toMatchObject({ halfSpeed: true, loopStart: qc.time - 1000 });
    qc.cc(50, 127);
    expect(qc.state.looper.stopsAt).toBe(qc.state.looper.loopStart! + 4000);
    expect(qc.cc(51, 127, 900)).toEqual({ effect: 'applied', text: 'Looper X: HALF SPEED выкл' });
    expect(qc.state.looper).toMatchObject({ halfSpeed: false, loopStart: qc.time - 1000, stopsAt: qc.time + 1000 });
  });

  it('HALF SPEED у петли нулевой длины не портит позицию', () => {
    const qc = new TestDevice();
    qc.cc(53, 127);
    qc.cc(53, 127, 0);
    expect(qc.state.looper).toMatchObject({ transport: 'playing', length: 0 });
    expect(qc.cc(51, 127).effect).toBe('applied');
    expect(qc.state.looper).toMatchObject({ halfSpeed: true, loopStart: qc.time - 100 });
  });

  it('REVERSE (CC#55): включённый до PLAY — петля пойдёт в обратную сторону', () => {
    const qc = new TestDevice();
    expect(qc.cc(55, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: REVERSE вкл — петля пойдёт в обратную сторону после PLAY',
    });
    expect(qc.cc(55, 127)).toEqual({ effect: 'applied', text: 'Looper X: REVERSE выкл' });
    recordLoop(qc);
    qc.cc(48, 0);
    expect(qc.cc(55, 127)).toEqual({ effect: 'applied', text: 'Looper X: REVERSE вкл' });
    expect(qc.state.looper.reverse).toBe(true);
    expect(qc.state.footswitches[6]).toMatchObject({ label: 'REVERSE', active: true });
  });

  it('UNDO/REDO (CC#56): нечего отменять — без действия; после записи UNDO и REDO чередуются', () => {
    const qc = new TestDevice();
    expect(qc.cc(56, 127)).toEqual({ effect: 'ignored', text: 'Looper X: UNDO без действия — отменять нечего' });
    recordLoop(qc);
    qc.cc(48, 0);
    expect(qc.cc(56, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: UNDO — последняя запись или наложение отменены',
    });
    expect(qc.state.looper.undo).toBe('REDO');
    expect(qc.state.footswitches[7]).toMatchObject({ label: 'REDO', active: false });
    expect(qc.cc(56, 127)).toEqual({ effect: 'applied', text: 'Looper X: REDO — отменённое возвращено' });
    expect(qc.state.looper.undo).toBe('UNDO');
    qc.cc(56, 127);
    qc.cc(53, 127);
    qc.cc(53, 127);
    expect(qc.state.looper.undo).toBe('UNDO');
  });
});

describe('Looper X: PUNCH IN/OUT (CC#52)', () => {
  it('64–127 переключает PUNCH IN и PUNCH OUT во время воспроизведения', () => {
    const qc = new TestDevice();
    expect(qc.cc(52, 127)).toEqual({
      effect: 'ignored',
      text: 'Looper X: PUNCH IN без действия — петля не воспроизводится',
    });
    recordLoop(qc);
    qc.cc(48, 0);
    expect(qc.cc(52, 127)).toEqual({ effect: 'applied', text: 'Looper X: PUNCH IN — запись с заменой звука петли' });
    expect(qc.state.looper.transport).toBe('punching');
    expect(qc.state.footswitches[3]).toMatchObject({ label: 'PUNCH OUT', active: true });
    expect(qc.cc(52, 127)).toEqual({ effect: 'applied', text: 'Looper X: PUNCH OUT' });
    expect(qc.state.looper).toMatchObject({ transport: 'playing', undo: 'UNDO' });
  });

  it('0–63 — PUNCH OUT только при PUNCH MODE = Momentary', () => {
    const toggle = new TestDevice();
    recordLoop(toggle);
    toggle.cc(52, 127);
    expect(toggle.cc(52, 0)).toEqual({
      effect: 'ignored',
      text: 'Looper X: PUNCH OUT по значению 0–63 действует только при PUNCH MODE = Momentary — без действия',
    });
    expect(toggle.state.looper.transport).toBe('punching');
    const momentary = new TestDevice({ looperPunchMode: 'Momentary' });
    recordLoop(momentary);
    momentary.cc(52, 127);
    expect(momentary.cc(52, 0)).toEqual({ effect: 'applied', text: 'Looper X: PUNCH OUT (PUNCH MODE = Momentary)' });
    expect(momentary.cc(52, 0)).toEqual({
      effect: 'ignored',
      text: 'Looper X: PUNCH OUT без действия — PUNCH IN не активен',
    });
  });
});

describe('Looper X: параметры блока (CC#57–59, CC#61)', () => {
  it.each([
    [57, 0, 'DUPLICATE MODE = Free', { duplicateMode: 'Free' }],
    [57, 1, 'DUPLICATE MODE = Sync', { duplicateMode: 'Sync' }],
    [58, 0, 'QUANTIZE = Off', { quantize: 0 }],
    [58, 1, 'QUANTIZE = 1 доля', { quantize: 1 }],
    [58, 4, 'QUANTIZE = 4 доли', { quantize: 4 }],
    [58, 8, 'QUANTIZE = 8 долей', { quantize: 8 }],
    [58, 9, 'QUANTIZE = 16 долей', { quantize: 16 }],
    [59, 0, 'MIDI Clock Start: Off', { midiClockStart: false }],
    [59, 1, 'MIDI Clock Start: On', { midiClockStart: true }],
    [61, 0, 'ROUTING MODE = Grid', { routing: 'Grid' }],
    [61, 1, 'ROUTING MODE = Input 1', { routing: 'Input 1' }],
    [61, 4, 'ROUTING MODE = Return 2', { routing: 'Return 2' }],
    [61, 6, 'ROUTING MODE = Returns 1/2', { routing: 'Returns 1/2' }],
    [61, 10, 'ROUTING MODE = Output 4', { routing: 'Output 4' }],
    [61, 12, 'ROUTING MODE = Outputs 3/4', { routing: 'Outputs 3/4' }],
    [61, 13, 'ROUTING MODE = Multiple Outputs', { routing: 'Multiple Outputs' }],
  ])('CC#%i = %i — %s', (cc, value, text, fields) => {
    const qc = new TestDevice();
    expect(qc.cc(cc, value)).toEqual({ effect: 'applied', text: `Looper X: ${text}` });
    expect(qc.state.looper).toMatchObject(fields);
  });

  it.each([
    [57, 2, 1],
    [58, 10, 9],
    [59, 2, 1],
    [61, 14, 13],
  ])('CC#%i = %i вне диапазона 0–%i — без действия', (cc, value, max) => {
    const qc = new TestDevice();
    const before = qc.state;
    expect(qc.cc(cc, value)).toEqual({
      effect: 'ignored',
      text: `CC#${cc} = ${value}: значение вне диапазона 0–${max} — без действия`,
    });
    expect(qc.state).toBe(before);
  });

  it('после загрузки пресета параметры блока неизвестны, петля продолжает звучать', () => {
    const qc = new TestDevice();
    recordLoop(qc);
    qc.cc(57, 1);
    qc.cc(58, 4);
    qc.cc(59, 1);
    qc.cc(61, 1);
    qc.pc(3);
    expect(qc.state.looper).toMatchObject({
      transport: 'playing',
      length: 2000,
      duplicateMode: null,
      quantize: null,
      midiClockStart: null,
      routing: null,
    });
  });
});

describe('Looper X: MIDI CLOCK START и MIDI Start (FA)', () => {
  it('при MIDI CLOCK START = On RECORD, PLAY и DUPLICATE взводятся и стартуют по MIDI Start', () => {
    const qc = new TestDevice();
    qc.cc(59, 1);
    expect(qc.cc(53, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: RECORD — Armed, запись начнётся по MIDI Start (MIDI CLOCK START = On)',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'empty', armed: 'record' });
    expect(qc.cc(53, 127)).toEqual({
      effect: 'ignored',
      text: 'Looper X: RECORD без действия — взведённое действие ждёт MIDI Start',
    });
    expect(qc.send([0xfa])).toEqual({
      effect: 'applied',
      text: 'Start: Looper X — запись по MIDI Start (MIDI CLOCK START = On)',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', armed: null, recordStart: qc.time });
    qc.cc(53, 127, 2000);
    qc.cc(54, 127);
    expect(qc.cc(54, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: PLAY — Armed, воспроизведение начнётся по MIDI Start (MIDI CLOCK START = On)',
    });
    expect(qc.cc(54, 127).text).toBe('Looper X: PLAY/STOP без действия — взведённое действие ждёт MIDI Start');
    expect(qc.send([0xfa]).text).toBe('Start: Looper X — воспроизведение по MIDI Start (MIDI CLOCK START = On)');
    expect(qc.state.looper).toMatchObject({ transport: 'playing', loopStart: qc.time });
    expect(qc.cc(49, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: DUPLICATE — Armed, начнётся по MIDI Start (MIDI CLOCK START = On)',
    });
    expect(qc.send([0xfa]).text).toBe('Start: Looper X — DUPLICATE по MIDI Start (MIDI CLOCK START = On)');
    expect(qc.state.looper).toMatchObject({ transport: 'duplicating', length: 4000, armed: null });
  });
});

describe('Looper X: QUANTIZE (CC#58) — запись по тактам', () => {
  /** Прибор с темпом 120 BPM по Tap Tempo (такт из 4 долей — 2000 мс) и QUANTIZE = 4 доли. */
  function quantized(): { qc: TestDevice; downbeat: number } {
    const qc = new TestDevice();
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    const downbeat = qc.time;
    qc.cc(58, 4);
    return { qc, downbeat };
  }

  it('RECORD взводится до первой доли следующего такта, запись начинается в этот момент', () => {
    const { qc, downbeat } = quantized();
    expect(qc.cc(53, 127, 600)).toEqual({
      effect: 'applied',
      text: 'Looper X: RECORD — Armed, запись начнётся с первой доли следующего такта (QUANTIZE = 4 доли)',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'empty', armed: 'record', armedUntil: downbeat + 2000 });
    expect(qc.cc(53, 127)).toEqual({
      effect: 'ignored',
      text: 'Looper X: RECORD без действия — запись ждёт первой доли такта (QUANTIZE)',
    });
    expect(qc.send([0xfa]).effect).toBe('ignored');
    expect(qc.state.looper.armed).toBe('record');
    qc.send([0x91, 60, 1], 1200);
    expect(qc.state.looper).toMatchObject({
      transport: 'recording',
      armed: null,
      armedUntil: null,
      recordStart: downbeat + 2000,
    });
  });

  it('конец записи доводится до конца такта, затем петля играет', () => {
    const { qc, downbeat } = quantized();
    qc.cc(53, 127, 1500);
    const start = downbeat + 2000;
    expect(qc.state.looper.armedUntil).toBe(start);
    qc.time = start + 2500 - 100;
    expect(qc.cc(53, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: запись завершится в конце такта (QUANTIZE = 4 доли), затем воспроизведение',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', recordStart: start, recordEndsAt: start + 4000 });
    expect(qc.cc(53, 127).text).toBe('Looper X: запись уже завершается в конце такта (QUANTIZE) — без действия');
    qc.send([0x91, 60, 1], 1500);
    expect(qc.state.looper).toMatchObject({
      transport: 'playing',
      length: 4000,
      loopStart: start + 4000,
      recordEndsAt: null,
      undo: 'UNDO',
    });
  });

  it('нажатие на первой доле такта начинает запись сразу, на границе такта — сразу завершает', () => {
    const { qc, downbeat } = quantized();
    qc.time = downbeat + 4000 - 100;
    expect(qc.cc(53, 127)).toEqual({
      effect: 'applied',
      text: 'Looper X: RECORD — запись новой петли с первой доли такта (QUANTIZE = 4 доли)',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', recordStart: downbeat + 4000 });
    expect(qc.cc(53, 127, 2000)).toEqual({ effect: 'applied', text: 'Looper X: запись завершена, воспроизведение' });
    expect(qc.state.looper).toMatchObject({ transport: 'playing', length: 2000 });
  });

  it('при неизвестном темпе запись идёт с неизвестного момента, длина петли неизвестна', () => {
    const qc = new TestDevice();
    qc.cc(58, 2);
    expect(qc.cc(53, 127)).toEqual({
      effect: 'applied',
      text:
        'Looper X: RECORD — запись новой петли с первой доли такта (QUANTIZE = 2 доли), ' +
        'момент начала неизвестен: темп неизвестен',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'recording', recordStart: null });
    expect(qc.cc(53, 127, 3000).text).toBe('Looper X: запись завершена, воспроизведение');
    expect(qc.state.looper).toMatchObject({ transport: 'playing', length: null });
  });

  it('при синхронизации к MIDI Clock такты отсчитываются от первой доли после MIDI Start', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.ticks(30, 120);
    qc.send([0xfa], 5);
    qc.ticks(1, 120);
    const downbeat = qc.time;
    expect(qc.state.tempo.downbeatTime).toBe(downbeat);
    qc.ticks(10, 120);
    qc.cc(58, 1, 5);
    qc.cc(53, 127, 5);
    const beat = 60000 / qc.state.tempo.bpm!;
    expect(qc.state.tempo.source).toBe('clock');
    expect(qc.state.looper.armed).toBe('record');
    expect(qc.state.looper.armedUntil).toBeCloseTo(downbeat + beat, 6);
  });
});

describe('Looper X: футсвитчи A–H (CC#35–42) в Perform', () => {
  it('выполняют назначенные действия Looper X', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    qc.cc(48, 0);
    expect(qc.cc(39, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч E (Looper X, RECORD): RECORD — запись новой петли',
    });
    expect(qc.cc(39, 127, 2000)).toEqual({
      effect: 'applied',
      text: 'Футсвитч E (Looper X, RECORD): запись завершена, воспроизведение',
    });
    expect(qc.cc(36, 127).text).toBe(
      'Футсвитч B (Looper X, ONE SHOT): ONE SHOT вкл — петля остановится после конца записи',
    );
    expect(qc.cc(40, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч F (Looper X, PLAY): STOP — петля остановлена',
    });
    expect(qc.state.scene).toBeNull();
  });

  it('выполняют переназначенные действия, в том числе RE-LOOP', () => {
    const qc = new TestDevice({ looperActionA: 'RECORD', looperActionC: 'RE-LOOP' });
    qc.cc(48, 0);
    expect(qc.state.footswitches[0].label).toBe('RECORD');
    expect(qc.cc(35, 127).text).toBe('Футсвитч A (Looper X, RECORD): RECORD — запись новой петли');
    qc.cc(35, 127, 2000);
    expect(qc.cc(37, 127)).toEqual({
      effect: 'ignored',
      text: 'Футсвитч C (Looper X, RE-LOOP): RE-LOOP без действия — доступен только при активном DUPLICATE',
    });
    qc.cc(49, 127);
    expect(qc.cc(37, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч C (Looper X, RE-LOOP): RE-LOOP — петля укорочена, DUPLICATE выкл',
    });
    expect(qc.state.looper).toMatchObject({ transport: 'playing', length: null, loopStart: null });
  });

  it('в режиме Parameters действия не выполняются', () => {
    const qc = new TestDevice();
    qc.cc(48, 0);
    qc.cc(60, 1);
    expect(qc.cc(39, 127)).toEqual({
      effect: 'ignored',
      text:
        'Футсвитч E: Looper X в режиме Parameters — футсвитч работает как энкодер, действие не выполняется ' +
        '(по форуму)',
    });
    expect(qc.state.looper.transport).toBe('empty');
  });
});
