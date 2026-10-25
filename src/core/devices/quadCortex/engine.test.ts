import { describe, expect, it } from 'vitest';
import { resolveSettings } from '../types.ts';
import { LETTERS, quadCortexAt, quadCortexEngine, readQuadCortexSettings } from './engine.ts';
import { TestDevice } from './testDevice.ts';

const NOT_IMPLEMENTED = 'не входит в MIDI-реализацию CorOS 4.1.1';
const STOMP_TEXT = 'переключён bypass назначенных на него блоков';

describe('Quad Cortex: прибор и настройки', () => {
  it('описывает прибор и прошивку CorOS 4.1.1', () => {
    expect(quadCortexEngine).toMatchObject({
      id: 'qc',
      name: 'Quad Cortex',
      vendor: 'Neural DSP',
      model: 'Quad Cortex',
      firmware: 'CorOS 4.1.1',
    });
  });

  it('задаёт настройки с русскими подписями и значениями по умолчанию из документа', () => {
    const defs = quadCortexEngine.settings;
    for (const def of defs) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.hint?.length ?? 0).toBeGreaterThan(0);
    }
    expect(new Set(defs.map((d) => d.key)).size).toBe(defs.length);
    expect(resolveSettings(defs, {})).toMatchObject({
      ignoreDuplicatePc: false,
      midiClockIn: false,
      midiClockOut: 'OFF',
      modeSlot1: 'PRESET',
      modeSlot2: 'SCENE',
      modeSlot3: 'STOMP',
      startModeSlot: '2',
      startSetlist: 'unknown',
      sceneBypassBehavior: 'overwrite',
      tempoMode: 'GLOBAL',
      tempoLed: true,
      tempoWindowSeconds: 5,
      dimmedLeds: true,
      liveTuner: true,
      tunerMute: true,
      looperRecordMode: 'Toggle',
      looperOverdubMode: 'Toggle',
      looperPunchMode: 'Toggle',
      looperActionA: 'DUPLICATE',
      looperActionB: 'ONE SHOT',
      looperActionC: 'HALF SPEED',
      looperActionD: 'PUNCH IN',
      looperActionE: 'RECORD',
      looperActionF: 'PLAY',
      looperActionG: 'REVERSE',
      looperActionH: 'UNDO',
    });
  });

  it('после включения неизвестны пресет, сцена, режим, темп и педали; экраны закрыты, петли нет', () => {
    const { state } = new TestDevice({ startModeSlot: 'unknown' });
    expect(state.preset).toEqual({
      setlist: null,
      setlistName: null,
      index: null,
      bank: null,
      slot: null,
      label: null,
      standardLabel: null,
      banksOfFour: false,
      name: null,
    });
    expect(state.bankSelect).toEqual({ msb: 0, pendingMsb: null, pendingLsb: null });
    expect(state.scene).toBeNull();
    expect(state.mode).toBeNull();
    expect(state.screens).toEqual([]);
    expect(state.expression).toEqual([null, null]);
    expect(state.tempo).toMatchObject(
      { bpm: null, source: null, beatTime: null, led: 'green', clockSynced: false, taps: 0 },
    );
    expect(state.looper).toMatchObject({ transport: 'empty', armed: null, undo: null, quantize: null, routing: null });
    expect(state.footswitches.map((f) => f.letter)).toEqual([...LETTERS]);
    expect(state.footswitches.every((f) => f.role === null && f.label === null && f.active === null)).toBe(true);
  });

  it('по умолчанию после включения режим — SCENE из Mode Slot 2', () => {
    const { state } = new TestDevice();
    expect(state.mode).toEqual({ name: 'SCENE', rows: ['SCENE', 'SCENE'], slot: 2 });
    expect(state.footswitches.map((f) => f.role)).toEqual(Array(8).fill('scene'));
    expect(state.footswitches.every((f) => f.active === null)).toBe(true);
  });

  it('при режиме «неизвестен» после включения режим неизвестен; вариант есть в списке', () => {
    const def = quadCortexEngine.settings.find((d) => d.key === 'startModeSlot');
    expect(def?.type === 'select' ? def.options.map((o) => o.value) : []).toEqual(['unknown', '1', '2', '3']);
    expect(new TestDevice({ startModeSlot: 'unknown' }).state.mode).toBeNull();
  });

  it('берёт сетлист и режим после включения из настроек', () => {
    const { state } = new TestDevice({ startSetlist: '1', startModeSlot: '2' });
    expect(state.preset).toMatchObject({ setlist: 1, setlistName: 'My Presets', index: null });
    expect(state.mode).toEqual({ name: 'SCENE', rows: ['SCENE', 'SCENE'], slot: 2 });
    expect(state.footswitches.map((f) => f.role)).toEqual(Array(8).fill('scene'));
  });

  it('возвращает тот же объект состояния, если сообщение ничего не изменило', () => {
    const qc = new TestDevice();
    const before = qc.state;
    qc.send([0xf8]);
    qc.cc(7, 100);
    qc.send([0x91, 60, 100]);
    qc.cc(43, 8);
    expect(qc.state).toBe(before);
  });
});

describe('Program Change и Bank Select (CC#0, CC#32)', () => {
  it.each([
    [0, 9, 67, '9D', 9],
    [1, 5, 0, '17A', 5],
    [1, 5, 1, '17B', 5],
    [1, 3, 23, '19H', 3],
  ])('CC#0 = %i, CC#32 = %i, PC %i → пресет %s в сетлисте %i', (msb, lsb, program, label, setlist) => {
    const qc = new TestDevice();
    expect(qc.cc(0, msb).effect).toBe('pending');
    expect(qc.cc(32, lsb).effect).toBe('pending');
    expect(qc.pc(program)).toEqual({ effect: 'applied', text: `Пресет ${label} загружен (сетлист ${setlist})` });
    expect(qc.state.preset).toMatchObject({
      setlist,
      setlistName: null,
      index: msb * 128 + program,
      label,
      standardLabel: label,
    });
    expect(qc.state.bankSelect).toEqual({ msb, pendingMsb: null, pendingLsb: null });
  });

  it('CC#0 и CC#32 без PC ничего не загружают и ждут Program Change', () => {
    const qc = new TestDevice({ startSetlist: '1' });
    qc.pc(10);
    const preset = qc.state.preset;
    expect(qc.cc(0, 1)).toEqual({
      effect: 'pending',
      text: 'Bank Select MSB = 1: группа пресетов 17A–32H — применится при следующем Program Change',
    });
    expect(qc.cc(32, 0)).toEqual({
      effect: 'pending',
      text: 'Bank Select LSB = 0: сетлист 0 «Factory Presets» — применится при следующем Program Change',
    });
    expect(qc.state.preset).toBe(preset);
    expect(qc.state.bankSelect).toEqual({ msb: 1, pendingMsb: 1, pendingLsb: 0 });
    expect(qc.cc(32, 1).text).toBe(
      'Bank Select LSB = 1: сетлист 1 «My Presets» — применится при следующем Program Change',
    );
    expect(qc.cc(0, 0).text).toBe(
      'Bank Select MSB = 0: группа пресетов 1A–16H — применится при следующем Program Change',
    );
  });

  it('CC#0 больше 1 и CC#32 больше 12 игнорируются', () => {
    const qc = new TestDevice();
    const before = qc.state;
    expect(qc.cc(0, 2)).toEqual({
      effect: 'ignored',
      text: 'Bank Select MSB = 2: значение вне диапазона 0–1 — без действия',
    });
    expect(qc.cc(32, 13)).toEqual({
      effect: 'ignored',
      text: 'Bank Select LSB = 13: значение вне диапазона 0–12 — без действия',
    });
    expect(qc.state).toBe(before);
  });

  it('PC без Bank Select относится к последнему CC#0 и к активному сетлисту', () => {
    const qc = new TestDevice();
    qc.cc(0, 1);
    qc.cc(32, 5);
    qc.pc(0);
    expect(qc.pc(5)).toEqual({ effect: 'applied', text: 'Пресет 17F загружен (сетлист 5)' });
    expect(qc.state.preset).toMatchObject({ setlist: 5, index: 133 });
    qc.cc(32, 7);
    expect(qc.state.preset.setlist).toBe(5);
    expect(qc.pc(0).text).toBe('Пресет 17A загружен (сетлист 7)');
  });

  it('PC 7 без Bank Select после включения — пресет 1H в неизвестном сетлисте', () => {
    const qc = new TestDevice();
    expect(qc.pc(7)).toEqual({ effect: 'applied', text: 'Пресет 1H загружен (сетлист ?)' });
    expect(qc.state.preset).toMatchObject({ setlist: null, index: 7, bank: 1, slot: 'H', label: '1H' });
  });

  it('PC в сетлисте с постоянным именем показывает имя сетлиста', () => {
    const qc = new TestDevice({ startSetlist: '1' });
    expect(qc.pc(10)).toEqual({ effect: 'applied', text: 'Пресет 2C загружен (сетлист 1 «My Presets»)' });
    expect(qc.state.preset).toMatchObject({ setlist: 1, setlistName: 'My Presets', label: '2C', name: null });
  });

  it('при Ignore Duplicate PC = Off повторный PC перезагружает пресет: сцена по умолчанию неизвестна', () => {
    const qc = new TestDevice({ startSetlist: '1' });
    qc.pc(10);
    qc.cc(43, 2);
    expect(qc.state.scene).toBe('C');
    expect(qc.pc(10)).toEqual({ effect: 'applied', text: 'Пресет 2C перезагружен (сетлист 1 «My Presets»)' });
    expect(qc.state.scene).toBeNull();
  });

  it('при Ignore Duplicate PC = On повтор текущего пресета и CC#0, CC#32 вместе с ним игнорируются', () => {
    const qc = new TestDevice({ startSetlist: '1', ignoreDuplicatePc: true });
    qc.pc(10);
    qc.cc(43, 2);
    const before = qc.state;
    expect(qc.pc(10)).toEqual({
      effect: 'ignored',
      text: 'Пресет 2C уже загружен — повтор игнорируется (Ignore Duplicate PC = On)',
    });
    expect(qc.state).toBe(before);
    qc.cc(0, 0);
    qc.cc(32, 1);
    expect(qc.pc(10).effect).toBe('ignored');
    expect(qc.state.bankSelect).toEqual({ msb: 0, pendingMsb: null, pendingLsb: null });
    expect(qc.state.scene).toBe('C');
    qc.cc(32, 2);
    expect(qc.pc(10)).toEqual({ effect: 'applied', text: 'Пресет 2C загружен (сетлист 2)' });
  });

  it('Ignore Duplicate PC сравнивает PC с активным пресетом, а не с последним полученным PC', () => {
    const qc = new TestDevice({ startSetlist: '1', ignoreDuplicatePc: true, startModeSlot: '1' });
    qc.pc(10);
    qc.cc(36, 127);
    expect(qc.state.preset.index).toBe(9);
    expect(qc.pc(10)).toEqual({ effect: 'applied', text: 'Пресет 2C загружен (сетлист 1 «My Presets»)' });
  });

  it('PC загружает пресет при открытых Tuner и Gig View и не закрывает их', () => {
    const qc = new TestDevice();
    qc.cc(45, 127);
    qc.cc(46, 127);
    expect(qc.pc(3).effect).toBe('applied');
    expect(qc.state.screens).toEqual(['tuner', 'gigView']);
    expect(qc.state.preset.label).toBe('1D');
  });

  it('при TEMPO MODE = PRESET темп после загрузки пресета неизвестен, при GLOBAL сохраняется', () => {
    const preset = new TestDevice({ tempoMode: 'PRESET', startSetlist: '1' });
    preset.cc(44, 127);
    preset.cc(44, 127, 500);
    expect(preset.pc(10, 4000)).toEqual({
      effect: 'applied',
      text: 'Пресет 2C загружен (сетлист 1 «My Presets»), темп пресета неизвестен (TEMPO MODE = PRESET)',
    });
    expect(preset.state.tempo).toMatchObject({ bpm: null, source: null, beatTime: null });
    const global = new TestDevice();
    global.cc(44, 127);
    global.cc(44, 127, 500);
    global.pc(10, 4000);
    expect(global.state.tempo).toMatchObject({ bpm: 120, source: 'tap' });
  });

  it('PC сохраняет режим футсвитчей и положения педалей, сбрасывает переключения STOMP', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.cc(1, 64);
    qc.cc(35, 127);
    expect(qc.state.footswitches[0].toggled).toBe(true);
    qc.pc(1);
    expect(qc.state.mode?.name).toBe('STOMP');
    expect(qc.state.expression).toEqual([64, null]);
    expect(qc.state.footswitches[0].toggled).toBe(false);
  });
});

describe('HYBRID с PRESET: банки по 4 пресета', () => {
  it('обозначает пресеты банками по 4 с буквами A–D и показывает обычное обозначение в журнале', () => {
    const qc = new TestDevice({
      modeSlot1: 'PRESET+STOMP',
      modeSlot2: 'SCENE',
      modeSlot3: 'EMPTY',
      startModeSlot: '1',
    });
    expect(qc.state.mode).toEqual({ name: 'HYBRID', rows: ['PRESET', 'STOMP'], slot: 1 });
    qc.cc(32, 9);
    expect(qc.pc(67)).toEqual({ effect: 'applied', text: 'Пресет 9D (в HYBRID — 17D) загружен (сетлист 9)' });
    expect(qc.state.preset).toMatchObject(
      { index: 67, bank: 17, slot: 'D', label: '17D', standardLabel: '9D', banksOfFour: true },
    );
    expect(qc.state.footswitches.map((f) => f.label)).toEqual(['17A', '17B', '17C', '17D', null, null, null, null]);
    expect(qc.state.footswitches.map((f) => f.active)).toEqual([false, false, false, true, null, null, null, null]);
    expect(qc.state.footswitches.map((f) => f.role)).toEqual([...Array(4).fill('preset'), ...Array(4).fill('stomp')]);
    expect(qc.cc(0, 1).text).toBe(
      'Bank Select MSB = 1: группа пресетов 17A–32H (в HYBRID — 33A–64D) — применится при следующем Program Change',
    );
  });

  it('футсвитч ряда PRESET загружает пресет банка из 4, футсвитч ряда STOMP переключает блоки', () => {
    const qc = new TestDevice({ modeSlot1: 'PRESET+STOMP', modeSlot3: 'EMPTY', startModeSlot: '1', startSetlist: '9' });
    qc.pc(67);
    expect(qc.cc(37, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч C (PRESET): пресет 9C (в HYBRID — 17C) загружен (сетлист 9)',
    });
    expect(qc.state.preset.index).toBe(66);
    expect(qc.cc(39, 127).text).toBe(`Футсвитч E (STOMP): ${STOMP_TEXT}`);
    expect(qc.state.footswitches[4].toggled).toBe(true);
  });

  it('ряд PRESET внизу (E–H) вызывает пресеты банка из 4 с буквами A–D', () => {
    const qc = new TestDevice({
      modeSlot1: 'SCENE+PRESET',
      modeSlot2: 'STOMP',
      modeSlot3: 'EMPTY',
      startModeSlot: '1',
      startSetlist: '1',
    });
    qc.pc(5);
    expect(qc.state.preset.label).toBe('2B');
    expect(qc.cc(41, 127).text).toBe(
      'Футсвитч G (PRESET): пресет 1G (в HYBRID — 2C) загружен (сетлист 1 «My Presets»)',
    );
    expect(qc.state.preset.index).toBe(6);
    expect(qc.state.footswitches.slice(4).map((f) => f.label)).toEqual(['2A', '2B', '2C', '2D']);
    expect(qc.cc(36, 127).text).toBe('Футсвитч B (SCENE): сцена B');
  });
});

describe('EXP 1 и EXP 2 (CC#1, CC#2)', () => {
  it('задают положение педали: 0 — Heel, 127 — Toe', () => {
    const qc = new TestDevice();
    expect(qc.cc(1, 64)).toEqual({ effect: 'applied', text: 'EXP 1: положение 50 %' });
    expect(qc.state.expression).toEqual([64, null]);
    expect(qc.cc(2, 0)).toEqual({ effect: 'applied', text: 'EXP 2: положение Heel (0 %)' });
    expect(qc.cc(2, 127)).toEqual({ effect: 'applied', text: 'EXP 2: положение Toe (100 %)' });
    expect(qc.state.expression).toEqual([64, 127]);
    const before = qc.state;
    expect(qc.cc(2, 127).effect).toBe('applied');
    expect(qc.state).toBe(before);
  });
});

describe('Футсвитчи A–H (CC#35–42)', () => {
  it('PRESET: пресет футсвитча в банке загруженного; повтор перезагружает даже при Ignore Duplicate PC', () => {
    const qc = new TestDevice({ startModeSlot: '1', startSetlist: '1', ignoreDuplicatePc: true });
    qc.pc(10);
    expect(qc.state.footswitches.map((f) => f.label)).toEqual(['2A', '2B', '2C', '2D', '2E', '2F', '2G', '2H']);
    expect(qc.state.footswitches.map((f) => f.active)).toEqual([false, false, true, false, false, false, false, false]);
    qc.cc(43, 4);
    expect(qc.cc(35, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч A (PRESET): пресет 2A загружен (сетлист 1 «My Presets»)',
    });
    expect(qc.state.preset).toMatchObject({ index: 8, label: '2A' });
    expect(qc.state.scene).toBeNull();
    expect(qc.cc(35, 127, 2000).text).toBe('Футсвитч A (PRESET): пресет 2A перезагружен (сетлист 1 «My Presets»)');
    expect(qc.cc(42, 127).text).toBe('Футсвитч H (PRESET): пресет 2H загружен (сетлист 1 «My Presets»)');
  });

  it('PRESET при неизвестном пресете: банк неизвестен', () => {
    const qc = new TestDevice({ startModeSlot: '1' });
    expect(qc.cc(37, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч C (PRESET): загружен пресет слота C текущего банка — банк неизвестен',
    });
    expect(qc.state.preset.index).toBeNull();
    expect(qc.state.footswitches[2]).toMatchObject({ role: 'preset', label: null, active: null });
  });

  it('SCENE: вызывают сцену футсвитча; повтор текущей сцены — без действия', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    expect(qc.cc(37, 127)).toEqual({ effect: 'applied', text: 'Футсвитч C (SCENE): сцена C' });
    expect(qc.state.scene).toBe('C');
    expect(qc.state.footswitches[2]).toMatchObject({ role: 'scene', label: 'C', active: true });
    expect(qc.state.footswitches[0]).toMatchObject({ role: 'scene', label: 'A', active: false });
    expect(qc.cc(37, 127, 2000)).toEqual({ effect: 'ignored', text: 'Футсвитч C (SCENE): сцена C уже активна' });
  });

  it('STOMP: переключают назначенные блоки; переключения сохраняются в сцене при Always overwrite bypass state', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.pc(0);
    qc.cc(43, 0);
    expect(qc.cc(36, 127)).toEqual({ effect: 'applied', text: `Футсвитч B (STOMP): ${STOMP_TEXT}` });
    expect(qc.state.footswitches[1]).toMatchObject({ role: 'stomp', label: null, active: null, toggled: true });
    qc.cc(43, 1);
    expect(qc.state.footswitches[1].toggled).toBe(false);
    qc.cc(43, 0);
    expect(qc.state.footswitches[1].toggled).toBe(true);
    qc.cc(36, 127, 2000);
    expect(qc.state.footswitches[1].toggled).toBe(false);
  });

  it('STOMP: при Footswitch Presses are not saved и No changes are saved переключения теряются при смене сцены', () => {
    for (const behavior of ['footswitch', 'none']) {
      const qc = new TestDevice({ startModeSlot: '3', sceneBypassBehavior: behavior });
      qc.cc(43, 0);
      qc.cc(36, 127);
      qc.cc(43, 1);
      qc.cc(43, 0);
      expect(qc.state.footswitches[1].toggled).toBe(false);
    }
  });

  it('HYBRID: ряды A–D и E–H действуют по своим режимам', () => {
    const qc = new TestDevice({
      modeSlot1: 'SCENE+STOMP',
      modeSlot2: 'PRESET',
      modeSlot3: 'EMPTY',
      startModeSlot: '1',
    });
    expect(qc.state.mode).toEqual({ name: 'HYBRID', rows: ['SCENE', 'STOMP'], slot: 1 });
    expect(qc.cc(36, 127).text).toBe('Футсвитч B (SCENE): сцена B');
    expect(qc.cc(41, 127).text).toBe(`Футсвитч G (STOMP): ${STOMP_TEXT}`);
    expect(qc.state.footswitches.map((f) => f.role)).toEqual([...Array(4).fill('scene'), ...Array(4).fill('stomp')]);
    expect(qc.state.footswitches[6].toggled).toBe(true);
  });

  it('при неизвестном режиме пресет и сцена после нажатия неизвестны', () => {
    const qc = new TestDevice({ startSetlist: '1', startModeSlot: 'unknown' });
    qc.pc(10);
    qc.cc(43, 2);
    expect(qc.cc(35, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч A: режим футсвитчей неизвестен — загружен пресет, вызвана сцена или переключены блоки',
    });
    expect(qc.state.preset).toMatchObject({ setlist: 1, index: null, label: null });
    expect(qc.state.scene).toBeNull();
  });

  it('при открытом Tuner не выполняют действие; под Gig View вызов сцены закрывает Tuner', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    qc.cc(45, 127);
    expect(qc.cc(35, 127)).toEqual({
      effect: 'ignored',
      text: 'Футсвитч A: открыт Tuner — действие футсвитча не выполняется (не документировано)',
    });
    expect(qc.state.scene).toBeNull();
    expect(qc.state.footswitches[0]).toMatchObject({ role: 'tuner', label: null, active: null });
    qc.cc(46, 127);
    expect(qc.cc(35, 127, 2000)).toEqual({ effect: 'applied', text: 'Футсвитч A (SCENE): сцена A (Tuner закрыт)' });
    expect(qc.state.screens).toEqual(['gigView']);
    expect(qc.state.scene).toBe('A');
  });

  it('в окне Tempo при TEMPO MODE = GLOBAL закрывают окно без своего действия, при PRESET — без действия', () => {
    const global = new TestDevice({ startModeSlot: '2' });
    global.cc(44, 127);
    global.cc(44, 127, 500);
    expect(global.state.screens).toEqual(['tempo']);
    expect(global.state.footswitches[0].role).toBe('tempo');
    expect(global.cc(35, 127)).toEqual({
      effect: 'applied',
      text: 'Футсвитч A: окно Tempo закрыто без действия футсвитча (TEMPO MODE = GLOBAL, по форуму)',
    });
    expect(global.state.screens).toEqual([]);
    expect(global.state.scene).toBeNull();
    const preset = new TestDevice({ startModeSlot: '2', tempoMode: 'PRESET' });
    preset.cc(44, 127);
    preset.cc(44, 127, 500);
    expect(preset.cc(35, 127)).toEqual({
      effect: 'ignored',
      text: 'Футсвитч A: в окне Tempo не действует (TEMPO MODE = PRESET, по форуму)',
    });
    expect(preset.state.screens).toEqual(['tempo']);
  });

  it('любое значение — нажатие; 0–63 вскоре после 64–127 помечается как возможное отпускание кнопки', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.cc(35, 127);
    expect(qc.cc(35, 0, 150)).toEqual({
      effect: 'applied',
      text: `Футсвитч A (STOMP): ${STOMP_TEXT} (возможно, отпускание кнопки контроллера)`,
    });
    expect(qc.state.footswitches[0].toggled).toBe(false);
    qc.cc(35, 127, 1000);
    expect(qc.cc(35, 0, 1500).text).toBe(`Футсвитч A (STOMP): ${STOMP_TEXT}`);
    expect(qc.cc(36, 0).text).toBe(`Футсвитч B (STOMP): ${STOMP_TEXT}`);
  });
});

describe('Сцены (CC#43)', () => {
  it.each(LETTERS.map((letter, value) => [value, letter] as const))('CC#43 = %i — сцена %s', (value, letter) => {
    const qc = new TestDevice();
    expect(qc.cc(43, value)).toEqual({ effect: 'applied', text: `Сцена ${letter}` });
    expect(qc.state.scene).toBe(letter);
  });

  it('повтор текущей сцены и значения больше 7 — без действия', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.cc(43, 2);
    const before = qc.state;
    expect(qc.cc(43, 2)).toEqual({ effect: 'ignored', text: 'Сцена C уже активна' });
    expect(qc.cc(43, 9)).toEqual({ effect: 'ignored', text: 'CC#43 = 9: значение вне диапазона 0–7 — без действия' });
    expect(qc.state).toBe(before);
    expect(qc.cc(43, 7).text).toBe('Сцена H');
  });

  it('работают в режиме STOMP и при открытом Looper X; темп не меняют', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    qc.cc(48, 0, 6000);
    expect(qc.cc(43, 5).text).toBe('Сцена F');
    expect(qc.state).toMatchObject({ scene: 'F', screens: ['looper'] });
    expect(qc.state.tempo.bpm).toBe(120);
  });

  it('смена сцены закрывает Tuner, остальные экраны остаются', () => {
    const qc = new TestDevice();
    qc.cc(46, 127);
    qc.cc(45, 127);
    expect(qc.cc(43, 1)).toEqual({ effect: 'applied', text: 'Сцена B (Tuner закрыт)' });
    expect(qc.state).toMatchObject({ scene: 'B', screens: ['gigView'] });
    expect(qc.cc(43, 2)).toEqual({ effect: 'applied', text: 'Сцена C' });
  });

  it('повтор текущей сцены при открытом Tuner закрывает Tuner, сцену не меняет', () => {
    const qc = new TestDevice({ startModeSlot: '3' });
    qc.cc(43, 2);
    qc.cc(37, 127);
    qc.cc(45, 127);
    const flips = qc.state.stompFlips;
    expect(qc.cc(43, 2)).toEqual({ effect: 'applied', text: 'Сцена C уже активна (Tuner закрыт)' });
    expect(qc.state).toMatchObject({ scene: 'C', screens: [] });
    expect(qc.state.stompFlips).toBe(flips);
    expect(qc.cc(43, 2)).toEqual({ effect: 'ignored', text: 'Сцена C уже активна' });
  });

  it('футсвитч SCENE при Tuner сверху сцену не меняет и Tuner не закрывает', () => {
    const qc = new TestDevice();
    qc.cc(45, 127);
    expect(qc.cc(36, 127).effect).toBe('ignored');
    expect(qc.state).toMatchObject({ scene: null, screens: ['tuner'] });
  });
});

describe('Сцены и темп при TEMPO MODE = PRESET', () => {
  it('смена сцены делает темп неизвестным: темп может быть назначен на сцену', () => {
    const qc = new TestDevice({ tempoMode: 'PRESET', startModeSlot: '2' });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.cc(43, 1, 6000)).toEqual({
      effect: 'applied',
      text: 'Сцена B; темп неизвестен — при TEMPO MODE = PRESET сцена может задавать свой темп',
    });
    expect(qc.state.tempo).toMatchObject({ bpm: null, source: null, beatTime: null, downbeatTime: null });
    expect(qc.cc(43, 2)).toEqual({ effect: 'applied', text: 'Сцена C' });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.cc(36, 127, 6000).text).toBe(
      'Футсвитч B (SCENE): сцена B; темп неизвестен — при TEMPO MODE = PRESET сцена может задавать свой темп',
    );
  });

  it('повтор текущей сцены темп не меняет', () => {
    const qc = new TestDevice({ tempoMode: 'PRESET' });
    qc.cc(43, 0);
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.cc(43, 0, 6000)).toEqual({ effect: 'ignored', text: 'Сцена A уже активна' });
    expect(qc.state.tempo.bpm).toBe(120);
  });
});

describe('Tap Tempo (CC#44)', () => {
  it('первый удар запоминается, следующие задают темп по интервалу и открывают окно Tempo', () => {
    const qc = new TestDevice();
    expect(qc.cc(44, 127)).toEqual({
      effect: 'pending',
      text: 'Tap Tempo: удар 1 — темп определится по следующему удару',
    });
    expect(qc.state.tempo).toMatchObject({ bpm: null, taps: 1, lastTapTime: qc.time });
    expect(qc.state.screens).toEqual([]);
    expect(qc.cc(44, 0, 500)).toEqual({ effect: 'applied', text: 'Tap Tempo: удар 2, темп 120.0 BPM' });
    expect(qc.state.tempo).toMatchObject({
      bpm: 120,
      source: 'tap',
      beatTime: qc.time,
      taps: 2,
      windowClosesAt: qc.time + 5000,
      led: 'green',
    });
    expect(qc.state.screens).toEqual(['tempo']);
    expect(qc.cc(44, 64, 400)).toEqual({ effect: 'applied', text: 'Tap Tempo: удар 3, темп 150.0 BPM' });
    expect(qc.cc(44, 64, 700).text).toBe('Tap Tempo: удар 4, темп 85.7 BPM');
  });

  it('удар позже 2 с начинает новую серию и не меняет темп', () => {
    const qc = new TestDevice();
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.cc(44, 127, 2500)).toEqual({
      effect: 'pending',
      text: 'Tap Tempo: удар 1 — темп определится по следующему удару',
    });
    expect(qc.state.tempo).toMatchObject({ bpm: 120, taps: 1 });
    expect(qc.cc(44, 127, 2000).text).toBe('Tap Tempo: удар 2, темп 30.0 BPM');
  });

  it('темп Tap Tempo не выше 240 BPM', () => {
    const qc = new TestDevice();
    qc.cc(44, 127);
    expect(qc.cc(44, 127, 200)).toEqual({
      effect: 'applied',
      text: 'Tap Tempo: удар 2, темп 240.0 BPM (предел Tap Tempo — 240 BPM, по форуму)',
    });
    expect(qc.state.tempo.bpm).toBe(240);
  });

  it('значение 0–63 не позже 400 мс после 64–127 — тоже удар, с пометкой о возможном отпускании', () => {
    const qc = new TestDevice();
    qc.cc(44, 127);
    expect(qc.cc(44, 0, 250)).toEqual({
      effect: 'applied',
      text: 'Tap Tempo: удар 2, темп 240.0 BPM (возможно, отпускание кнопки контроллера)',
    });
    const edge = new TestDevice();
    edge.cc(44, 127);
    expect(edge.cc(44, 0, 400).text).toBe(
      'Tap Tempo: удар 2, темп 150.0 BPM (возможно, отпускание кнопки контроллера)',
    );
    edge.cc(44, 127, 600);
    expect(edge.cc(44, 0, 401).text).toBe('Tap Tempo: удар 4, темп 149.6 BPM');
    expect(edge.cc(44, 0, 300).text).toBe('Tap Tempo: удар 5, темп 200.0 BPM');
  });

  it('удар чаще 240 BPM даёт 240 BPM с пометкой о пределе', () => {
    const qc = new TestDevice();
    qc.cc(44, 127);
    expect(qc.cc(44, 0, 200).text).toBe(
      'Tap Tempo: удар 2, темп 240.0 BPM (предел Tap Tempo — 240 BPM, по форуму) ' +
        '(возможно, отпускание кнопки контроллера)',
    );
    expect(qc.state.tempo.bpm).toBe(240);
  });

  it('окно Tempo закрывается само через заданное время после последнего удара; 0 — не закрывается', () => {
    const qc = new TestDevice();
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    qc.send([0x91, 60, 100], 4900);
    expect(qc.state.screens).toEqual(['tempo']);
    qc.send([0x91, 60, 100], 100);
    expect(qc.state.screens).toEqual([]);
    expect(qc.state.tempo.windowClosesAt).toBeNull();
    const open = new TestDevice({ tempoWindowSeconds: 0 });
    open.cc(44, 127);
    open.cc(44, 127, 500);
    open.send([0x91, 60, 100], 60000);
    expect(open.state.screens).toEqual(['tempo']);
    expect(open.state.tempo.windowClosesAt).toBeNull();
  });

  it('окно Tempo открывается поверх Tuner', () => {
    const qc = new TestDevice();
    qc.cc(45, 127);
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.state.screens).toEqual(['tuner', 'tempo']);
  });
});

describe('Tuner (CC#45) и Gig View (CC#46)', () => {
  it.each([
    [45, 'Tuner', 'tuner'],
    [46, 'Gig View', 'gigView'],
  ] as const)('CC#%i: 64–127 открывает %s, 0–63 закрывает', (cc, name, screen) => {
    const qc = new TestDevice();
    expect(qc.cc(cc, 64)).toEqual({ effect: 'applied', text: `${name} открыт` });
    expect(qc.state.screens).toEqual([screen]);
    expect(qc.cc(cc, 127)).toEqual({ effect: 'ignored', text: `${name} уже открыт` });
    expect(qc.cc(cc, 63)).toEqual({ effect: 'applied', text: `${name} закрыт` });
    expect(qc.state.screens).toEqual([]);
    expect(qc.cc(cc, 0)).toEqual({ effect: 'ignored', text: `${name} уже закрыт` });
  });

  it('открываемый экран оказывается сверху, закрытие нижнего оставляет верхний', () => {
    const qc = new TestDevice();
    qc.cc(45, 127);
    qc.cc(46, 127);
    expect(qc.state.screens).toEqual(['tuner', 'gigView']);
    expect(qc.cc(45, 127)).toEqual({ effect: 'applied', text: 'Tuner открыт' });
    expect(qc.state.screens).toEqual(['gigView', 'tuner']);
    qc.cc(46, 0);
    expect(qc.state.screens).toEqual(['tuner']);
  });
});

describe('Режимы (CC#47)', () => {
  it('значения 0–2 вызывают Mode Slot 1–3: по умолчанию PRESET, SCENE, STOMP', () => {
    const qc = new TestDevice();
    expect(qc.cc(47, 0)).toEqual({ effect: 'applied', text: 'Режим PRESET (Mode Slot 1)' });
    expect(qc.state.mode).toEqual({ name: 'PRESET', rows: ['PRESET', 'PRESET'], slot: 1 });
    expect(qc.cc(47, 1)).toEqual({ effect: 'applied', text: 'Режим SCENE (Mode Slot 2)' });
    expect(qc.cc(47, 2)).toEqual({ effect: 'applied', text: 'Режим STOMP (Mode Slot 3)' });
    expect(qc.state.footswitches.map((f) => f.role)).toEqual(Array(8).fill('stomp'));
  });

  it('повтор текущего режима и значения больше 2 — без действия', () => {
    const qc = new TestDevice();
    qc.cc(47, 2);
    const before = qc.state;
    expect(qc.cc(47, 2)).toEqual({ effect: 'ignored', text: 'Режим STOMP уже активен (Mode Slot 3)' });
    expect(qc.cc(47, 3)).toEqual({ effect: 'ignored', text: 'CC#47 = 3: значение вне диапазона 0–2 — без действия' });
    expect(qc.state).toBe(before);
  });

  it('значение адресует слот, а не режим: после перестановки CC#47 = 0 вызывает режим из Mode Slot 1', () => {
    const qc = new TestDevice({ modeSlot1: 'STOMP', modeSlot3: 'PRESET' });
    expect(qc.cc(47, 0).text).toBe('Режим STOMP (Mode Slot 1)');
    expect(qc.cc(47, 2).text).toBe('Режим PRESET (Mode Slot 3)');
  });

  it('пустой слот режим не меняет, слот HYBRID вызывает HYBRID', () => {
    const qc = new TestDevice({
      modeSlot1: 'SCENE+STOMP',
      modeSlot2: 'PRESET',
      modeSlot3: 'EMPTY',
      startModeSlot: 'unknown',
    });
    expect(qc.cc(47, 2)).toEqual({ effect: 'ignored', text: 'Mode Slot 3 пуст — режим не меняется' });
    expect(qc.state.mode).toBeNull();
    expect(qc.cc(47, 0)).toEqual({ effect: 'applied', text: 'Режим HYBRID: SCENE (A–D) + STOMP (E–H) (Mode Slot 1)' });
    expect(qc.state.mode).toEqual({ name: 'HYBRID', rows: ['SCENE', 'STOMP'], slot: 1 });
  });

  it('работает при открытом Looper X', () => {
    const qc = new TestDevice();
    qc.cc(48, 0);
    expect(qc.cc(47, 2).effect).toBe('applied');
    expect(qc.state.mode?.name).toBe('STOMP');
    expect(qc.state.screens).toEqual(['looper']);
  });
});

describe('Ignore Duplicate PC (CC#62)', () => {
  it('0–63 выключает, 64–127 включает; настройка меняется в состоянии прибора', () => {
    const qc = new TestDevice();
    expect(qc.cc(62, 64)).toEqual({ effect: 'applied', text: 'Ignore Duplicate PC: On' });
    expect(qc.state.settings.ignoreDuplicatePc).toBe(true);
    qc.pc(1);
    expect(qc.pc(1).effect).toBe('ignored');
    expect(qc.cc(62, 63)).toEqual({ effect: 'applied', text: 'Ignore Duplicate PC: Off' });
    expect(qc.state.settings.ignoreDuplicatePc).toBe(false);
    expect(qc.pc(1).effect).toBe('applied');
  });
});

describe('Note On и Note Off', () => {
  it('относятся к блокам Minivoicer, Multivoicer, Overlord Synth и экран не меняют', () => {
    const qc = new TestDevice();
    const before = qc.state;
    const blocks =
      'блоков Minivoicer/Multivoicer/Overlord Synth, если такой блок есть в пресете и его MIDI-режим включён';
    expect(qc.send([0x91, 60, 100])).toEqual({ effect: 'applied', text: `Нота для ${blocks}` });
    const off = `Отпускание ноты для ${blocks}`;
    expect(qc.send([0x81, 60, 0])).toEqual({ effect: 'applied', text: off });
    expect(qc.send([0x91, 60, 0])).toEqual({ effect: 'applied', text: off });
    expect(qc.state).toBe(before);
  });
});

describe('MIDI Clock (F8) и Start (FA)', () => {
  it('при MIDI Clock In = Off Timing Clock не принимается', () => {
    const qc = new TestDevice();
    const before = qc.state;
    expect(qc.send([0xf8])).toEqual({ effect: 'ignored', text: 'Timing Clock не принимается: MIDI Clock In = Off' });
    expect(qc.state).toBe(before);
  });

  it('при MIDI Clock In = On темп синхронизируется к MIDI Clock: светодиод TEMPO синий, окно Tempo закрывается', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(qc.state.screens).toEqual(['tempo']);
    expect(qc.send([0xf8])).toEqual({
      effect: 'applied',
      text: 'Timing Clock: синхронизация к внешнему MIDI Clock, темп ещё не определён',
    });
    expect(qc.state.tempo).toMatchObject({ clockSynced: true, led: 'blue', beatTime: qc.time });
    expect(qc.state.screens).toEqual([]);
    expect(qc.ticks(24, 100)).toEqual({
      effect: 'applied',
      text: 'Timing Clock: темп 100.0 BPM по внешнему MIDI Clock',
    });
    expect(qc.state.tempo).toMatchObject({ bpm: 100, source: 'clock', beatTime: qc.time });
    const beat = qc.state;
    qc.ticks(5, 100);
    expect(qc.state).toBe(beat);
  });

  it('Tap Tempo при внешнем MIDI Clock не действует', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.ticks(30, 120);
    expect(qc.cc(44, 127)).toEqual({
      effect: 'ignored',
      text: 'Tap Tempo не действует: темп задаёт внешний MIDI Clock (по форуму)',
    });
    expect(qc.state.tempo).toMatchObject({ bpm: 120, source: 'clock', taps: 0 });
  });

  it('после остановки MIDI Clock прибор возвращается к прежнему внутреннему темпу, светодиод снова зелёный', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.cc(44, 127);
    qc.cc(44, 127, 600);
    const tapTime = qc.time;
    qc.ticks(30, 120, 1000);
    expect(qc.state.tempo).toMatchObject({
      bpm: 120,
      source: 'clock',
      clockSynced: true,
      led: 'blue',
      internalBpm: 100,
      internalBeatTime: tapTime,
    });
    qc.cc(43, 1, 400);
    expect(qc.state.tempo.clockSynced).toBe(true);
    qc.cc(43, 2, 1500);
    expect(qc.state.tempo).toMatchObject({
      clockSynced: false,
      led: 'green',
      bpm: 100,
      source: 'tap',
      beatTime: tapTime,
      downbeatTime: tapTime,
      internalBpm: null,
      internalBeatTime: null,
    });
  });

  it('без известного внутреннего темпа после остановки MIDI Clock темп неизвестен', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.ticks(30, 120);
    qc.cc(43, 2, 2000);
    expect(qc.state.tempo).toMatchObject({ clockSynced: false, led: 'green', bpm: null, source: null, beatTime: null });
  });

  it('при TEMPO MODE = PRESET загрузка пресета при синхронизации делает неизвестным только внутренний темп', () => {
    const qc = new TestDevice({ midiClockIn: true, tempoMode: 'PRESET' });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    qc.ticks(30, 100, 1000);
    expect(qc.pc(4, 10)).toEqual({ effect: 'applied', text: 'Пресет 1E загружен (сетлист ?)' });
    expect(qc.state.tempo).toMatchObject({ bpm: 100, source: 'clock', internalBpm: null });
    qc.cc(43, 0, 2000);
    expect(qc.state.tempo).toMatchObject({ clockSynced: false, bpm: null, source: null });
  });

  it('при включённом MIDI Clock Out светодиод TEMPO красный и входящий MIDI Clock не применяется', () => {
    const qc = new TestDevice({ midiClockIn: true, midiClockOut: 'USB' });
    expect(qc.state.tempo.led).toBe('red');
    expect(qc.send([0xf8])).toEqual({
      effect: 'ignored',
      text: 'Timing Clock не применяется: включён MIDI Clock Out (USB), приём при передаче не документирован',
    });
    expect(new TestDevice({ tempoLed: false }).state.tempo.led).toBe('off');
  });

  it('MIDI Start начинает отсчёт долей заново; без взведённых действий Looper X — без действия', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.ticks(10, 120);
    const beatTime = qc.state.tempo.beatTime;
    expect(qc.send([0xfa])).toEqual({ effect: 'ignored', text: 'Start: действий Looper X, ожидающих MIDI Start, нет' });
    qc.ticks(1, 120);
    expect(qc.state.tempo.beatTime).toBe(qc.time);
    expect(qc.state.tempo.beatTime).not.toBe(beatTime);
  });
});

describe('Сообщения вне MIDI-реализации', () => {
  it.each([
    [[0xe1, 0, 64], `Pitch Bend ${NOT_IMPLEMENTED}`],
    [[0xd1, 10], `Channel Aftertouch ${NOT_IMPLEMENTED}`],
    [[0xa1, 60, 10], `Polyphonic Aftertouch ${NOT_IMPLEMENTED}`],
    [[0xf0, 0x00, 0x01, 0x0c, 0x01, 0xf7], `System Exclusive ${NOT_IMPLEMENTED}: публичной SysEx-реализации нет`],
    [[0xf1, 0x10], `MTC Quarter Frame ${NOT_IMPLEMENTED}`],
    [[0xf2, 0, 0], `Song Position Pointer ${NOT_IMPLEMENTED}`],
    [[0xf3, 1], `Song Select ${NOT_IMPLEMENTED}`],
    [[0xf6], `Tune Request ${NOT_IMPLEMENTED}`],
    [[0xfb], `Continue ${NOT_IMPLEMENTED} (не документирован)`],
    [[0xfc], `Stop ${NOT_IMPLEMENTED} (не документирован)`],
    [[0xfe], `Active Sensing ${NOT_IMPLEMENTED}`],
    [[0xff], `System Reset ${NOT_IMPLEMENTED}`],
    [[0xb1, 3, 1], `CC#3 ${NOT_IMPLEMENTED}`],
    [[0xb1, 7, 100], `CC#7 ${NOT_IMPLEMENTED}`],
    [[0xb1, 31, 1], `CC#31 ${NOT_IMPLEMENTED}`],
    [[0xb1, 33, 1], `CC#33 ${NOT_IMPLEMENTED}`],
    [[0xb1, 34, 1], `CC#34 ${NOT_IMPLEMENTED}`],
    [[0xb1, 63, 1], `CC#63 ${NOT_IMPLEMENTED}`],
    [[0xb1, 123, 0], `CC#123 (All Notes Off) ${NOT_IMPLEMENTED}`],
    [
      [0xb1, 64, 127],
      'CC#64 (Footswitch Page Swap) есть только у Quad Cortex mini — у Quad Cortex не входит в MIDI-реализацию',
    ],
    [[0xc1], 'Некорректное сообщение — прибор его не обрабатывает'],
  ])('%j: %s', (bytes, text) => {
    const qc = new TestDevice();
    const before = qc.state;
    expect(qc.send(bytes)).toEqual({ effect: 'unsupported', text });
    expect(qc.state).toBe(before);
  });
});

describe('Применение настроек', () => {
  it('неизвестные сетлист и режим берутся из настроек «при включении», известные остаются', () => {
    const qc = new TestDevice();
    const settings = resolveSettings(quadCortexEngine.settings, { startSetlist: '3', startModeSlot: '2' });
    const state = quadCortexEngine.applySettings(qc.state, settings);
    expect(state.preset.setlist).toBe(3);
    expect(state.mode?.name).toBe('SCENE');
    expect(state.settings).toBe(settings);
    const known = new TestDevice();
    known.cc(32, 5);
    known.pc(0);
    known.cc(47, 2);
    const kept = quadCortexEngine.applySettings(known.state, settings);
    expect(kept.preset.setlist).toBe(5);
    expect(kept.mode?.name).toBe('STOMP');
  });

  it('новое содержимое слота заменяет режим, выбранный из этого слота; обозначения пересчитываются', () => {
    const qc = new TestDevice({ startModeSlot: '1', startSetlist: '9' });
    qc.pc(67);
    expect(qc.state.preset.label).toBe('9D');
    const settings = resolveSettings(quadCortexEngine.settings, {
      startModeSlot: '1',
      modeSlot1: 'PRESET+SCENE',
      modeSlot2: 'STOMP',
      modeSlot3: 'EMPTY',
    });
    const state = quadCortexEngine.applySettings(qc.state, settings);
    expect(state.mode).toEqual({ name: 'HYBRID', rows: ['PRESET', 'SCENE'], slot: 1 });
    expect(state.preset).toMatchObject({ label: '17D', standardLabel: '9D', banksOfFour: true });
  });

  it('если слот текущего режима стал пустым, режим неизвестен; неизменный режим остаётся тем же объектом', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    const ledOff = resolveSettings(quadCortexEngine.settings, { tempoLed: false });
    const same = quadCortexEngine.applySettings(qc.state, ledOff);
    expect(same.mode).toBe(qc.state.mode);
    const settings = resolveSettings(quadCortexEngine.settings, { modeSlot1: 'PRESET+SCENE', modeSlot2: 'SCENE' });
    const state = quadCortexEngine.applySettings(qc.state, settings);
    expect(state.mode).toBeNull();
    expect(state.footswitches.every((f) => f.role === null)).toBe(true);
  });

  it('выключение MIDI Clock In прекращает синхронизацию и возвращает внутренний темп', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    qc.ticks(30, 100, 1000);
    const state = quadCortexEngine.applySettings(qc.state, resolveSettings(quadCortexEngine.settings, {}));
    expect(state.tempo).toMatchObject({ clockSynced: false, led: 'green', bpm: 120, source: 'tap' });
  });

  it('повторы режимов в слотах: слот с режимом, который уже есть в слоте с меньшим номером, пуст', () => {
    const qc = new TestDevice({ modeSlot1: 'PRESET+SCENE', modeSlot2: 'SCENE', modeSlot3: 'PRESET' });
    expect(readQuadCortexSettings(qc.state.settings).modeSlots).toEqual(['PRESET+SCENE', 'EMPTY', 'EMPTY']);
    expect(qc.cc(47, 1)).toEqual({ effect: 'ignored', text: 'Mode Slot 2 пуст — режим не меняется' });
    expect(qc.cc(47, 0).text).toBe('Режим HYBRID: PRESET (A–D) + SCENE (E–H) (Mode Slot 1)');
  });
});

describe('Состояние на момент времени (quadCortexAt)', () => {
  it('без наступивших событий возвращает тот же объект', () => {
    const qc = new TestDevice();
    qc.cc(43, 1);
    expect(quadCortexAt(qc.state, qc.time + 60000)).toBe(qc.state);
  });

  it('закрывает окно Tempo в момент автозакрытия, не дожидаясь сообщения', () => {
    const qc = new TestDevice({ startModeSlot: '2' });
    qc.cc(44, 127);
    qc.cc(44, 127, 500);
    expect(quadCortexAt(qc.state, qc.time + 4999)).toBe(qc.state);
    const later = quadCortexAt(qc.state, qc.time + 5000);
    expect(later.screens).toEqual([]);
    expect(later.tempo).toMatchObject({ windowClosesAt: null, bpm: 120 });
    expect(later.footswitches[0]).toMatchObject({ role: 'scene', label: 'A' });
    expect(qc.state.screens).toEqual(['tempo']);
  });

  it('прекращает синхронизацию к MIDI Clock, когда импульсы перестали приходить', () => {
    const qc = new TestDevice({ midiClockIn: true });
    qc.ticks(30, 120);
    expect(quadCortexAt(qc.state, qc.time + 100).tempo.led).toBe('blue');
    expect(quadCortexAt(qc.state, qc.time + 2000).tempo).toMatchObject({ clockSynced: false, led: 'green' });
  });

  it('останавливает петлю ONE SHOT в конце прохода', () => {
    const qc = new TestDevice();
    qc.cc(53, 127);
    qc.cc(53, 127, 2000);
    qc.cc(50, 127, 500);
    const stopsAt = qc.state.looper.stopsAt!;
    expect(quadCortexAt(qc.state, stopsAt - 1).looper.transport).toBe('playing');
    expect(quadCortexAt(qc.state, stopsAt).looper).toMatchObject({ transport: 'stopped', stopsAt: null });
  });
});

describe('Настройки отображения', () => {
  it('Dimmed LEDs, LIVE TUNER и Tuner MUTE читаются из состояния; по умолчанию On', () => {
    expect(readQuadCortexSettings(new TestDevice().state.settings)).toMatchObject({
      dimmedLeds: true,
      liveTuner: true,
      tunerMute: true,
    });
    const qc = new TestDevice({ dimmedLeds: false, liveTuner: false, tunerMute: false });
    expect(readQuadCortexSettings(qc.state.settings)).toMatchObject({
      dimmedLeds: false,
      liveTuner: false,
      tunerMute: false,
    });
  });
});
