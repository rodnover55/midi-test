/** Строка состояния Quad Cortex под изображением прибора. */

import type {
  LooperState,
  PresetState,
  QuadCortexState,
  Screen,
  TempoState,
} from '../../../core/devices/quadCortex/engine.ts';
import { formatDuration, looperProgress } from './timeline.ts';

const SCREEN_NAMES: Record<Screen, string> = {
  gigView: 'Gig View',
  tuner: 'Tuner',
  tempo: 'Tempo',
  looper: 'Looper X',
};

const TRANSPORT_NAMES: Record<LooperState['transport'], string> = {
  empty: 'нет петли',
  recording: 'запись',
  playing: 'воспроизведение',
  overdubbing: 'воспроизведение с OVERDUB',
  punching: 'воспроизведение с PUNCH IN',
  duplicating: 'воспроизведение с DUPLICATE',
  stopped: 'петля остановлена',
};

/**
 * Возвращает строку состояния на русском: пресет и сетлист, сцена, режим
 * футсвитчей (с переключёнными стомпами), открытый экран, Looper X (если
 * петля есть, редактор открыт или действие взведено) и темп. Части
 * разделены « · »; неизвестное названо неизвестным.
 *
 * Пример: `Пресет 2C, сетлист 1 «My Presets» · сцена C · режим SCENE ·
 * экран The Grid · темп 120 BPM (Tap Tempo)`.
 *
 * @param state состояние на момент `now` (см. `quadCortexAt`).
 * @param now момент изображения, миллисекунды Unix-времени; от него
 *   отсчитывается время идущей записи петли.
 */
export function statusText(state: QuadCortexState, now: number): string {
  const parts = [presetPart(state.preset, state.bankSelect), scenePart(state), modePart(state), screenPart(state)];
  if (state.screens.includes('looper') || state.looper.transport !== 'empty' || state.looper.armed !== null) {
    parts.push(looperPart(state.looper, now));
  }
  parts.push(tempoPart(state.tempo));
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function presetPart(preset: PresetState, bankSelect: QuadCortexState['bankSelect']): string {
  let text = 'пресет неизвестен';
  if (preset.label !== null) {
    const standard = preset.standardLabel !== null && preset.standardLabel !== preset.label;
    text = `пресет ${preset.label}${standard ? ` (${preset.standardLabel} при банках по 8)` : ''}`;
  }
  if (preset.setlist === null) {
    text += ', сетлист неизвестен';
  } else {
    text += `, сетлист ${preset.setlist}${preset.setlistName === null ? '' : ` «${preset.setlistName}»`}`;
  }
  const pending = [
    bankSelect.pendingMsb === null ? null : `CC#0 = ${bankSelect.pendingMsb}`,
    bankSelect.pendingLsb === null ? null : `CC#32 = ${bankSelect.pendingLsb}`,
  ].filter((p) => p !== null);
  return pending.length === 0 ? text : `${text} (ждут Program Change: ${pending.join(', ')})`;
}

function scenePart(state: QuadCortexState): string {
  return state.scene === null ? 'сцена неизвестна' : `сцена ${state.scene}`;
}

function modePart(state: QuadCortexState): string {
  const mode = state.mode;
  if (mode === null) {
    return 'режим неизвестен';
  }
  let text = mode.name === 'HYBRID' ? `режим HYBRID (A–D ${mode.rows[0]}, E–H ${mode.rows[1]})` : `режим ${mode.name}`;
  const toggled = state.footswitches.filter((fs) => fs.role === 'stomp' && fs.toggled).map((fs) => fs.letter);
  if (toggled.length > 0) {
    text += `, переключены стомпы ${toggled.join(', ')}`;
  }
  return text;
}

function screenPart(state: QuadCortexState): string {
  const screens = state.screens;
  if (screens.length === 0) {
    return 'экран The Grid';
  }
  const view = state.looper.view === 'perform' ? 'Perform' : 'Parameters';
  const name = (screen: Screen) => (screen === 'looper' ? `Looper X (${view})` : SCREEN_NAMES[screen]);
  const below = screens.slice(0, -1).reverse().map(name);
  return `экран ${name(screens[screens.length - 1])}${below.length > 0 ? ` поверх ${below.join(', ')}` : ''}`;
}

function looperPart(looper: LooperState, now: number): string {
  let text = `Looper X: ${TRANSPORT_NAMES[looper.transport]}`;
  const progress = looperProgress(looper, now);
  if (progress?.kind === 'recording') {
    text += ` ${formatDuration(progress.elapsed)}`;
  }
  if (looper.length !== null && looper.transport !== 'empty' && looper.transport !== 'recording') {
    text += `, петля ${formatDuration(looper.length, true)}`;
  }
  if (looper.armed !== null) {
    const action = looper.armed === 'record' ? 'RECORD' : looper.armed === 'duplicate' ? 'DUPLICATE' : 'PLAY';
    text += `, ${action} ждёт ${looper.armedUntil === null ? 'MIDI Start' : 'первой доли такта'}`;
  }
  const modes = [looper.oneShot && 'ONE SHOT', looper.halfSpeed && 'HALF SPEED', looper.reverse && 'REVERSE'].filter(
    (m) => m !== false,
  );
  return modes.length === 0 ? text : `${text}, ${modes.join(', ')}`;
}

function tempoPart(tempo: TempoState): string {
  if (tempo.bpm === null) {
    return tempo.source === 'clock' ? 'темп по MIDI Clock ещё не определён' : 'темп неизвестен';
  }
  const value = Number.isInteger(tempo.bpm) ? String(tempo.bpm) : tempo.bpm.toFixed(1);
  return `темп ${value} BPM (${tempo.source === 'clock' ? 'MIDI Clock' : 'Tap Tempo'})`;
}
