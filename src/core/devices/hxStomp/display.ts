/**
 * Отображение HX Stomp по его состоянию: подписи футсвитчей FS1–FS3 в Play
 * view, их LED-кольца и страницы настроек Tuner.
 */

import { presetLabel } from './presets.ts';
import { FS_FUNCTION_NAMES } from './settings.ts';
import type { HxRing, HxSnapshot, HxStompState, HxSwitchDisplay } from './state.ts';

/**
 * Названия настроек Tuner над Knob 1–3 на страницах 1–4, по порядку ручек;
 * на странице 4 их две. Надписи страницы 1 — как на экране прибора,
 * остальные — по таблице Tuner Settings руководства: экранные сокращения не
 * подтверждены.
 */
export const TUNER_PAGES: readonly (readonly string[])[] = [
  ['Output', 'Refrnc', 'Type'],
  ['Trails', 'Offsets', 'String 6 Offset'],
  ['String 5 Offset', 'String 4 Offset', 'String 3 Offset'],
  ['String 2 Offset', 'String 1 Offset'],
];

const OFF: HxRing = { light: 'off', color: null };
const UNKNOWN: HxRing = { light: 'unknown', color: null };
const TUNER: HxRing = { light: 'tuner', color: null };

/**
 * Кольцо невыбранного футсвитча режимов Scroll, Preset и Snapshot: PRESET ∨ и
 * PRESET ∧, незагруженного пресета, невыбранного снапшота. Значок такого
 * футсвитча на экране серый; физическое кольцо источники не описывают, по
 * умолчанию оно горит тускло-белым.
 */
const IDLE: HxRing = { light: 'dim', color: 'white' };

const SNAPSHOTS: readonly HxSnapshot[] = [1, 2, 3];

/** Места футсвитчей FS1–FS3 и пресетов A–C в банке. */
const POSITIONS: readonly number[] = [0, 1, 2];

function assignment(): HxSwitchDisplay {
  return { label: { kind: 'assignment' }, ring: UNKNOWN };
}

/** FS3 в режимах Stomp и Scroll — по настройке FS3 Function. */
function fs3(state: HxStompState): HxSwitchDisplay {
  const fn = state.settings.fs3Function;
  switch (fn) {
    case 'tapTuner':
      return {
        label: { kind: 'text', text: 'TAP/TUNER', color: 'red' },
        ring: state.settings.tapLed ? { light: 'tempo', color: state.tempo.clock ? 'blue' : 'red' } : OFF,
      };
    case 'stomp':
      return assignment();
    default:
      return { label: { kind: 'function', name: FS_FUNCTION_NAMES[fn] }, ring: UNKNOWN };
  }
}

function presetSwitches(state: HxStompState): HxSwitchDisplay[] {
  const queue = state.bankQueue;
  const bank = queue ? queue.bank : state.preset ? state.preset.bank : null;
  if (bank === null) {
    // Банк в очереди — соседний к текущему, загруженного пресета в нём нет.
    return POSITIONS.map(() => ({ label: { kind: 'unknown' }, ring: queue ? IDLE : UNKNOWN }));
  }
  return POSITIONS.map((position) => {
    const index = (bank - 1) * 3 + position;
    const current = state.preset !== null && state.preset.index === index;
    return {
      label: {
        kind: 'preset',
        index,
        label: presetLabel(index, state.settings.presetNumber),
        current,
        blinking: queue !== null,
      },
      ring: current && !queue ? { light: 'on', color: 'red' } : IDLE,
    };
  });
}

function snapshotSwitches(state: HxStompState): HxSwitchDisplay[] {
  const active = state.snapshot;
  return SNAPSHOTS.map((snapshot) => ({
    label: { kind: 'snapshot', snapshot, current: active === null ? null : active === snapshot },
    ring: active === null ? UNKNOWN : active === snapshot ? { light: 'on', color: null } : IDLE,
  }));
}

/**
 * Возвращает подписи и кольца FS1–FS3 по режиму футсвитчей.
 *
 * - Stomp: FS1 и FS2 — назначения пресета (неизвестны), FS3 — по FS3
 *   Function; TAP/Tuner — надпись `TAP/TUNER` и кольцо, мигающее в темпе
 *   красным или, пока прибор следует MIDI Clock, синим (при Tap LED = Off не
 *   горит).
 * - Scroll: `PRESET ∨`, `PRESET ∧` с тускло-белыми кольцами, FS3 — как в
 *   Stomp.
 * - Preset: пресеты A–C текущего банка, кольцо загруженного — красное,
 *   остальных — тускло-белое; пока банк в очереди, пресеты этого банка мигают,
 *   а все три кольца тускло-белые. При неизвестном текущем банке подписи и
 *   кольца неизвестны.
 * - Snapshot: снапшоты 1–3, кольцо выбранного горит цветом из пресета
 *   (`color` = null), остальных — тускло-белое; при неизвестном снапшоте
 *   кольца неизвестны.
 *
 * Пока открыт Tuner, кольца показывают настройку (`tuner`); иначе, пока
 * включён All Bypass, все кольца погашены. Подписи от Tuner и All Bypass не
 * зависят.
 */
export function switchDisplays(state: HxStompState): HxSwitchDisplay[] {
  let shown: HxSwitchDisplay[];
  switch (state.footswitchMode) {
    case 'stomp':
      shown = [assignment(), assignment(), fs3(state)];
      break;
    case 'scroll':
      shown = [
        { label: { kind: 'text', text: 'PRESET ∨', color: 'white' }, ring: IDLE },
        { label: { kind: 'text', text: 'PRESET ∧', color: 'white' }, ring: IDLE },
        fs3(state),
      ];
      break;
    case 'preset':
      shown = presetSwitches(state);
      break;
    case 'snapshot':
      shown = snapshotSwitches(state);
      break;
  }
  if (state.tuner) {
    return shown.map((d) => ({ ...d, ring: TUNER }));
  }
  if (state.allBypass) {
    return shown.map((d) => ({ ...d, ring: OFF }));
  }
  return shown;
}
