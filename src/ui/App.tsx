import { useCallback, useEffect, useRef, useState } from 'react';
import { DEVICE_IDS } from '../core/devices/types.ts';
import { DevicePanel } from './devices/DevicePanel.tsx';
import { DEVICE_ASPECT } from './devices/views.ts';
import { Header } from './Header.tsx';
import { MonitorPanel } from './monitor/MonitorPanel.tsx';
import { SettingsDialog } from './settings/SettingsDialog.tsx';
import { startMidi } from './store.ts';

const SPLIT_KEY = 'midi-test.devicesHeight';

/** Высота области устройств, px: сохранённая или 55 % окна. */
function initialSplit(): number {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  return Number.isFinite(saved) && saved > 120 ? saved : Math.round(window.innerHeight * 0.55);
}

/**
 * Страница монитора: процессоры сверху, журнал снизу, между ними —
 * перетаскиваемый разделитель.
 */
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [split, setSplit] = useState(initialSplit);
  const dragRef = useRef<{ startY: number; startSplit: number } | null>(null);

  useEffect(() => void startMidi(), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <div className="app">
      <Header onSettings={() => setSettingsOpen(true)} />
      <main className="main" style={{ gridTemplateRows: `${split}px 6px minmax(0, 1fr)` }}>
        <section
          className="devices"
          style={{ gridTemplateColumns: DEVICE_IDS.map((id) => `minmax(0, ${DEVICE_ASPECT[id]}fr)`).join(' ') }}
        >
          {DEVICE_IDS.map((id) => (
            <DevicePanel key={id} id={id} />
          ))}
        </section>
        <div
          className="splitter"
          title="Перетащите, чтобы изменить высоту"
          onPointerDown={(e) => {
            dragRef.current = { startY: e.clientY, startSplit: split };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragRef.current) {
              const next = Math.max(160, Math.min(window.innerHeight - 160, dragRef.current.startSplit + e.clientY - dragRef.current.startY));
              setSplit(next);
            }
          }}
          onPointerUp={() => {
            dragRef.current = null;
            localStorage.setItem(SPLIT_KEY, String(split));
          }}
        />
        <MonitorPanel />
      </main>
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
    </div>
  );
}
