import { useEffect, useState } from 'react';
import type { HxStompState } from '../../core/devices/hxStomp/engine.ts';
import { PRESET_COUNT, presetLabel } from '../../core/devices/hxStomp/presets.ts';
import { MAX_SETLIST, PRESETS_PER_SETLIST, presetDesignation, setlistName } from '../../core/devices/quadCortex/addressing.ts';
import type { QuadCortexState } from '../../core/devices/quadCortex/engine.ts';
import type { DeviceId, DeviceStateBase } from '../../core/devices/types.ts';
import type { ManualControl } from './manual.ts';
import { hxPreset, hxSnapshot, hxTuner, QC_LETTERS, qcGigView, qcLoadPreset, qcScene, qcTuner } from './manual.ts';

const QC_SETLISTS = Array.from({ length: MAX_SETLIST + 1 }, (_, i) => i);
const QC_PRESETS = Array.from({ length: PRESETS_PER_SETLIST }, (_, i) => i);
const HX_PRESETS = Array.from({ length: PRESET_COUNT }, (_, i) => i);
const HX_SNAPSHOTS = [1, 2, 3] as const;

/**
 * Строка ручного управления устройством над его изображением: выбор
 * пресета, сцены или снапшота, Tuner и т. п. Каждое действие отправляет
 * через `control` MIDI-сообщения, которые выполнили бы его на приборе;
 * текущие значения модели подсвечены.
 */
export function ManualBar({ id, state, control }: { id: DeviceId; state: DeviceStateBase; control: ManualControl }) {
  return id === 'qc' ? (
    <QcBar state={state as QuadCortexState} control={control} />
  ) : (
    <HxBar state={state as HxStompState} control={control} />
  );
}

function QcBar({ state, control }: { state: QuadCortexState; control: ManualControl }) {
  const { channel, send } = control;
  const modelSetlist = state.preset.setlist;
  const modelIndex = state.preset.index;
  const [setlist, setSetlist] = useState(modelSetlist ?? 1);
  const [index, setIndex] = useState(modelIndex ?? 0);
  // Выбор следует за пресетом модели, когда тот меняется сообщениями.
  useEffect(() => {
    if (modelSetlist !== null) {
      setSetlist(modelSetlist);
    }
  }, [modelSetlist]);
  useEffect(() => {
    if (modelIndex !== null) {
      setIndex(modelIndex);
    }
  }, [modelIndex]);
  const loaded = setlist === modelSetlist && index === modelIndex;
  const tuner = state.screens.includes('tuner');
  const gigView = state.screens.includes('gigView');
  return (
    <div className="manual-bar">
      <select
        value={setlist}
        onChange={(e) => setSetlist(Number(e.target.value))}
        title="Сетлист (CC#32)"
        className={setlist === modelSetlist ? 'current' : ''}
      >
        {QC_SETLISTS.map((s) => (
          <option key={s} value={s}>
            {setlistName(s) ? `${s} ${setlistName(s)}` : `Setlist ${s}`}
          </option>
        ))}
      </select>
      <select
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        title="Пресет (CC#0 и Program Change)"
        className={loaded ? 'current' : ''}
      >
        {QC_PRESETS.map((i) => (
          <option key={i} value={i}>
            {presetDesignation(i, false).label}
          </option>
        ))}
      </select>
      <button
        className={loaded ? 'active' : ''}
        onClick={() => send(qcLoadPreset(channel, setlist, index))}
        title="Загрузить пресет: CC#32 (сетлист), CC#0 (группа банков), Program Change"
      >
        Загрузить
      </button>
      <span className="manual-group" role="group" aria-label="Сцены">
        {QC_LETTERS.map((letter, i) => (
          <button
            key={letter}
            className={state.scene === letter ? 'active' : ''}
            onClick={() => send([qcScene(channel, i)])}
            title={`Сцена ${letter} — CC#43 = ${i}`}
          >
            {letter}
          </button>
        ))}
      </span>
      <button
        className={tuner ? 'active' : ''}
        onClick={() => send([qcTuner(channel, !tuner)])}
        title={`${tuner ? 'Закрыть' : 'Открыть'} Tuner — CC#45 = ${tuner ? 0 : 127}`}
      >
        Tuner
      </button>
      <button
        className={gigView ? 'active' : ''}
        onClick={() => send([qcGigView(channel, !gigView)])}
        title={`${gigView ? 'Закрыть' : 'Открыть'} Gig View — CC#46 = ${gigView ? 0 : 127}`}
      >
        Gig View
      </button>
    </div>
  );
}

function HxBar({ state, control }: { state: HxStompState; control: ManualControl }) {
  const { channel, send } = control;
  const current = state.preset?.index ?? null;
  return (
    <div className="manual-bar">
      <select
        value={current ?? ''}
        onChange={(e) => send([hxPreset(channel, Number(e.target.value))])}
        title="Загрузить пресет — Program Change"
        className={current !== null ? 'current' : ''}
      >
        {current === null && <option value="">Пресет —</option>}
        {HX_PRESETS.map((i) => (
          <option key={i} value={i}>
            {presetLabel(i, state.settings.presetNumber)}
          </option>
        ))}
      </select>
      <span className="manual-group" role="group" aria-label="Снапшоты">
        {HX_SNAPSHOTS.map((n) => (
          <button
            key={n}
            className={state.snapshot === n ? 'active' : ''}
            onClick={() => send([hxSnapshot(channel, n)])}
            title={`Снапшот ${n} — CC#69 = ${n - 1}`}
          >
            Snapshot {n}
          </button>
        ))}
      </span>
      <button
        className={state.tuner ? 'active' : ''}
        onClick={() => send([hxTuner(channel)])}
        title={`${state.tuner ? 'Закрыть' : 'Открыть'} Tuner — CC#68`}
      >
        Tuner
      </button>
    </div>
  );
}
