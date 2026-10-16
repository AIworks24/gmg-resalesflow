import { getComparisonWindows, formatWindowRange, serializeComparisonWindows } from '../lib/reports/comparisonWindows';

// Local-time constructor so the assertions hold in any test-runner timezone
const at = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms);

describe('getComparisonWindows', () => {
  const now = at(2026, 10, 17, 14, 30); // Saturday Oct 17, 2:30pm

  it('compares this quarter to date with the same span of last quarter', () => {
    const [w] = getComparisonWindows('quarter', {}, now);
    expect(w.key).toBe('quarter');
    expect(w.label).toEqual({ current: 'This Quarter', previous: 'Last Quarter' });
    expect(w.current).toEqual({ start: at(2026, 10, 1), end: now });
    expect(w.previous).toEqual({ start: at(2026, 7, 1), end: at(2026, 7, 17, 14, 30) });
  });

  it('clamps the previous month to its last day when it is shorter', () => {
    const [w] = getComparisonWindows('month', {}, at(2026, 3, 31, 9));
    expect(w.current.start).toEqual(at(2026, 3, 1));
    expect(w.previous).toEqual({ start: at(2026, 2, 1), end: at(2026, 2, 28, 9) });
  });

  it('caps the previous quarter at its last day', () => {
    const [w] = getComparisonWindows('quarter', {}, at(2026, 12, 31, 10));
    expect(w.previous).toEqual({ start: at(2026, 7, 1), end: at(2026, 9, 30, 10) });
  });

  it('compares this week (from Sunday) with the same days of last week', () => {
    const [w] = getComparisonWindows('week', {}, now);
    expect(w.current).toEqual({ start: at(2026, 10, 11), end: now });
    expect(w.previous).toEqual({ start: at(2026, 10, 4), end: at(2026, 10, 10, 14, 30) });
  });

  it('compares today so far with yesterday up to the same time', () => {
    const [w] = getComparisonWindows('today', {}, now);
    expect(w.label).toEqual({ current: 'Today', previous: 'Yesterday' });
    expect(w.current).toEqual({ start: at(2026, 10, 17), end: now });
    expect(w.previous).toEqual({ start: at(2026, 10, 16), end: at(2026, 10, 16, 14, 30) });
  });

  it('compares a custom range with the equal-length range just before it', () => {
    const [w] = getComparisonWindows('custom', { startDate: '2026-10-05', endDate: '2026-10-11' }, now);
    expect(w.current).toEqual({ start: at(2026, 10, 5), end: at(2026, 10, 11, 23, 59, 59, 999) });
    expect(w.previous).toEqual({ start: at(2026, 9, 28), end: at(2026, 10, 4, 23, 59, 59, 999) });
  });

  it('returns no window while the custom range is incomplete or reversed', () => {
    expect(getComparisonWindows('custom', { startDate: '2026-10-05', endDate: '' }, now)).toEqual([]);
    expect(getComparisonWindows('custom', { startDate: '2026-10-11', endDate: '2026-10-05' }, now)).toEqual([]);
  });

  it('shows week and month cards for All Time, both like-for-like', () => {
    const windows = getComparisonWindows('all', {}, now);
    expect(windows.map((w) => w.key)).toEqual(['week', 'month']);
    expect(windows[1].previous).toEqual({ start: at(2026, 9, 1), end: at(2026, 9, 17, 14, 30) });
  });
});

describe('formatWindowRange', () => {
  const now = at(2026, 10, 17, 14, 30);

  it('formats a range inside one month', () => {
    expect(formatWindowRange({ start: at(2026, 10, 1), end: now }, now)).toBe('Oct 1 – 17');
  });

  it('formats a range across months', () => {
    expect(formatWindowRange({ start: at(2026, 9, 28), end: at(2026, 10, 4) }, now)).toBe('Sep 28 – Oct 4');
  });

  it('formats a single day', () => {
    expect(formatWindowRange({ start: at(2026, 10, 16), end: at(2026, 10, 16, 14, 30) }, now)).toBe('Oct 16');
  });

  it('adds the year outside the current year', () => {
    expect(formatWindowRange({ start: at(2025, 12, 28), end: at(2026, 1, 3) }, now)).toBe('Dec 28, 2025 – Jan 3, 2026');
  });
});

describe('serializeComparisonWindows', () => {
  it('sends ISO timestamps for each window', () => {
    const windows = getComparisonWindows('today', {}, at(2026, 10, 17, 14, 30));
    const [w] = JSON.parse(serializeComparisonWindows(windows));
    expect(w.key).toBe('today');
    expect(w.cs).toBe(at(2026, 10, 17).toISOString());
    expect(w.pe).toBe(at(2026, 10, 16, 14, 30).toISOString());
  });
});
