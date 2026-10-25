/**
 * Форматирование времени и интервалов для журнала и заголовка.
 */

/**
 * Форматирует момент как местное время с миллисекундами: `19:23:45.123`.
 *
 * @param time миллисекунды Unix-времени; дробная часть отбрасывается.
 */
export function formatClockTime(time: number): string {
  const d = new Date(Math.floor(time));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Форматирует момент как местные дату и время с миллисекундами:
 * `2026-10-24 19:23:45.123`.
 */
export function formatDateTime(time: number): string {
  const d = new Date(Math.floor(time));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatClockTime(time)}`;
}

/**
 * Форматирует интервал от предыдущего сообщения: `+0.8 мс`, `+12 мс`,
 * `+1.25 с`, `+3 мин 05 с`.
 *
 * @param ms интервал в миллисекундах; null — интервала нет (первая запись).
 * @returns `—` для null.
 */
export function formatDelta(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  if (ms < 10) {
    return `+${ms.toFixed(1)} мс`;
  }
  if (ms < 1000) {
    return `+${Math.round(ms)} мс`;
  }
  if (ms < 60000) {
    return `+${(ms / 1000).toFixed(2)} с`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `+${minutes} мин ${String(seconds).padStart(2, '0')} с`;
}
