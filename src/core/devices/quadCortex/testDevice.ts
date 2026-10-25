/** Прогон MIDI-сообщений через модель Quad Cortex в тестах. */

import { expect } from 'vitest';
import { ClockTracker } from '../../clock.ts';
import { parseMidi } from '../../midi.ts';
import type { CommandDescription, DeviceSettings } from '../types.ts';
import { resolveSettings } from '../types.ts';
import type { QuadCortexState } from './engine.ts';
import { quadCortexEngine } from './engine.ts';

/** Время включения прибора в тестах, миллисекунды Unix-времени. */
export const START_TIME = Date.UTC(2026, 0, 1, 12);

/**
 * Quad Cortex на MIDI-канале 2 для тестов: хранит состояние модели, время
 * последнего сообщения и MIDI Clock, как монитор.
 *
 * Каждое сообщение проверяется: модель не меняет переданное состояние, новое
 * состояние без потерь проходит через JSON.
 */
export class TestDevice {
  state: QuadCortexState;
  /** Время последнего отправленного сообщения; до первого — {@link START_TIME}. */
  time = START_TIME;
  private readonly clock = new ClockTracker();

  /**
   * Создаёт только что включённый прибор.
   *
   * @param settings настройки; отсутствующие — по умолчанию.
   */
  constructor(settings: Partial<DeviceSettings> = {}) {
    this.state = quadCortexEngine.createState(resolveSettings(quadCortexEngine.settings, settings));
  }

  /**
   * Отправляет сообщение через `after` мс после предыдущего.
   *
   * @param bytes байты одного MIDI-сообщения.
   * @returns описание команды, которую выполнил прибор.
   */
  send(bytes: number[], after = 100): CommandDescription {
    this.time += after;
    const message = parseMidi(bytes);
    if (message.kind === 'clock') {
      this.clock.tick(this.time);
    } else if (message.kind === 'start' || message.kind === 'continue') {
      this.clock.start();
    } else if (message.kind === 'stop') {
      this.clock.stop();
    }
    const before = this.state;
    const snapshot = JSON.stringify(before);
    const result = quadCortexEngine.handle(before, message, { time: this.time, clock: this.clock.info() });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    this.state = result.state;
    return result.description;
  }

  /** Отправляет Control Change на канале 2 через `after` мс после предыдущего сообщения. */
  cc(controller: number, value: number, after = 100): CommandDescription {
    return this.send([0xb1, controller, value], after);
  }

  /** Отправляет Program Change на канале 2 через `after` мс после предыдущего сообщения. */
  pc(program: number, after = 100): CommandDescription {
    return this.send([0xc1, program], after);
  }

  /**
   * Отправляет `count` импульсов Timing Clock с темпом `bpm`; первый — через
   * `firstAfter` мс после предыдущего сообщения.
   *
   * @returns описание последнего импульса.
   */
  ticks(count: number, bpm: number, firstAfter = 60000 / (bpm * 24)): CommandDescription {
    let last: CommandDescription | null = null;
    for (let i = 0; i < count; i++) {
      last = this.send([0xf8], i === 0 ? firstAfter : 60000 / (bpm * 24));
    }
    if (last === null) {
      throw new Error('нужен хотя бы один импульс');
    }
    return last;
  }
}
