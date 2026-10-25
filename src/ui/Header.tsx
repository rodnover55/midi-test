import { useEffect, useState } from 'react';
import type { RealtimeStats } from '../core/monitor.ts';
import { formatClockTime } from './format.ts';
import { useStore } from './store.ts';

/** Сколько миллисекунд без импульсов Timing Clock считать, что Clock не идёт. */
const CLOCK_TIMEOUT_MS = 1000;

/** Возвращает текущее время, обновляя компонент с заданным периодом, мс. */
function useNow(period: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(timer);
  }, [period]);
  return now;
}

function ClockBadge({ realtime }: { realtime: RealtimeStats | null }) {
  const now = useNow(250);
  const clock = realtime?.clock;
  const alive = clock?.lastTime != null && now - clock.lastTime < CLOCK_TIMEOUT_MS;
  const sensing = realtime?.activeSensing;
  const title = [
    `Импульсов Timing Clock: ${clock?.ticks ?? 0}`,
    clock?.lastTime != null ? `последний: ${formatClockTime(clock.lastTime)}` : '',
    `Транспорт: ${clock?.running == null ? 'Start/Stop не было' : clock.running ? 'Start/Continue' : 'Stop'}`,
    `Active Sensing: ${sensing?.count ?? 0}${sensing?.lastTime != null ? `, последний ${formatClockTime(sensing.lastTime)}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span className={`clock-badge${alive ? ' alive' : ''}`} title={title}>
      <span className={`beat${alive && clock && clock.ticks % 24 < 6 ? ' on' : ''}`} />
      MIDI Clock: {alive ? (clock?.bpm != null ? `${clock.bpm.toFixed(1)} BPM` : 'измеряется…') : 'нет'}
      {clock?.running === false && alive ? ' · Stop' : ''}
    </span>
  );
}

/** Заголовок страницы: доступ к MIDI, слушаемые входы, MIDI Clock, кнопка настроек. */
export function Header({ onSettings }: { onSettings(): void }) {
  const access = useStore((s) => s.access);
  const ports = useStore((s) => s.ports);
  const midiError = useStore((s) => s.midiError);
  const realtime = useStore((s) => s.realtime);
  const open = ports.filter((p) => p.connected && p.enabled);
  const label =
    access === 'pending' ? 'запрос доступа к MIDI…' : access === 'granted' ? `MIDI-входов: ${open.length}` : 'MIDI недоступен';
  return (
    <header className="header">
      <h1>MIDI-монитор · Quad Cortex · HX Stomp</h1>
      <span
        className={`ports${access === 'granted' ? '' : access === 'pending' ? ' pending' : ' error'}`}
        title={midiError ?? open.map((p) => p.name).join('\n')}
      >
        {label}
      </span>
      <ClockBadge realtime={realtime} />
      <span className="spacer" />
      <button onClick={onSettings}>Настройки</button>
    </header>
  );
}
