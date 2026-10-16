/**
 * Period-over-period windows for the Reports comparison cards (ClickUp 14ypaj0kfu7).
 *
 * Comparisons are like-for-like: the current period runs from its start up to now, and the
 * previous period covers the same elapsed span (Oct 1–17 vs Jul 1–17), not the whole previous
 * period. Dates are browser-local so they line up with the KPI date range on the same page.
 */

const DAY_MS = 86_400_000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Calendar-day shift — keeps the local clock time across DST changes
const addDays = (d, days) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

// Same day-of-month and clock time `months` away, clamped to the target month's last day
const addMonthsClamped = (d, months) => {
  const r = new Date(
    d.getFullYear(), d.getMonth() + months, 1,
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(),
  );
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
};

/**
 * Current period = periodStart → now. Previous = the same span shifted back one period,
 * capped so it never runs into the current period.
 */
function toDateWindow(key, label, periodStart, now, shiftBack) {
  const previousEnd = shiftBack(now);
  const cap = new Date(periodStart.getTime() - 1);
  return {
    key,
    label,
    current:  { start: periodStart, end: now },
    previous: { start: shiftBack(periodStart), end: previousEnd > cap ? cap : previousEnd },
  };
}

function weekWindow(now) {
  const today = startOfDay(now);
  const weekStart = addDays(today, -today.getDay()); // weeks start on Sunday
  return toDateWindow('week', { current: 'This Week', previous: 'Last Week' }, weekStart, now, (d) => addDays(d, -7));
}

function monthWindow(now) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return toDateWindow('month', { current: 'This Month', previous: 'Last Month' }, monthStart, now, (d) => addMonthsClamped(d, -1));
}

/**
 * Windows for the comparison cards on the Reports tab.
 * @param {string} dateFilter  'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom'
 * @param {{startDate: string, endDate: string}} customRange  YYYY-MM-DD values from the date inputs
 * @returns {Array<{key, label: {current, previous}, current: {start, end}, previous: {start, end}}>}
 *   'all' gives the week + month cards; a selected period gives one card; an incomplete custom range gives none.
 */
export function getComparisonWindows(dateFilter, customRange = {}, now = new Date()) {
  switch (dateFilter) {
    case 'today':
      return [toDateWindow('today', { current: 'Today', previous: 'Yesterday' }, startOfDay(now), now, (d) => addDays(d, -1))];
    case 'week':
      return [weekWindow(now)];
    case 'month':
      return [monthWindow(now)];
    case 'quarter': {
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return [toDateWindow('quarter', { current: 'This Quarter', previous: 'Last Quarter' }, quarterStart, now, (d) => addMonthsClamped(d, -3))];
    }
    case 'custom': {
      const { startDate, endDate } = customRange || {};
      if (!startDate || !endDate) return [];
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59.999`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
      // Previous range = the same number of calendar days, ending just before this one starts
      const days = Math.round((startOfDay(end) - start) / DAY_MS) + 1;
      return [{
        key: 'custom',
        label: { current: 'Selected Range', previous: 'Previous Range' },
        current:  { start, end },
        previous: { start: addDays(start, -days), end: new Date(start.getTime() - 1) },
      }];
    }
    default:
      return [weekWindow(now), monthWindow(now)];
  }
}

/** Query-string form of the windows for /api/admin/reports/comparison. */
export function serializeComparisonWindows(windows) {
  return JSON.stringify(windows.map((w) => ({
    key: w.key,
    cs: w.current.start.toISOString(),
    ce: w.current.end.toISOString(),
    ps: w.previous.start.toISOString(),
    pe: w.previous.end.toISOString(),
  })));
}

/** "Oct 1 – 17", "Sep 28 – Oct 4", "Oct 17"; the year is shown when it isn't the current one. */
export function formatWindowRange({ start, end }, now = new Date()) {
  const withYear = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== now.getFullYear();
  const fmt = (d, year) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

  if (startOfDay(start).getTime() === startOfDay(end).getTime()) return fmt(start, withYear);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${fmt(start, false)} – ${end.getDate()}${withYear ? `, ${end.getFullYear()}` : ''}`;
  }
  return `${fmt(start, withYear)} – ${fmt(end, withYear)}`;
}
