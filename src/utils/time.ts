/**
 * Map Intl weekday short to GA4's dayOfWeek 0..6 (Sun..Sat)
 */
const WD_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Get weekday in a specific IANA time zone for a given Date (UTC instant).
 * Returns GA4-compatible 0..6 (Sun..Sat).
 */
function weekdayInTz(date: Date, timeZone: string): number {
  const w = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return WD_MAP[w as keyof typeof WD_MAP];
}

/**
 * Extract TZ-rendered Y-M-D h:m:s for a given UTC instant
 */
function partsInTz(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Convert a wall-clock time in a given IANA time zone to a UTC ISO string.
 * This mirrors the approach used by date-fns-tz (iterative correction for DST).
 */
function zonedWallTimeToIso(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  timeZone: string,
): string {
  // First guess: assume the provided Y-M-D h:m:s is UTC
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  // What does that guess look like in the target time zone?
  const p = partsInTz(guess, timeZone);
  // Build the UTC time that would render exactly as desired wall time in that TZ
  const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, second) - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) + guess.getTime();
  return new Date(desiredUtcMs).toISOString();
}

/**
 * Find the next occurrence (within horizonDays) of GA4 dayOfWeek (0..6, Sun..Sat)
 * at a specific hour in a given IANA time zone, and return it as UTC ISO string.
 *
 * Example: nextIsoWithinHorizon(1, 10, 14, 'Europe/Berlin') // next Monday 10:00 Berlin, as UTC ISO
 */
export function nextIsoWithinHorizon(
  dow: number,
  hour: number,
  horizonDays = 14,
  timeZone = 'Europe/Berlin',
): string | null {
  const now = new Date(); // current UTC instant
  for (let i = 1; i <= horizonDays; i++) {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() + i);
    // Is this day the requested weekday IN THE TARGET TIME ZONE?
    if (weekdayInTz(candidate, timeZone) === dow) {
      // Pick the *calendar date* in that TZ, and set requested local H:00
      const p = partsInTz(candidate, timeZone);
      return zonedWallTimeToIso(p.year, p.month, p.day, hour, 0, 0, timeZone);
    }
  }
  return null;
}

/**
 * Human label for an ISO instant in a specific IANA time zone.
 * Kept name for backward compatibility; now accepts a TZ param.
 */
export function label(iso?: string, timeZone = 'Europe/Berlin'): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
