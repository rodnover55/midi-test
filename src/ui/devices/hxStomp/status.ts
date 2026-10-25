/**
 * Строка состояния HX Stomp под изображением: пресет, снапшот, экран, режим
 * футсвитчей, темп, лупер — коротко и однозначно, на русском.
 */

import type { HxLooper, HxRing, HxStompState, HxTempo } from '../../../core/devices/hxStomp/engine.ts';
import { formatBpm, MODE_NAMES, TUNER_PAGES } from '../../../core/devices/hxStomp/engine.ts';
import { LED_COLORS, LED_PRESET_COLOR, shade, UNKNOWN_TEXT } from './look.ts';

/** Часть строки состояния. */
export interface StatusPart {
  text: string;
  /**
   * Цвет LED-кольца, о котором говорит часть, — у лупера: кольцо футсвитча,
   * на который он назначен (какой это футсвитч, неизвестно); null — кольцо
   * не горит, в том числе пока кольца погашены All Bypass или показывают
   * настройку Tuner, или части оно не нужно.
   */
  led: string | null;
}

const LOOPER_STATUS: Record<HxLooper['status'], string> = {
  empty: 'пусто',
  recording: 'запись',
  playing: 'воспроизведение',
  overdubbing: 'наложение (Overdub)',
  stopped: 'остановлен',
};

function presetPart(state: HxStompState): string {
  const head = state.preset ? `Пресет ${state.preset.label}` : 'Пресет неизвестен';
  return state.edited ? `${head} (изменён, «E»)` : head;
}

function snapshotPart(state: HxStompState): string {
  if (state.snapshot !== null) {
    return `снапшот ${state.snapshot}`;
  }
  return state.preset ? 'снапшот — сохранённый в пресете' : 'снапшот неизвестен';
}

function screenPart(state: HxStompState): string {
  const parts: string[] = [];
  if (state.tuner) {
    parts.push(`Tuner, страница ${state.tunerPage} из ${TUNER_PAGES.length}`);
  } else {
    parts.push(state.view === 'edit' ? 'Edit view' : 'Play view');
  }
  if (state.allBypass) {
    parts.push(state.settings.bypassType === 'dsp' ? 'DSP Bypass' : 'Analog Bypass');
  }
  return parts.join(', ');
}

function modePart(state: HxStompState): string {
  const mode = `режим ${MODE_NAMES[state.footswitchMode]}`;
  const queue = state.bankQueue;
  if (!queue) {
    return mode;
  }
  return queue.bank === null ? `${mode}, банк в очереди (номер неизвестен)` : `${mode}, банк ${queue.bank} в очереди`;
}

function bpmText(bpm: number | null): string {
  return bpm === null ? 'неизвестен' : `${formatBpm(bpm)} BPM`;
}

function tempoPart(tempo: HxTempo, clockActive: boolean): string {
  if (tempo.clock) {
    if (clockActive) {
      return tempo.bpm === null ? 'темп по MIDI Clock' : `темп ${formatBpm(tempo.bpm)} BPM по MIDI Clock`;
    }
    return `MIDI Clock пропал, темп ${bpmText(tempo.own ? tempo.own.bpm : null)}`;
  }
  if (tempo.bpm !== null) {
    return `темп ${formatBpm(tempo.bpm)} BPM${tempo.source === 'tap' ? ' (Tap)' : ''}`;
  }
  switch (tempo.source) {
    case 'preset':
      return 'темп из пресета (неизвестен)';
    case 'snapshot':
      return 'темп из снапшота (неизвестен)';
    default:
      return 'темп неизвестен';
  }
}

function looperPart(looper: HxLooper): string {
  const parts = [LOOPER_STATUS[looper.status]];
  if (looper.playOnce) {
    parts.push('Play Once');
  }
  if (looper.reverse) {
    parts.push('Reverse');
  }
  if (looper.halfSpeed) {
    parts.push('Half Speed');
  }
  return `лупер: ${parts.join(', ')}`;
}

function ledColor(ring: HxRing): string | null {
  if (ring.light !== 'on' && ring.light !== 'dim') {
    return null;
  }
  const color = ring.color ? LED_COLORS[ring.color] : LED_PRESET_COLOR;
  return ring.light === 'dim' ? shade(color, 0.45) : color;
}

function values(list: readonly (number | null)[]): string {
  return list.map((v) => (v === null ? UNKNOWN_TEXT : String(v))).join(' / ');
}

/**
 * Возвращает части строки состояния HX Stomp по порядку: пресет (с пометкой
 * несохранённых правок), снапшот, экран (Play view, Edit view или Tuner со
 * страницей, All Bypass), режим футсвитчей и банк в очереди, темп с
 * источником, лупер с цветом его кольца (если лупер есть в пресетах),
 * значения Knob 1–3 в Edit view и положения педалей EXP 1/2 (если хотя бы
 * одно известно). Неизвестное называется неизвестным.
 *
 * @param clockActive приходят ли ещё импульсы MIDI Clock, которому следует
 *   прибор; false — клок пропал и прибор вернулся к собственному темпу.
 *   Не учитывается, если прибор клоку не следует.
 */
export function statusParts(state: HxStompState, clockActive: boolean): StatusPart[] {
  const plain = (text: string): StatusPart => ({ text, led: null });
  const parts = [presetPart(state), snapshotPart(state), screenPart(state), modePart(state)].map(plain);
  parts.push(plain(tempoPart(state.tempo, clockActive)));
  if (state.looper) {
    const ringsShown = !state.tuner && !state.allBypass;
    parts.push({ text: looperPart(state.looper), led: ringsShown ? ledColor(state.looper.ring) : null });
  }
  if (state.view === 'edit' && !state.tuner) {
    parts.push(plain(`Knob 1–3: ${values(state.knobs)}`));
  }
  if (state.exp.some((v) => v !== null)) {
    parts.push(plain(`EXP 1/2: ${values(state.exp)}`));
  }
  return parts;
}

/** Возвращает строку состояния HX Stomp: тексты {@link statusParts} через « · ». */
export function statusLine(state: HxStompState, clockActive: boolean): string {
  return statusParts(state, clockActive)
    .map((part) => part.text)
    .join(' · ');
}
