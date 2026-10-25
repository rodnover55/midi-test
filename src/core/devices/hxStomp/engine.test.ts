import { describe, expect, it } from 'vitest';
import { ClockTracker } from '../../clock.ts';
import { parseMidi } from '../../midi.ts';
import { replay } from '../../replay.ts';
import type { CommandDescription, DeviceSettings, SettingDef } from '../types.ts';
import { resolveSettings } from '../types.ts';
import type { HxStompState } from './engine.ts';
import { hxStompEngine } from './engine.ts';

const START = Date.UTC(2026, 0, 1, 12);

/** Замораживает объект со всеми вложенными: попытка изменить его бросает TypeError. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
  }
  return value;
}

/**
 * HX Stomp под тестом: передаёт сообщения модели так же, как монитор, — со
 * временем получения и MIDI Clock по импульсам Timing Clock. Состояние перед
 * каждым сообщением замораживается, поэтому изменение переданного состояния
 * роняет тест.
 */
class Stomp {
  state: HxStompState;
  /** Состояние до последнего сообщения. */
  previous: HxStompState;
  time = START;
  private readonly clock = new ClockTracker();

  constructor(settings: Partial<DeviceSettings> = {}) {
    this.state = hxStompEngine.createState(resolveSettings(hxStompEngine.settings, settings));
    this.previous = this.state;
  }

  /**
   * Передаёт сообщение.
   *
   * @param after пауза после предыдущего сообщения, мс; по умолчанию 10.
   */
  send(bytes: number[], after = 10): CommandDescription {
    this.time += after;
    const message = parseMidi(bytes);
    if (message.kind === 'clock') {
      this.clock.tick(this.time);
    }
    this.previous = deepFreeze(this.state);
    const result = hxStompEngine.handle(this.previous, message, { time: this.time, clock: this.clock.info() });
    this.state = result.state;
    return result.description;
  }

  /** Передаёт сообщения подряд и возвращает описание последнего. */
  sendAll(messages: number[][], after = 10): CommandDescription {
    let last: CommandDescription | null = null;
    for (const bytes of messages) {
      last = this.send(bytes, after);
    }
    return last!;
  }

  /** Применяет настройки поверх текущих. */
  configure(settings: Partial<DeviceSettings>): void {
    this.state = hxStompEngine.applySettings(
      deepFreeze(this.state),
      resolveSettings(hxStompEngine.settings, { ...this.state.settings, ...settings }),
    );
  }

  /** Проверяет, что последнее сообщение не изменило состояние и вернуло тот же объект. */
  expectUnchanged(): void {
    expect(this.state).toBe(this.previous);
  }
}

const pc = (program: number) => [0xc0, program];
const cc = (controller: number, value: number) => [0xb0, controller, value];
const CLOCK = [0xf8];
/** Интервал импульсов Timing Clock при 120 BPM, мс. */
const TICK_120 = 60000 / (120 * 24);

function applied(description: CommandDescription, text?: string): void {
  expect(description.effect).toBe('applied');
  if (text !== undefined) {
    expect(description.text).toBe(text);
  }
}

function ignored(description: CommandDescription, part?: string): void {
  expect(description.effect).toBe('ignored');
  if (part !== undefined) {
    expect(description.text).toContain(part);
  }
}

function def(key: string): SettingDef {
  const found = hxStompEngine.settings.find((d) => d.key === key);
  if (!found) {
    throw new Error(`нет настройки ${key}`);
  }
  return found;
}

/** Возвращает подписи вариантов настройки-списка. */
function optionLabels(key: string): string[] {
  const d = def(key);
  return d.type === 'select' ? d.options.map((o) => o.label) : [];
}

/** Задаёт темп 120 BPM ударами Tap Tempo, загружает пресет и возвращает темп после загрузки. */
function tempoAfterLoad(settings: Partial<DeviceSettings>) {
  const d = new Stomp(settings);
  d.sendAll([cc(64, 127), cc(64, 127)], 500);
  expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'tap' });
  d.send(pc(9));
  return d.state.tempo;
}

describe('описание модели', () => {
  it('воспроизводит HX Stomp 3.80', () => {
    expect(hxStompEngine.id).toBe('hxstomp');
    expect(hxStompEngine.vendor).toBe('Line 6');
    expect(hxStompEngine.model).toBe('HX Stomp');
    expect(hxStompEngine.firmware).toBe('HX Stomp 3.80');
  });

  it('задаёт настройки прибора со значениями по умолчанию', () => {
    expect(resolveSettings(hxStompEngine.settings, {})).toEqual({
      port: 'midi',
      usbMidi: true,
      pcRx: 'both',
      rxClock: 'auto',
      tempoSelect: 'preset',
      exp1Position: 'preset',
      exp2Position: 'preset',
      fs3Function: 'tapTuner',
      fs4Function: 'allBypass',
      fs5Function: 'toggleExp',
      presetNumber: 'banks',
      snapshotEdits: 'recall',
      bypassType: 'analog',
      tapLed: true,
      initialMode: 'stomp',
      looper: true,
    });
    for (const d of hxStompEngine.settings) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.hint?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('перечисляет функции FS3–FS5 как на приборе', () => {
    expect(optionLabels('fs3Function')).toEqual([
      'TAP/Tuner',
      'Stomp 3',
      'Preset Up',
      'Preset Down',
      'Snapshot Up',
      'Snapshot Down',
      'All Bypass',
      'Toggle EXP 1/2',
    ]);
    expect(optionLabels('fs4Function')).toEqual([
      'TAP/Tuner',
      'Stomp 4',
      'Bank Up',
      'Bank Down',
      'Preset Up',
      'Preset Down',
      'Snapshot Up',
      'Snapshot Down',
      'Next Footswitch Mode',
      'Previous Footswitch Mode',
      'All Bypass',
      'Toggle EXP 1/2',
    ]);
    expect(optionLabels('fs5Function')).toContain('Stomp 5');
  });

  it('заменяет недопустимую функцию FS3 значением по умолчанию', () => {
    const d = new Stomp({ fs3Function: 'bankUp' });
    expect(d.state.settings.fs3Function).toBe('tapTuner');
  });
});

describe('включение', () => {
  it('создаёт прибор в Play view и режиме Stomp; пресет, снапшот и темп неизвестны', () => {
    const d = new Stomp();
    expect(d.state).toMatchObject({
      view: 'play',
      tuner: false,
      tunerPage: 1,
      allBypass: false,
      footswitchMode: 'stomp',
      bankQueue: null,
      preset: null,
      edited: false,
      presetLoading: false,
      snapshot: null,
      tempo: { bpm: null, source: null, beatTime: null, tap: { count: 0, times: [] }, own: null, clock: null },
      looper: { status: 'empty', playOnce: false, reverse: false, halfSpeed: false, undo: 'none', since: null },
      exp: [null, null],
      knobs: [null, null, null],
    });
    expect(d.state.footswitches).toHaveLength(5);
    expect(d.state.footswitches.every((f) => !f.pressed && !f.stompHeld && f.lastPress === null)).toBe(true);
    expect(d.state.switches).toEqual([
      { label: { kind: 'assignment' }, ring: { light: 'unknown', color: null } },
      { label: { kind: 'assignment' }, ring: { light: 'unknown', color: null } },
      { label: { kind: 'text', text: 'TAP/TUNER', color: 'red' }, ring: { light: 'tempo', color: 'red' } },
    ]);
  });

  it('начинает с режима футсвитчей из настройки', () => {
    expect(new Stomp({ initialMode: 'snapshot' }).state.footswitchMode).toBe('snapshot');
  });

  it('без 1 Switch Looper в пресетах не создаёт лупер', () => {
    expect(new Stomp({ looper: false }).state.looper).toBeNull();
  });

  it('хранит состояние, пригодное для JSON', () => {
    const d = new Stomp();
    d.sendAll([pc(5), cc(69, 1), cc(64, 127), cc(64, 127), cc(60, 127), cc(71, 2), cc(1, 64)], 400);
    expect(JSON.parse(JSON.stringify(d.state))).toEqual(d.state);
  });
});

describe('Program Change', () => {
  it('загружает пресет n: банк ⌊n/3⌋ + 1, слот A, B, C по n mod 3', () => {
    for (let n = 0; n < 126; n++) {
      const d = new Stomp();
      const description = d.send(pc(n));
      const bank = Math.floor(n / 3) + 1;
      const slot = 'ABC'[n % 3];
      const label = `${String(bank).padStart(2, '0')}${slot}`;
      expect(d.state.preset).toEqual({ index: n, bank, slot, label, name: null });
      applied(description, `Пресет ${label} загружен; снапшот — сохранённый в пресете`);
    }
  });

  it('PC 122, 124 и 125 — пресеты 41C, 42B и 42C', () => {
    const d = new Stomp();
    applied(d.send(pc(122)), 'Пресет 41C загружен; снапшот — сохранённый в пресете');
    expect(d.state.preset).toEqual({ index: 122, bank: 41, slot: 'C', label: '41C', name: null });
    applied(d.send(pc(124)), 'Пресет 42B загружен; снапшот — сохранённый в пресете');
    expect(d.state.preset?.label).toBe('42B');
    applied(d.send(pc(125)), 'Пресет 42C загружен; снапшот — сохранённый в пресете');
    expect(d.state.preset?.label).toBe('42C');
  });

  it('при загрузке пресета вызывает сохранённый снапшот и отбрасывает правки', () => {
    const d = new Stomp();
    d.sendAll([pc(10), cc(69, 2), cc(75, 100)]);
    expect(d.state).toMatchObject({ snapshot: 3, edited: true, knobs: [100, null, null] });
    applied(d.send(pc(11)), 'Пресет 04C загружен; снапшот — сохранённый в пресете');
    expect(d.state).toMatchObject({ snapshot: null, edited: false, knobs: [null, null, null], presetLoading: true });
  });

  it('PC 126 и 127 — пресетов нет, без действия', () => {
    const d = new Stomp();
    d.send(pc(5));
    for (const n of [126, 127]) {
      ignored(d.send(pc(n)), 'пресета с таким номером нет');
      expect(d.state.preset?.index).toBe(5);
    }
    ignored(d.send(pc(127)), '01A–42C');
    d.configure({ presetNumber: 'numbers' });
    ignored(d.send(pc(126)), '000–125');
  });

  it('PC текущего пресета не перезагружает его: правки и снапшот сохраняются', () => {
    const d = new Stomp();
    d.sendAll([pc(40), cc(69, 1), cc(76, 3), cc(3, 0)]);
    const description = d.send(pc(40));
    ignored(description, 'Пресет 14B уже загружен');
    d.expectUnchanged();
    expect(d.state).toMatchObject({ snapshot: 2, edited: true, knobs: [null, 3, null] });
  });

  it('PC неизвестного текущего пресета загружает пресет', () => {
    const d = new Stomp();
    applied(d.send(pc(0)));
    expect(d.state.preset?.label).toBe('01A');
  });

  it('при Preset Number = 000–125 показывает номер пресета', () => {
    const d = new Stomp({ presetNumber: 'numbers' });
    applied(d.send(pc(122)), 'Пресет 122 загружен; снапшот — сохранённый в пресете');
    expect(d.state.preset?.label).toBe('122');
    d.send(pc(7));
    expect(d.state.preset?.label).toBe('007');
  });

  it('принимает PC только с портов из MIDI PC Rx', () => {
    const off = new Stomp({ pcRx: 'off' });
    ignored(off.send(pc(3)), 'MIDI PC Rx = Off');
    off.expectUnchanged();
    const usbOnly = new Stomp({ pcRx: 'usb' });
    ignored(usbOnly.send(pc(3)), 'MIDI PC Rx = USB: Program Change с MIDI IN не принимается');
    expect(usbOnly.state.preset).toBeNull();
    applied(new Stomp({ pcRx: 'midi' }).send(pc(3)));
    applied(new Stomp({ pcRx: 'usb', port: 'usb' }).send(pc(3)));
    ignored(new Stomp({ pcRx: 'midi', port: 'usb' }).send(pc(3)), 'с USB не принимается');
  });

  it('при USB MIDI = Off не принимает по USB ничего', () => {
    const d = new Stomp({ port: 'usb', usbMidi: false });
    for (const bytes of [pc(3), cc(69, 1), cc(68, 0), CLOCK]) {
      ignored(d.send(bytes), 'USB MIDI = Off');
      d.expectUnchanged();
    }
    applied(new Stomp({ port: 'midi', usbMidi: false }).send(pc(3)));
  });

  it('берёт темп из пресета или снапшота по Tempo Select', () => {
    expect(tempoAfterLoad({ tempoSelect: 'preset' })).toMatchObject({ bpm: null, source: 'preset', beatTime: null });
    expect(tempoAfterLoad({ tempoSelect: 'snapshot' })).toMatchObject({ bpm: null, source: 'snapshot' });
    expect(tempoAfterLoad({ tempoSelect: 'global' })).toMatchObject({ bpm: 120, source: 'tap' });
  });

  it('восстанавливает положения педалей по EXP 1/2 Position', () => {
    const d = new Stomp({ exp1Position: 'global', exp2Position: 'preset' });
    d.sendAll([cc(1, 10), cc(2, 20)]);
    applied(d.send(pc(1)));
    expect(d.state.exp).toEqual([10, null]);
    const s = new Stomp({ exp1Position: 'snapshot', exp2Position: 'preset' });
    s.sendAll([pc(1), cc(1, 10), cc(2, 20)]);
    applied(s.send(cc(69, 1)), 'Snapshot 2');
    expect(s.state.exp).toEqual([null, 20]);
  });

  it('меняет пресет под открытым Tuner и при All Bypass', () => {
    const d = new Stomp();
    d.send(cc(68, 127));
    applied(d.send(pc(4)), 'Пресет 02B загружен; снапшот — сохранённый в пресете (Tuner остаётся открыт)');
    expect(d.state).toMatchObject({ tuner: true, preset: { label: '02B' } });
    d.send(cc(70, 0));
    expect(d.send(pc(5)).text).toContain('(Tuner и All Bypass остаются включены)');
    d.send(cc(68, 0));
    expect(d.send(pc(6)).text).toContain('(All Bypass остаётся включён)');
    expect(d.state.allBypass).toBe(true);
  });

  it('не меняет режим футсвитчей, вид и лупер', () => {
    const d = new Stomp();
    d.sendAll([cc(71, 1), cc(73, 0), cc(60, 127), cc(61, 127)]);
    applied(d.send(pc(20)), 'Пресет 07C загружен; снапшот — сохранённый в пресете');
    expect(d.state).toMatchObject({ footswitchMode: 'scroll', view: 'edit', looper: { status: 'playing' } });
  });

  it('несколько PC подряд загружают пресеты по очереди', () => {
    const d = new Stomp();
    for (const [program, label] of [
      [122, '41C'],
      [124, '42B'],
      [125, '42C'],
      [0, '01A'],
    ] as const) {
      applied(d.send(pc(program), 1), `Пресет ${label} загружен; снапшот — сохранённый в пресете`);
    }
    expect(d.state).toMatchObject({ preset: { index: 0 }, presetLoading: true });
  });

  it('сообщения другого канала до модели не доходят', () => {
    const result = replay('hxstomp', [[0xc1, 5], [0xb1, 69, 1], [0xc0, 7]], { channel: 1, gap: 10, start: START });
    expect(result.steps.map((s) => s.description?.effect ?? null)).toEqual([null, null, 'applied']);
    expect((result.state as HxStompState).preset?.label).toBe('03B');
  });
});

describe('Bank Select (CC0, CC32)', () => {
  it('зарезервирован: без действия, следующий PC выполняется как обычно', () => {
    const d = new Stomp();
    ignored(d.send(cc(0, 1)), 'Bank Select MSB не используется');
    d.expectUnchanged();
    ignored(d.send(cc(32, 3)), 'у HX Stomp один сетлист');
    d.expectUnchanged();
    applied(d.send(pc(2)));
    expect(d.state.preset?.label).toBe('01C');
  });
});

describe('CC69 — снапшоты', () => {
  it('0, 1, 2 выбирают Snapshot 1, 2, 3', () => {
    const d = new Stomp();
    for (const [value, snapshot] of [
      [0, 1],
      [1, 2],
      [2, 3],
    ]) {
      applied(d.send(cc(69, value)), `Snapshot ${snapshot}`);
      expect(d.state.snapshot).toBe(snapshot);
    }
  });

  it('применяет CC69, пришедший сразу после PC, к новому пресету', () => {
    const d = new Stomp();
    d.send(pc(122));
    applied(d.send(cc(69, 1)), 'Snapshot 2 — выполнен после загрузки пресета 41C');
    expect(d.state).toMatchObject({ preset: { label: '41C' }, snapshot: 2, presetLoading: false });
  });

  it('сообщение без действия между PC и CC69 не мешает применить CC69 после загрузки', () => {
    const d = new Stomp();
    d.send(pc(5));
    for (const bytes of [cc(3, 0), cc(0, 1), cc(69, 5), pc(5), [0xe0, 0, 0x40]]) {
      d.send(bytes);
      d.expectUnchanged();
    }
    expect(d.state.presetLoading).toBe(true);
    applied(d.send(cc(69, 2)), 'Snapshot 3 — выполнен после загрузки пресета 02C');
  });

  it('выполненное сообщение после PC снимает отметку загрузки', () => {
    const d = new Stomp();
    d.sendAll([pc(5), cc(1, 10)]);
    expect(d.state.presetLoading).toBe(false);
    applied(d.send(cc(69, 2)), 'Snapshot 3');
  });

  it('8 и 9 — следующий и предыдущий снапшот по кругу', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(69, 1)]);
    applied(d.send(cc(69, 8)), 'Snapshot: следующий — Snapshot 3');
    applied(d.send(cc(69, 8)), 'Snapshot: следующий — Snapshot 1 (после Snapshot 3 — по кругу)');
    applied(d.send(cc(69, 9)), 'Snapshot: предыдущий — Snapshot 3 (после Snapshot 1 — по кругу)');
    applied(d.send(cc(69, 9)), 'Snapshot: предыдущий — Snapshot 2');
    expect(d.state.snapshot).toBe(2);
  });

  it('8 и 9 при неизвестном снапшоте оставляют его неизвестным', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(76, 9)]);
    const description = d.send(cc(69, 8));
    applied(description);
    expect(description.text).toContain('номер неизвестен');
    expect(d.state).toMatchObject({ snapshot: null, knobs: [null, null, null] });
  });

  it('3 («Snapshot 4») и недокументированные значения — без действия', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(69, 0)]);
    ignored(d.send(cc(69, 3)), '«Snapshot 4»');
    d.expectUnchanged();
    for (const value of [4, 5, 6, 7, 10, 64, 127]) {
      ignored(d.send(cc(69, value)), 'значение не документировано');
      d.expectUnchanged();
    }
    expect(d.state.snapshot).toBe(1);
  });

  it('повторный вызов активного снапшота — Reload', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(69, 1), cc(75, 50)]);
    const recall = d.send(cc(69, 1));
    applied(recall);
    expect(recall.text).toContain('Reload');
    d.expectUnchanged();
    d.configure({ snapshotEdits: 'discard' });
    const discard = d.send(cc(69, 1));
    applied(discard);
    expect(discard.text).toContain('правки снапшота сброшены');
    expect(d.state).toMatchObject({ snapshot: 2, knobs: [null, null, null] });
  });

  it('при Tempo Select = Per Snapshot смена снапшота задаёт сохранённый темп', () => {
    const d = new Stomp({ tempoSelect: 'snapshot' });
    d.sendAll([pc(0), cc(69, 0), cc(64, 127), cc(64, 127)], 500);
    expect(d.state.tempo.bpm).toBe(120);
    d.send(cc(69, 1));
    expect(d.state.tempo).toMatchObject({ bpm: null, source: 'snapshot' });
    const p = new Stomp({ tempoSelect: 'preset' });
    p.sendAll([pc(0), cc(69, 0), cc(64, 127), cc(64, 127), cc(69, 1)], 500);
    expect(p.state.tempo).toMatchObject({ bpm: 120, source: 'tap' });
  });

  it('меняет снапшот под открытым Tuner', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(68, 0)]);
    applied(d.send(cc(69, 2)), 'Snapshot 3 (Tuner остаётся открыт)');
    expect(d.state).toMatchObject({ snapshot: 3, tuner: true });
  });
});

describe('CC1, CC2 — педали EXP 1 и EXP 2', () => {
  it('задают положение педали', () => {
    const d = new Stomp();
    applied(d.send(cc(1, 64)), 'EXP 1: положение 50 % — параметры и блоки, назначенные на EXP 1 в пресете');
    applied(d.send(cc(2, 0)), 'EXP 2: положение 0 % (пятка) — параметры и блоки, назначенные на EXP 2 в пресете');
    expect(d.state.exp).toEqual([64, 0]);
    expect(d.send(cc(1, 127)).text).toContain('100 % (носок)');
    expect(d.state.exp).toEqual([127, 0]);
    applied(d.send(cc(1, 127)));
    d.expectUnchanged();
  });
});

describe('зарезервированные CC', () => {
  it('CC3, CC54–CC59, CC67, CC78–CC80 — без действия', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(3, 0)]);
    for (const controller of [3, 54, 55, 56, 57, 58, 59, 67, 78, 79, 80]) {
      for (const value of [0, 127]) {
        ignored(d.send(cc(controller, value)), 'зарезервирован');
        d.expectUnchanged();
      }
    }
    expect(d.send(cc(54, 127)).text).toContain('у HX Stomp XL — FS6');
    expect(d.send(cc(80, 127)).text).toContain('у Helix — Knob 6');
  });
});

describe('CC49–CC53 — эмуляция футсвитчей', () => {
  it('FS1–FS3: 64–127 — нажатие, 0–63 — отпускание', () => {
    const d = new Stomp();
    d.send(pc(0));
    const press = d.send(cc(49, 127));
    applied(press, 'FS1 нажат: переключены блоки и команды, назначенные на FS1 в пресете (назначения неизвестны)');
    expect(d.state.footswitches[0]).toEqual({ pressed: true, stompHeld: true, lastPress: d.time });
    applied(
      d.send(cc(49, 0)),
      'FS1 отпущен: назначения типа Momentary вернулись в прежнее состояние, Latching — без изменений',
    );
    expect(d.state.footswitches[0]).toMatchObject({ pressed: false, stompHeld: false });
    applied(d.send(cc(50, 64)));
    expect(d.state.footswitches[1].pressed).toBe(true);
    applied(d.send(cc(50, 63)));
    expect(d.state.footswitches[1].pressed).toBe(false);
  });

  it('отпускание без нажатия — без действия', () => {
    const d = new Stomp();
    for (const controller of [49, 50, 51]) {
      ignored(d.send(cc(controller, 0)), 'отпущен без нажатия');
      d.expectUnchanged();
    }
  });

  it('повторное нажатие без отпускания снова переключает назначения', () => {
    const d = new Stomp();
    d.send(cc(49, 127));
    applied(d.send(cc(49, 100)));
    expect(d.state.footswitches[0]).toMatchObject({ pressed: true, stompHeld: true });
  });

  it('в режимах Scroll, Preset и Snapshot эмулирует футсвитч режима Stomp', () => {
    for (const value of [1, 2, 3]) {
      const d = new Stomp();
      d.sendAll([pc(9), cc(71, value)]);
      const description = d.send(cc(50, 127));
      applied(description);
      expect(description.text).toContain('назначенные на FS2 в пресете');
      expect(description.text).toContain('(эмуляция футсвитча режима Stomp)');
      expect(d.state.preset?.index).toBe(9);
    }
  });

  it('FS3 с функцией TAP/Tuner: нажатие — удар Tap Tempo, отпускание — без действия', () => {
    const d = new Stomp();
    applied(d.send(cc(51, 127), 500), 'FS3 (TAP/Tuner) нажат — Tap Tempo: удар 1 — темп задаст следующий удар');
    ignored(d.send(cc(51, 0), 100), 'FS3 (TAP/Tuner) отпущен — без действия');
    applied(d.send(cc(51, 127), 400), 'FS3 (TAP/Tuner) нажат — Tap Tempo: удар 2, темп 120.0 BPM');
    expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'tap' });
  });

  it('FS3 выполняет функцию из FS3 Function', () => {
    const stomp = new Stomp({ fs3Function: 'stomp' });
    expect(stomp.send(cc(51, 127)).text).toContain('FS3 (Stomp 3) нажат: переключены блоки и команды');
    expect(stomp.state.footswitches[2].stompHeld).toBe(true);

    const up = new Stomp({ fs3Function: 'presetUp' });
    up.send(pc(0));
    applied(up.send(cc(51, 127)), 'FS3 (Preset Up) нажат: загружен пресет 01B; снапшот — сохранённый в пресете');
    expect(up.state.preset?.label).toBe('01B');

    const down = new Stomp({ fs3Function: 'snapshotDown' });
    down.sendAll([pc(0), cc(69, 0)]);
    applied(down.send(cc(51, 127)), 'FS3 (Snapshot Down) нажат: предыдущий — Snapshot 3 (после Snapshot 1 — по кругу)');

    const bypass = new Stomp({ fs3Function: 'allBypass' });
    expect(bypass.send(cc(51, 127)).text).toContain('All Bypass включён');
    expect(bypass.state.allBypass).toBe(true);

    const exp = new Stomp({ fs3Function: 'toggleExp' });
    expect(exp.send(cc(51, 127)).text).toContain('активная педаль переключена EXP 1 ↔ EXP 2');
  });

  it('FS4 по умолчанию — All Bypass; у FS4 и FS5 любое значение — нажатие', () => {
    const d = new Stomp();
    applied(
      d.send(cc(52, 127)),
      'FS4 (All Bypass): All Bypass включён — Analog Bypass: сигнал идёт с входов на выходы через реле без обработки',
    );
    expect(d.state.allBypass).toBe(true);
    expect(d.state.footswitches[3]).toEqual({ pressed: false, stompHeld: false, lastPress: d.time });
    const exit = d.send(cc(52, 0));
    applied(exit);
    expect(exit.text).toBe(
      'FS4: All Bypass выключен — нажатие футсвитча только выключает All Bypass (у FS4 и FS5 любое значение — нажатие)',
    );
    expect(d.state.allBypass).toBe(false);
    expect(d.send(cc(52, 10)).text).toContain('All Bypass включён');
  });

  it('FS5 по умолчанию — Toggle EXP 1/2', () => {
    const d = new Stomp();
    const description = d.send(cc(53, 127));
    applied(description);
    expect(description.text).toContain('FS5 (Toggle EXP 1/2): активная педаль переключена EXP 1 ↔ EXP 2');
    expect(d.state.footswitches[4].lastPress).toBe(d.time);
  });

  it('FS4 с функцией Stomp 4 переключает назначения пресета нажатием и отпусканием сразу', () => {
    const d = new Stomp({ fs4Function: 'stomp' });
    expect(d.send(cc(52, 127)).text).toContain('FS4 (Stomp 4): переключены блоки и команды, назначенные на FS4');
    expect(d.state.footswitches[3]).toMatchObject({ pressed: false, stompHeld: false });
  });

  it('FS4 и FS5 с функцией TAP/Tuner — удары Tap Tempo', () => {
    const d = new Stomp({ fs4Function: 'tapTuner', fs5Function: 'tapTuner' });
    d.send(cc(52, 127), 500);
    applied(
      d.send(cc(53, 0), 500),
      'FS5 (TAP/Tuner) — Tap Tempo: удар 2, темп 120.0 BPM (у FS4 и FS5 любое значение — нажатие)',
    );
  });

  it('Bank Up и Bank Down ставят банк в очередь до выбора пресета', () => {
    const d = new Stomp({ fs4Function: 'bankUp', fs5Function: 'bankDown' });
    d.send(pc(47));
    const up = d.send(cc(52, 127));
    applied(up, 'FS4 (Bank Up): банк 17 в очереди — пресеты 17A–17C мигают в режиме Preset до выбора (вывод)');
    expect(d.state).toMatchObject({ footswitchMode: 'preset', bankQueue: { bank: 17, returnMode: 'stomp' } });
    expect(d.state.preset?.label).toBe('16C');
    expect(d.state.switches.map((s) => s.label)).toEqual([
      { kind: 'preset', index: 48, label: '17A', current: false, blinking: true },
      { kind: 'preset', index: 49, label: '17B', current: false, blinking: true },
      { kind: 'preset', index: 50, label: '17C', current: false, blinking: true },
    ]);
    expect(d.state.switches.every((s) => s.ring.light === 'dim' && s.ring.color === 'white')).toBe(true);
    d.send(cc(52, 127));
    d.send(cc(53, 127));
    expect(d.state.bankQueue).toEqual({ bank: 17, returnMode: 'stomp' });
    applied(
      d.send(cc(50, 127)),
      'FS2 нажат: загружен пресет 17B из банка в очереди; снапшот — сохранённый в пресете; режим футсвитчей — Stomp',
    );
    expect(d.state).toMatchObject({
      preset: { label: '17B' },
      bankQueue: null,
      footswitchMode: 'stomp',
      snapshot: null,
    });
    ignored(d.send(cc(50, 0)), 'FS2 отпущен — без действия');
  });

  it('Bank Up переходит с банка 42 на банк 1, Bank Down — с 1 на 42', () => {
    const d = new Stomp({ fs4Function: 'bankUp', fs5Function: 'bankDown' });
    d.send(pc(125));
    applied(
      d.send(cc(52, 127)),
      'FS4 (Bank Up): банк 1 в очереди — пресеты 01A–01C мигают в режиме Preset до выбора (вывод)',
    );
    expect(d.state.bankQueue?.bank).toBe(1);
    applied(
      d.send(cc(53, 127)),
      'FS5 (Bank Down): банк 42 в очереди — пресеты 42A–42C мигают в режиме Preset до выбора (вывод)',
    );
    d.send(cc(53, 127));
    expect(d.state.bankQueue?.bank).toBe(41);
  });

  it('очередь банка снимают PC, Preset Up/Down и смена режима', () => {
    const d = new Stomp({ fs4Function: 'bankUp', initialMode: 'snapshot' });
    d.sendAll([pc(0), cc(52, 127)]);
    expect(d.send(pc(30)).text).toBe(
      'Пресет 11A загружен; снапшот — сохранённый в пресете; очередь банка снята, режим футсвитчей — Snapshot',
    );
    expect(d.state).toMatchObject({ bankQueue: null, footswitchMode: 'snapshot' });
    d.send(cc(52, 127));
    d.send(cc(72, 127));
    expect(d.state).toMatchObject({ bankQueue: null, footswitchMode: 'snapshot', preset: { label: '11B' } });
    d.send(cc(52, 127));
    applied(d.send(cc(71, 2)), 'Footswitch Mode: Preset; очередь банка снята (по руководствам 2.65/3.0)');
    expect(d.state).toMatchObject({ bankQueue: null, footswitchMode: 'preset' });
  });

  it('Bank Up при неизвестном пресете ставит в очередь неизвестный банк', () => {
    const d = new Stomp({ fs4Function: 'bankUp' });
    expect(d.send(cc(52, 127)).text).toContain('номер неизвестен');
    expect(d.state.bankQueue).toEqual({ bank: null, returnMode: 'stomp' });
    expect(d.state.switches.map((s) => s.label.kind)).toEqual(['unknown', 'unknown', 'unknown']);
    d.send(cc(51, 127));
    expect(d.state).toMatchObject({ preset: null, bankQueue: null, footswitchMode: 'stomp' });
  });

  it('Next и Previous Footswitch Mode перебирают режимы по кругу', () => {
    const d = new Stomp({ fs4Function: 'nextMode', fs5Function: 'prevMode' });
    applied(d.send(cc(52, 127)), 'FS4 (Next Footswitch Mode): режим футсвитчей Scroll');
    d.sendAll([cc(52, 127), cc(52, 127)]);
    expect(d.state.footswitchMode).toBe('snapshot');
    d.send(cc(52, 127));
    expect(d.state.footswitchMode).toBe('stomp');
    applied(d.send(cc(53, 127)), 'FS5 (Previous Footswitch Mode): режим футсвитчей Snapshot');
  });

  it('нажатие при открытом Tuner или включённом All Bypass только выключает их', () => {
    const d = new Stomp({ fs3Function: 'presetUp' });
    d.sendAll([pc(0), cc(68, 127)]);
    applied(d.send(cc(51, 127)), 'FS3 нажат: Tuner закрыт — нажатие футсвитча только закрывает тюнер');
    expect(d.state).toMatchObject({ tuner: false, preset: { label: '01A' } });
    ignored(d.send(cc(51, 0)), 'отпущен — без действия');
    d.sendAll([cc(70, 0), cc(68, 0)]);
    d.send(cc(49, 127));
    expect(d.state).toMatchObject({ tuner: false, allBypass: true });
    expect(d.state.footswitches[0].stompHeld).toBe(false);
    d.send(cc(49, 0));
    applied(d.send(cc(53, 127)), 'FS5: All Bypass выключен — нажатие футсвитча только выключает All Bypass');
    expect(d.state.allBypass).toBe(false);
  });

  it('смена пресета снимает удерживаемые назначения прежнего пресета', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(49, 127), pc(1)]);
    expect(d.state.footswitches[0]).toMatchObject({ pressed: true, stompHeld: false });
    ignored(d.send(cc(49, 0)), 'FS1 отпущен — без действия');
  });
});

describe('CC60–CC66 — 1 Switch Looper', () => {
  it('Record, Play, Overdub, Stop меняют состояние и кольцо', () => {
    const d = new Stomp();
    expect(d.state.looper?.ring).toEqual({ light: 'dim', color: 'white' });
    applied(d.send(cc(60, 127)), 'Looper: запись');
    expect(d.state.looper).toMatchObject({ status: 'recording', since: d.time, ring: { light: 'on', color: 'red' } });
    applied(d.send(cc(61, 127)), 'Looper: запись завершена, воспроизведение');
    expect(d.state.looper).toMatchObject({ status: 'playing', ring: { light: 'on', color: 'green' } });
    applied(d.send(cc(60, 0)), 'Looper: Overdub');
    expect(d.state.looper).toMatchObject({
      status: 'overdubbing',
      undo: 'undo',
      ring: { light: 'on', color: 'amber' },
    });
    applied(d.send(cc(61, 0)), 'Looper: остановлен');
    expect(d.state.looper).toMatchObject({ status: 'stopped', ring: { light: 'on', color: 'white' } });
    applied(d.send(cc(61, 64)), 'Looper: воспроизведение');
    applied(d.send(cc(60, 127)), 'Looper: запись новой петли вместо прежней (вывод)');
    expect(d.state.looper).toMatchObject({ status: 'recording', undo: 'none' });
    applied(d.send(cc(60, 0)), 'Looper: запись завершена, Overdub');
    applied(d.send(cc(61, 127)), 'Looper: Overdub завершён, воспроизведение');
  });

  it('Play Once проигрывает петлю один раз, Play — снова по кругу', () => {
    const d = new Stomp();
    d.send(cc(60, 127));
    applied(d.send(cc(62, 127)), 'Looper: запись завершена, Play Once — петля проиграется один раз');
    expect(d.state.looper).toMatchObject({ status: 'playing', playOnce: true });
    applied(d.send(cc(62, 127)), 'Looper: Play Once — петля проиграется один раз с начала');
    applied(d.send(cc(61, 127)), 'Looper: воспроизведение по кругу вместо Play Once');
    expect(d.state.looper?.playOnce).toBe(false);
    d.send(cc(61, 0));
    applied(d.send(cc(62, 100)));
    expect(d.state.looper).toMatchObject({ status: 'playing', playOnce: true });
  });

  it('Undo отменяет последний слой Overdub, Redo возвращает его', () => {
    const d = new Stomp();
    d.sendAll([cc(60, 127), cc(61, 127)]);
    ignored(d.send(cc(63, 127)), 'отменять нечего');
    d.send(cc(60, 0));
    applied(d.send(cc(63, 127)), 'Looper: Undo — текущий слой Overdub отменён, воспроизведение (вывод)');
    expect(d.state.looper).toMatchObject({ status: 'playing', undo: 'redo' });
    applied(d.send(cc(63, 127)), 'Looper: Redo — слой Overdub возвращён');
    applied(d.send(cc(63, 127)), 'Looper: Undo — последний слой Overdub отменён');
    expect(d.state.looper?.undo).toBe('redo');
  });

  it('CC65 — Forward/Reverse, CC66 — Full/Half Speed', () => {
    const d = new Stomp();
    applied(d.send(cc(65, 127)), 'Looper: Reverse');
    expect(d.state.looper?.reverse).toBe(true);
    ignored(d.send(cc(65, 64)), 'Looper: уже Reverse');
    d.expectUnchanged();
    applied(d.send(cc(65, 63)), 'Looper: Forward');
    applied(d.send(cc(66, 127)), 'Looper: Half Speed');
    expect(d.state.looper?.halfSpeed).toBe(true);
    ignored(d.send(cc(66, 100)), 'Looper: уже Half Speed');
    applied(d.send(cc(66, 0)), 'Looper: Full Speed');
    expect(d.state.looper).toMatchObject({ reverse: false, halfSpeed: false });
  });

  it('команды без петли и повторы — без действия', () => {
    const d = new Stomp();
    for (const [controller, value, part] of [
      [60, 0, 'Looper Overdub: петли нет'],
      [61, 127, 'Looper Play: петли нет'],
      [61, 0, 'Looper Stop: петли нет'],
      [62, 127, 'Looper Play Once: петли нет'],
      [63, 127, 'отменять нечего'],
    ] as const) {
      ignored(d.send(cc(controller, value)), part);
      d.expectUnchanged();
    }
    d.send(cc(60, 127));
    ignored(d.send(cc(60, 127)), 'запись уже идёт');
    d.send(cc(61, 127));
    ignored(d.send(cc(61, 127)), 'воспроизведение уже идёт');
    d.send(cc(60, 0));
    ignored(d.send(cc(60, 10)), 'Overdub уже идёт');
    d.send(cc(61, 0));
    ignored(d.send(cc(61, 0)), 'уже остановлен');
  });

  it('CC60, CC61, CC65, CC66 делят значения на 0–63 и 64–127', () => {
    const d = new Stomp();
    applied(d.send(cc(60, 64)), 'Looper: запись');
    applied(d.send(cc(60, 63)), 'Looper: запись завершена, Overdub');
    applied(d.send(cc(61, 63)), 'Looper: остановлен');
    applied(d.send(cc(61, 64)), 'Looper: воспроизведение');
    applied(d.send(cc(65, 64)), 'Looper: Reverse');
    applied(d.send(cc(65, 63)), 'Looper: Forward');
    applied(d.send(cc(66, 64)), 'Looper: Half Speed');
    applied(d.send(cc(66, 63)), 'Looper: Full Speed');
  });

  it('CC62 и CC63 со значениями 0–63 — без действия', () => {
    const d = new Stomp();
    d.sendAll([cc(60, 127), cc(61, 127), cc(60, 0)]);
    ignored(d.send(cc(62, 63)), 'CC#62 = 63: Play Once срабатывает от значений 64–127');
    d.expectUnchanged();
    ignored(d.send(cc(63, 0)), 'CC#63 = 0: Undo/Redo срабатывает от значений 64–127');
    d.expectUnchanged();
  });

  it('без 1 Switch Looper в пресетах команды лупера не действуют', () => {
    const d = new Stomp({ looper: false });
    for (const controller of [60, 61, 62, 63, 65, 66]) {
      ignored(d.send(cc(controller, 127)), 'в пресете нет 1 Switch Looper');
      d.expectUnchanged();
    }
  });

  it('смена пресета не останавливает петлю: тот же лупер есть во всех пресетах', () => {
    const d = new Stomp();
    d.sendAll([cc(60, 127), cc(61, 127), pc(3)]);
    applied(d.send(cc(72, 127)), 'Preset Up: загружен пресет 02B; снапшот — сохранённый в пресете');
    expect(d.state.looper?.status).toBe('playing');
  });
});

describe('CC64 — Tap Tempo', () => {
  it('задаёт темп по интервалам между ударами', () => {
    const d = new Stomp();
    applied(d.send(cc(64, 127), 1000), 'Tap Tempo: удар 1 — темп задаст следующий удар');
    expect(d.state.tempo).toMatchObject({ bpm: null, tap: { count: 1 } });
    applied(d.send(cc(64, 127), 500), 'Tap Tempo: удар 2, темп 120.0 BPM');
    applied(d.send(cc(64, 64), 500), 'Tap Tempo: удар 3, темп 120.0 BPM');
    expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'tap', beatTime: d.time, tap: { count: 3 } });
    applied(d.send(cc(64, 127), 400), 'Tap Tempo: удар 4, темп 128.6 BPM');
  });

  it('учитывает последние пять ударов серии', () => {
    const d = new Stomp();
    for (let i = 0; i < 5; i++) {
      d.send(cc(64, 127), 1000);
    }
    expect(d.state.tempo.bpm).toBe(60);
    applied(d.send(cc(64, 127), 500), 'Tap Tempo: удар 6, темп 68.6 BPM');
    for (let i = 0; i < 3; i++) {
      d.send(cc(64, 127), 500);
    }
    expect(d.state.tempo).toMatchObject({ bpm: 120, tap: { count: 9 } });
    expect(d.state.tempo.tap.times).toHaveLength(5);
  });

  it('удар после паузы дольше 1,5 с начинает новую серию: темп ниже 40 BPM не задаётся', () => {
    const d = new Stomp();
    d.sendAll([cc(64, 127), cc(64, 127)], 500);
    applied(d.send(cc(64, 127), 1500), 'Tap Tempo: удар 3, темп 60.0 BPM');
    const description = d.send(cc(64, 127), 1501);
    applied(description);
    expect(description.text).toContain('удар 1 новой серии');
    expect(d.state.tempo).toMatchObject({ bpm: 60, tap: { count: 1, times: [d.time] } });
  });

  it('значения 0–63 — без действия', () => {
    const d = new Stomp();
    ignored(d.send(cc(64, 63)), 'CC#64 = 63: Tap Tempo срабатывает от значений 64–127');
    d.expectUnchanged();
  });

  it('удар в тот же момент, что и предыдущий, — без действия', () => {
    const d = new Stomp();
    d.send(cc(64, 127));
    ignored(d.send(cc(64, 127), 0), 'в момент предыдущего');
  });
});

describe('CC68 — Tuner', () => {
  it('любое значение открывает и закрывает Tuner', () => {
    const d = new Stomp();
    applied(d.send(cc(68, 0)), 'Tuner открыт');
    expect(d.state.tuner).toBe(true);
    expect(d.state.switches.every((s) => s.ring.light === 'tuner')).toBe(true);
    applied(d.send(cc(68, 127)), 'Tuner закрыт');
    expect(d.state.tuner).toBe(false);
    applied(d.send(cc(68, 64)), 'Tuner открыт');
  });
});

describe('CC70 — All Bypass', () => {
  it('0–63 включает All Bypass, 64–127 выключает', () => {
    const d = new Stomp();
    applied(
      d.send(cc(70, 0)),
      'All Bypass включён — Analog Bypass: сигнал идёт с входов на выходы через реле без обработки',
    );
    expect(d.state.allBypass).toBe(true);
    expect(d.state.switches.every((s) => s.ring.light === 'off')).toBe(true);
    ignored(d.send(cc(70, 63)), 'All Bypass уже включён');
    d.expectUnchanged();
    applied(d.send(cc(70, 64)), 'All Bypass выключен: обработка включена');
    expect(d.state.allBypass).toBe(false);
    ignored(d.send(cc(70, 127)), 'All Bypass уже выключен');
  });

  it('описывает DSP Bypass по Bypass Type', () => {
    const d = new Stomp({ bypassType: 'dsp' });
    applied(d.send(cc(70, 0)), 'All Bypass включён — DSP Bypass: хвосты задержек и реверберации затухают естественно');
  });
});

describe('CC71 — Footswitch Mode', () => {
  it('0–3 выбирают Stomp, Scroll, Preset, Snapshot', () => {
    const d = new Stomp();
    for (const [value, mode, name] of [
      [1, 'scroll', 'Scroll'],
      [2, 'preset', 'Preset'],
      [3, 'snapshot', 'Snapshot'],
      [0, 'stomp', 'Stomp'],
    ] as const) {
      applied(d.send(cc(71, value)), `Footswitch Mode: ${name} (по руководствам 2.65/3.0)`);
      expect(d.state.footswitchMode).toBe(mode);
    }
  });

  it('4 и 5 — следующий и предыдущий режим по кругу', () => {
    const d = new Stomp({ initialMode: 'snapshot' });
    applied(d.send(cc(71, 4)), 'Footswitch Mode: следующий — Stomp (по руководствам 2.65/3.0)');
    applied(d.send(cc(71, 5)), 'Footswitch Mode: предыдущий — Snapshot (по руководствам 2.65/3.0)');
    expect(d.state.footswitchMode).toBe('snapshot');
  });

  it('текущий режим и значения 6–127 — без действия', () => {
    const d = new Stomp();
    ignored(d.send(cc(71, 0)), 'Footswitch Mode уже Stomp');
    d.expectUnchanged();
    for (const value of [6, 9, 127]) {
      ignored(d.send(cc(71, value)), `CC#71 = ${value}: значение вне диапазона 0–5`);
      d.expectUnchanged();
    }
  });
});

describe('CC72 — Preset Up/Down', () => {
  it('0–63 загружает предыдущий пресет, 64–127 — следующий, по кругу', () => {
    const d = new Stomp();
    d.send(pc(125));
    applied(
      d.send(cc(72, 127)),
      'Preset Up: загружен пресет 01A (после 42C — по кругу); снапшот — сохранённый в пресете',
    );
    applied(
      d.send(cc(72, 0)),
      'Preset Down: загружен пресет 42C (после 01A — по кругу); снапшот — сохранённый в пресете',
    );
    applied(d.send(cc(72, 63)), 'Preset Down: загружен пресет 42B; снапшот — сохранённый в пресете');
    applied(d.send(cc(72, 64)), 'Preset Up: загружен пресет 42C; снапшот — сохранённый в пресете');
    expect(d.state).toMatchObject({ preset: { index: 125 }, presetLoading: true, snapshot: null });
    applied(d.send(cc(69, 0)), 'Snapshot 1 — выполнен после загрузки пресета 42C');
  });

  it('при неизвестном пресете загружает неизвестный пресет', () => {
    const d = new Stomp();
    d.sendAll([cc(75, 1), cc(72, 127)]);
    expect(d.state).toMatchObject({ preset: null, edited: false, knobs: [null, null, null] });
  });

  it('меняет пресет под открытым Tuner и при All Bypass', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(68, 0)]);
    applied(
      d.send(cc(72, 127)),
      'Preset Up: загружен пресет 01B; снапшот — сохранённый в пресете (Tuner остаётся открыт)',
    );
    d.sendAll([cc(68, 0), cc(70, 0)]);
    applied(
      d.send(cc(72, 0)),
      'Preset Down: загружен пресет 01A; снапшот — сохранённый в пресете (All Bypass остаётся включён)',
    );
    expect(d.state).toMatchObject({ tuner: false, allBypass: true, preset: { label: '01A' } });
  });
});

describe('CC73 — Play view и Edit view', () => {
  it('любое значение переключает вид', () => {
    const d = new Stomp();
    applied(d.send(cc(73, 0)), 'Edit view');
    expect(d.state.view).toBe('edit');
    applied(d.send(cc(73, 127)), 'Play view');
    expect(d.state.view).toBe('play');
  });
});

describe('CC74 — сохранение пресета', () => {
  it('сохраняет пресет: значок «E» пропадает', () => {
    const d = new Stomp();
    d.sendAll([pc(0), cc(77, 30)]);
    expect(d.state.edited).toBe(true);
    applied(d.send(cc(74, 0)), 'Пресет 01A сохранён (сохранение по CC74 — по release notes 3.15)');
    expect(d.state.edited).toBe(false);
    applied(d.send(cc(74, 127)));
    d.expectUnchanged();
    expect(new Stomp().send(cc(74, 1)).text).toContain('номер неизвестен');
  });
});

describe('CC75–CC77 — Knob 1–3', () => {
  it('задают параметр текущей страницы выбранного блока и отмечают правку', () => {
    const d = new Stomp();
    d.send(pc(0));
    applied(
      d.send(cc(75, 127)),
      'Knob 1: параметр на текущей странице выбранного блока — 100 % диапазона (изменение видно в Edit view)',
    );
    d.send(cc(73, 0));
    applied(d.send(cc(76, 32)), 'Knob 2: параметр на текущей странице выбранного блока — 25 % диапазона');
    applied(d.send(cc(77, 0)), 'Knob 3: параметр на текущей странице выбранного блока — 0 % диапазона');
    expect(d.state).toMatchObject({ knobs: [127, 32, 0], edited: true });
  });
});

describe('CC81 — PAGE', () => {
  it('в Play view меняет режим футсвитчей по кругу', () => {
    const d = new Stomp();
    applied(d.send(cc(81, 127)), 'PAGE>: режим футсвитчей Scroll (вывод)');
    applied(d.send(cc(81, 0)), '<PAGE: режим футсвитчей Stomp (вывод)');
    applied(d.send(cc(81, 63)), '<PAGE: режим футсвитчей Snapshot (вывод)');
    expect(d.state.footswitchMode).toBe('snapshot');
  });

  it('в Play view снимает очередь банка', () => {
    const d = new Stomp({ fs4Function: 'bankUp' });
    d.sendAll([pc(0), cc(52, 127)]);
    applied(d.send(cc(81, 64)), 'PAGE>: режим футсвитчей Snapshot (вывод); очередь банка снята');
    expect(d.state).toMatchObject({ footswitchMode: 'snapshot', bankQueue: null });
  });

  it('в Edit view листает страницы параметров: значения ручек становятся неизвестны', () => {
    const d = new Stomp();
    d.sendAll([cc(73, 0), cc(75, 10)]);
    applied(d.send(cc(81, 64)), 'PAGE>: следующая страница параметров выбранного блока (вывод)');
    expect(d.state).toMatchObject({ footswitchMode: 'stomp', knobs: [null, null, null] });
    applied(d.send(cc(81, 0)), '<PAGE: предыдущая страница параметров выбранного блока (вывод)');
    d.expectUnchanged();
  });

  it('на экране Tuner листает страницы его настроек без перехода через край', () => {
    const d = new Stomp();
    d.send(cc(68, 127));
    expect(d.state.tunerPage).toBe(1);
    ignored(d.send(cc(81, 0)), '<PAGE: Tuner уже на первой странице настроек');
    d.expectUnchanged();
    const page3 = 'страница настроек 3 — String 5 Offset, String 4 Offset, String 3 Offset (вывод)';
    applied(d.send(cc(81, 127)), 'PAGE>: Tuner, страница настроек 2 — Trails, Offsets, String 6 Offset (вывод)');
    applied(d.send(cc(81, 127)), `PAGE>: Tuner, ${page3}`);
    applied(d.send(cc(81, 127)), 'PAGE>: Tuner, страница настроек 4 — String 2 Offset, String 1 Offset (вывод)');
    ignored(d.send(cc(81, 127)), 'PAGE>: Tuner уже на последней странице настроек');
    d.expectUnchanged();
    applied(d.send(cc(81, 0)), `<PAGE: Tuner, ${page3}`);
    expect(d.state).toMatchObject({ tunerPage: 3, footswitchMode: 'stomp', tuner: true });
    d.sendAll([cc(68, 0), cc(68, 0)]);
    expect(d.state).toMatchObject({ tuner: true, tunerPage: 1 });
  });
});

describe('пользовательские CC', () => {
  it('действуют только по назначениям пресета', () => {
    const d = new Stomp();
    for (const controller of [4, 20, 31, 33, 48, 82, 100, 119]) {
      const description = d.send(cc(controller, 127));
      applied(
        description,
        `Пользовательский CC#${controller}: действует, только если назначен в пресете ` +
          '(Bypass Assign — блок включается; Controller Assign — 100 % диапазона параметра)',
      );
      d.expectUnchanged();
    }
    expect(d.send(cc(20, 0)).text).toContain('блок выключается; Controller Assign — 0 %');
  });

  it('CC120–CC127 у HX Stomp — тоже пользовательские', () => {
    const d = new Stomp();
    const description = d.send(cc(123, 0));
    applied(description);
    expect(description.text).toContain('CC#123 (All Notes Off) — у HX Stomp пользовательский CC (вывод)');
  });
});

describe('MIDI Clock', () => {
  it('следует внешнему клоку: темп, доли и синее мигание TAP', () => {
    const d = new Stomp();
    d.sendAll([cc(64, 127), cc(64, 127)], 500);
    applied(
      d.send(CLOCK, 100),
      'MIDI Clock: HX Stomp следует внешнему клоку — кольцо TAP мигает синим, Tap Tempo не действует',
    );
    const first = d.time;
    expect(d.state.tempo).toMatchObject({ source: 'clock', beatTime: first, clock: { ticks: 1, lastTick: first } });
    expect(d.state.tempo.own).toEqual({ bpm: 120, source: 'tap', beatTime: first - 100 });
    expect(d.state.switches[2].ring).toEqual({ light: 'tempo', color: 'blue' });
    applied(d.send(CLOCK, TICK_120), 'MIDI Clock: темп определяется');
    let last = d.send(CLOCK, TICK_120);
    for (let i = 3; i < 25; i++) {
      last = d.send(CLOCK, TICK_120);
    }
    expect(last.text).toBe('MIDI Clock: темп 120.0 BPM');
    expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'clock', clock: { ticks: 25 } });
    expect(d.state.tempo.beatTime).toBeCloseTo(first + 24 * TICK_120, 1);
  });

  it('без кольца TAP не упоминает его синее мигание', () => {
    const text = 'MIDI Clock: HX Stomp следует внешнему клоку — Tap Tempo не действует';
    applied(new Stomp({ fs3Function: 'stomp' }).send(CLOCK), text);
    const d = new Stomp({ tapLed: false });
    applied(d.send(CLOCK), text);
    expect(d.state.tempo.clock).toEqual({ ticks: 1, lastTick: d.time });
  });

  it('удары Tap Tempo при следовании клоку не действуют', () => {
    const d = new Stomp();
    d.sendAll([CLOCK, CLOCK], TICK_120);
    ignored(d.send(cc(64, 127), 5), 'Tap Tempo не действует: темп задаёт внешний MIDI Clock (по форуму Line 6)');
    expect(d.state.tempo.tap.count).toBe(0);
  });

  it('после паузы клока дольше 250 мс возвращается к собственному темпу', () => {
    const d = new Stomp();
    d.sendAll([cc(64, 127), cc(64, 127)], 500);
    d.sendAll(Array.from({ length: 10 }, () => CLOCK), TICK_120);
    const description = d.send(cc(3, 0), 300);
    ignored(description);
    expect(description.text).toContain('; MIDI Clock пропал — темп снова собственный');
    expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'tap', own: null, clock: null });
    expect(d.state.switches[2].ring).toEqual({ light: 'tempo', color: 'red' });
    applied(d.send(CLOCK, 1000));
    expect(d.state.tempo.clock?.ticks).toBe(1);
  });

  it('импульс после паузы начинает следование заново', () => {
    const d = new Stomp();
    d.sendAll([CLOCK, CLOCK, CLOCK], TICK_120);
    const description = d.send(CLOCK, 400);
    expect(description.text).toContain('HX Stomp следует внешнему клоку');
    expect(d.state.tempo.clock).toEqual({ ticks: 1, lastTick: d.time });
  });

  it('пока прибор следует клоку, смена пресета меняет только собственный темп', () => {
    const d = new Stomp();
    d.sendAll([cc(64, 127), cc(64, 127)], 500);
    d.sendAll([CLOCK, CLOCK], TICK_120);
    d.send(pc(3), 5);
    expect(d.state.tempo).toMatchObject({ source: 'clock', own: { bpm: null, source: 'preset', beatTime: null } });
    d.send(cc(3, 0), 1000);
    expect(d.state.tempo).toMatchObject({ bpm: null, source: 'preset', clock: null });
  });

  it('принимает клок только по Rx MIDI Clock', () => {
    const off = new Stomp({ rxClock: 'off' });
    ignored(off.send(CLOCK), 'Rx MIDI Clock = Off: MIDI Clock не принимается');
    off.expectUnchanged();
    ignored(new Stomp({ rxClock: 'usb' }).send(CLOCK), 'Rx MIDI Clock = USB: MIDI Clock с MIDI IN не принимается');
    applied(new Stomp({ rxClock: 'midi' }).send(CLOCK));
    applied(new Stomp({ rxClock: 'usb', port: 'usb' }).send(CLOCK));
  });

  it('выключение приёма клока в настройках возвращает собственный темп', () => {
    const d = new Stomp();
    d.sendAll([cc(64, 127), cc(64, 127)], 500);
    d.sendAll([CLOCK, CLOCK], TICK_120);
    d.configure({ rxClock: 'off' });
    expect(d.state.tempo).toMatchObject({ bpm: 120, source: 'tap', clock: null, own: null });
  });
});

describe('сообщения вне MIDI-реализации', () => {
  it('ноты, Pitch Bend, Aftertouch и SysEx не поддерживаются', () => {
    const d = new Stomp();
    for (const [bytes, name] of [
      [[0x90, 60, 100], 'Note On'],
      [[0x90, 60, 0], 'Note On'],
      [[0x80, 60, 0], 'Note Off'],
      [[0xe0, 0, 0x40], 'Pitch Bend'],
      [[0xd0, 10], 'Channel Aftertouch'],
      [[0xa0, 60, 10], 'Polyphonic Aftertouch'],
      [[0xf0, 0x00, 0x01, 0x0c, 0x01, 0xf7], 'System Exclusive'],
    ] as const) {
      const description = d.send([...bytes]);
      expect(description).toEqual({
        text: expect.stringContaining(`${name} не входит в MIDI-реализацию HX Stomp 3.80`),
        effect: 'unsupported',
      });
      d.expectUnchanged();
    }
  });

  it('транспорт MIDI и прочие системные сообщения — без действия', () => {
    const d = new Stomp();
    for (const [bytes, name] of [
      [[0xfa], 'Start'],
      [[0xfb], 'Continue'],
      [[0xfc], 'Stop'],
      [[0xf2, 0, 0], 'Song Position Pointer'],
      [[0xf1, 0x10], 'MTC Quarter Frame'],
      [[0xf3, 1], 'Song Select'],
      [[0xf6], 'Tune Request'],
      [[0xfe], 'Active Sensing'],
      [[0xff], 'System Reset'],
    ] as const) {
      ignored(d.send([...bytes]), `${name} не используется HX Stomp 3.80`);
      d.expectUnchanged();
    }
  });

  it('некорректное сообщение не принимается', () => {
    const d = new Stomp();
    expect(d.send([0xb0, 1]).effect).toBe('unsupported');
    d.expectUnchanged();
  });
});

describe('подписи и кольца футсвитчей', () => {
  it('Scroll: PRESET ∨ и PRESET ∧ с тускло-белыми кольцами, FS3 — TAP/TUNER', () => {
    const d = new Stomp({ initialMode: 'scroll' });
    expect(d.state.switches).toEqual([
      { label: { kind: 'text', text: 'PRESET ∨', color: 'white' }, ring: { light: 'dim', color: 'white' } },
      { label: { kind: 'text', text: 'PRESET ∧', color: 'white' }, ring: { light: 'dim', color: 'white' } },
      { label: { kind: 'text', text: 'TAP/TUNER', color: 'red' }, ring: { light: 'tempo', color: 'red' } },
    ]);
  });

  it('Preset: пресеты банка, кольцо загруженного — красное, остальных — тускло-белое', () => {
    const d = new Stomp({ initialMode: 'preset' });
    expect(d.state.switches.map((s) => s.label.kind)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(d.state.switches[0].ring.light).toBe('unknown');
    d.send(pc(46));
    const dim = { light: 'dim', color: 'white' };
    const red = { light: 'on', color: 'red' };
    expect(d.state.switches).toEqual([
      { label: { kind: 'preset', index: 45, label: '16A', current: false, blinking: false }, ring: dim },
      { label: { kind: 'preset', index: 46, label: '16B', current: true, blinking: false }, ring: red },
      { label: { kind: 'preset', index: 47, label: '16C', current: false, blinking: false }, ring: dim },
    ]);
  });

  it('Snapshot: горит кольцо выбранного снапшота, остальные — тускло-белые', () => {
    const d = new Stomp({ initialMode: 'snapshot' });
    d.send(pc(0));
    expect(d.state.switches.map((s) => s.ring.light)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(d.state.switches[0].label).toEqual({ kind: 'snapshot', snapshot: 1, current: null });
    d.send(cc(69, 1));
    expect(d.state.switches).toEqual([
      { label: { kind: 'snapshot', snapshot: 1, current: false }, ring: { light: 'dim', color: 'white' } },
      { label: { kind: 'snapshot', snapshot: 2, current: true }, ring: { light: 'on', color: null } },
      { label: { kind: 'snapshot', snapshot: 3, current: false }, ring: { light: 'dim', color: 'white' } },
    ]);
  });

  it('FS3 показывает функцию FS3 Function; Tap LED = Off гасит кольцо TAP', () => {
    expect(new Stomp({ fs3Function: 'snapshotUp' }).state.switches[2]).toEqual({
      label: { kind: 'function', name: 'Snapshot Up' },
      ring: { light: 'unknown', color: null },
    });
    expect(new Stomp({ fs3Function: 'stomp' }).state.switches[2].label).toEqual({ kind: 'assignment' });
    expect(new Stomp({ tapLed: false }).state.switches[2].ring).toEqual({ light: 'off', color: null });
  });

  it('банк в очереди: все три кольца тускло-белые, даже при неизвестном банке', () => {
    const dim = { light: 'dim', color: 'white' };
    const known = new Stomp({ fs4Function: 'bankDown' });
    known.sendAll([pc(46), cc(52, 127)]);
    expect(known.state.switches.map((s) => s.ring)).toEqual([dim, dim, dim]);
    const unknown = new Stomp({ fs4Function: 'bankUp' });
    unknown.send(cc(52, 127));
    expect(unknown.state.switches.map((s) => s.ring)).toEqual([dim, dim, dim]);
  });

  it('All Bypass гасит все кольца, в том числе TAP; открытый Tuner показывает на них настройку', () => {
    const off = { light: 'off', color: null };
    const stomp = new Stomp();
    stomp.sendAll([cc(64, 127), cc(64, 127), cc(70, 0)], 500);
    expect(stomp.state.switches.map((s) => s.ring)).toEqual([off, off, off]);
    expect(stomp.state.switches[2].label).toEqual({ kind: 'text', text: 'TAP/TUNER', color: 'red' });
    const preset = new Stomp({ initialMode: 'preset' });
    preset.sendAll([pc(46), cc(70, 0)]);
    expect(preset.state.switches.map((s) => s.ring)).toEqual([off, off, off]);
    preset.send(cc(68, 0));
    expect(preset.state.switches.every((s) => s.ring.light === 'tuner')).toBe(true);
    preset.sendAll([cc(68, 0), cc(70, 127)]);
    expect(preset.state.switches[1].ring).toEqual({ light: 'on', color: 'red' });
  });
});

describe('applySettings', () => {
  it('переобозначает пресет по Preset Number и сохраняет остальное состояние', () => {
    const d = new Stomp();
    d.sendAll([pc(122), cc(69, 2), cc(71, 2)]);
    d.configure({ presetNumber: 'numbers' });
    expect(d.state).toMatchObject({ preset: { index: 122, label: '122' }, snapshot: 3, footswitchMode: 'preset' });
    expect(d.state.switches[2].label).toMatchObject({ kind: 'preset', label: '122', current: true });
  });

  it('добавляет и убирает лупер по настройке', () => {
    const d = new Stomp();
    d.send(cc(60, 127));
    d.configure({ looper: false });
    expect(d.state.looper).toBeNull();
    d.configure({ looper: true });
    expect(d.state.looper?.status).toBe('empty');
  });

  it('не меняет текущий режим футсвитчей при смене режима при включении', () => {
    const d = new Stomp();
    d.configure({ initialMode: 'preset' });
    expect(d.state.footswitchMode).toBe('stomp');
  });
});
