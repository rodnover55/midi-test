import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ENGINES } from '../../core/devices/registry.ts';
import type { DeviceId, Effect } from '../../core/devices/types.ts';
import { DEVICE_IDS } from '../../core/devices/types.ts';
import { formatHex } from '../../core/midi.ts';
import type { LogEntry } from '../../core/monitor.ts';
import { formatClockTime, formatDateTime, formatDelta } from '../format.ts';
import { send, useStore } from '../store.ts';

/** Высота строки журнала, px; совпадает с CSS `.log-row`. */
const ROW_HEIGHT = 24;
/** Сколько строк рисуется сверх видимых сверху и снизу. */
const OVERSCAN = 12;

/** Отбор записей: все, адресованные устройству, или не адресованные никому. */
type DeviceFilter = 'all' | DeviceId | 'none';

const EFFECT_LABELS: Record<Effect, string> = {
  applied: 'выполнено',
  pending: 'ждёт следующего сообщения',
  ignored: 'проигнорировано',
  unsupported: 'не поддерживается',
};

/**
 * Отбирает записи журнала по устройству и строке поиска и упорядочивает их от
 * новых к старым.
 *
 * Поиск без учёта регистра ищет подстроку в шестнадцатеричных байтах, общем
 * описании, описаниях команд и имени порта. Пустая строка поиска не
 * ограничивает отбор.
 */
export function selectRows(log: readonly LogEntry[], filter: DeviceFilter, query: string): LogEntry[] {
  const needle = query.trim().toLowerCase();
  const rows: LogEntry[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (filter === 'none' ? entry.targets.length > 0 : filter !== 'all' && !entry.targets.some((t) => t.device === filter)) {
      continue;
    }
    if (needle && !searchText(entry).includes(needle)) {
      continue;
    }
    rows.push(entry);
  }
  return rows;
}

function searchText(entry: LogEntry): string {
  return [formatHex(entry.bytes), entry.summary, entry.port, ...entry.targets.map((t) => t.text)].join('\n').toLowerCase();
}

/**
 * Возвращает короткую подпись порта для строки журнала: имя виртуального
 * порта без префикса `virtual:`, у системного порта — часть после имени
 * клиента (`Midi Through:Midi Through Port-0` → `Midi Through Port-0`).
 */
export function portLabel(portId: string): string {
  if (portId.startsWith('virtual:')) {
    return portId.slice('virtual:'.length);
  }
  const colon = portId.indexOf(':');
  return colon >= 0 ? portId.slice(colon + 1) : portId;
}

function channelOf(entry: LogEntry): string {
  return 'channel' in entry.message ? String(entry.message.channel) : '—';
}

function Targets({ entry }: { entry: LogEntry }) {
  if (entry.targets.length === 0) {
    const text =
      entry.message.kind === 'invalid'
        ? 'не обрабатывается: сообщение некорректно'
        : `канал ${channelOf(entry)} не назначен ни одному процессору`;
    return <span className="tgt tgt-none">{text}</span>;
  }
  return (
    <>
      {entry.targets.map((t) => (
        <span key={t.device} className={`tgt eff-${t.effect}`}>
          <b className={`dev-badge dev-${t.device}`}>{ENGINES[t.device].name}</b> {t.text}
        </span>
      ))}
    </>
  );
}

function Row({ entry, top, selected, onSelect }: { entry: LogEntry; top: number; selected: boolean; onSelect(): void }) {
  const hex = formatHex(entry.bytes);
  return (
    <div
      className={`log-row${selected ? ' selected' : ''}`}
      style={{ transform: `translateY(${top}px)` }}
      onClick={onSelect}
    >
      <span className="c-time" title={formatDateTime(entry.time)}>
        {formatClockTime(entry.time)}
      </span>
      <span className="c-delta">{formatDelta(entry.delta)}</span>
      <span className="c-port" title={entry.port}>
        {portLabel(entry.port)}
      </span>
      <span className="c-ch">{channelOf(entry)}</span>
      <span className="c-bytes" title={hex}>
        {formatHex(entry.bytes, 8)}
      </span>
      <span className="c-summary" title={entry.summary}>
        {entry.summary}
      </span>
      <span className="c-cmd" title={entry.targets.map((t) => `${ENGINES[t.device].name}: ${t.text}`).join('\n')}>
        <Targets entry={entry} />
      </span>
    </div>
  );
}

function Details({ entry }: { entry: LogEntry }) {
  return (
    <div className="log-details">
      <div>
        <b>№{entry.id}</b> · {formatDateTime(entry.time)} · {formatDelta(entry.delta)} от предыдущей записи · порт{' '}
        {entry.port}
      </div>
      <div className="mono">
        HEX: {formatHex(entry.bytes)} · DEC: {entry.bytes.join(' ')} · BIN:{' '}
        {entry.bytes
          .slice(0, 8)
          .map((b) => b.toString(2).padStart(8, '0'))
          .join(' ')}
        {entry.bytes.length > 8 ? ' …' : ''}
      </div>
      <div>{entry.summary}</div>
      {entry.targets.length === 0 ? (
        <div className="muted">
          <Targets entry={entry} />
        </div>
      ) : (
        entry.targets.map((t) => (
          <div key={t.device}>
            <b className={`dev-badge dev-${t.device}`}>{ENGINES[t.device].name}</b> {t.text}{' '}
            <span className={`effect eff-${t.effect}`}>({EFFECT_LABELS[t.effect]})</span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Журнал мониторинга входящих MIDI-сообщений: время получения, интервал,
 * порт, канал, сырые байты, общее описание и команда на каждом процессоре.
 * Новые записи сверху. Пауза замораживает список, не останавливая приём.
 */
export function MonitorPanel() {
  const log = useStore((s) => s.log);
  const realtimeLogged = useStore((s) => s.config.log.realtime);
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [query, setQuery] = useState('');
  const [frozen, setFrozen] = useState<readonly LogEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);
  const listRef = useRef<HTMLDivElement>(null);
  const firstIdRef = useRef<number | null>(null);

  const source = frozen ?? log;
  const rows = useMemo(() => selectRows(source, filter, query), [source, filter, query]);
  const selected = selectedId === null ? undefined : source.find((e) => e.id === selectedId);
  const newSincePause = frozen ? log.filter((e) => e.id > (frozen.at(-1)?.id ?? 0)).length : 0;

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);
    setViewport(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Пока журнал прокручен вниз, новые записи сверху не сдвигают видимые строки.
  useLayoutEffect(() => {
    const element = listRef.current;
    const previousFirst = firstIdRef.current;
    firstIdRef.current = rows[0]?.id ?? null;
    if (!element || previousFirst === null || element.scrollTop === 0) {
      return;
    }
    const index = rows.findIndex((e) => e.id === previousFirst);
    if (index > 0) {
      element.scrollTop += index * ROW_HEIGHT;
      setScrollTop(element.scrollTop);
    }
  }, [rows]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(first, last);

  return (
    <section className="monitor">
      <div className="monitor-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Устройство">
          {(['all', ...DEVICE_IDS, 'none'] as DeviceFilter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Все' : f === 'none' ? 'Без процессора' : ENGINES[f].name}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Поиск: байты, команда, порт"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={() => setFrozen(frozen ? null : log)} className={frozen ? 'active' : ''}>
          {frozen ? `Продолжить${newSincePause ? ` (+${newSincePause})` : ''}` : 'Пауза'}
        </button>
        <button
          onClick={() => {
            send({ type: 'clearLog' });
            setFrozen(null);
            setSelectedId(null);
          }}
        >
          Очистить
        </button>
        <span className="monitor-count">
          {rows.length === source.length ? `${rows.length} записей` : `${rows.length} из ${source.length}`}
          {realtimeLogged ? '' : ' · Clock и Active Sensing не записываются'}
        </span>
      </div>
      <div className="log-head">
        <span className="c-time">Время</span>
        <span className="c-delta">Интервал</span>
        <span className="c-port">Порт</span>
        <span className="c-ch">Кан.</span>
        <span className="c-bytes">Байты</span>
        <span className="c-summary">Сообщение</span>
        <span className="c-cmd">Команда на процессоре</span>
      </div>
      <div className="log-list" ref={listRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div className="log-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
          {visible.map((entry, i) => (
            <Row
              key={entry.id}
              entry={entry}
              top={(first + i) * ROW_HEIGHT}
              selected={entry.id === selectedId}
              onSelect={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
            />
          ))}
        </div>
        {rows.length === 0 && <div className="log-empty">Сообщений пока нет</div>}
      </div>
      {selected && <Details entry={selected} />}
    </section>
  );
}
