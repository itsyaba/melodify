/**
 * The spans a recap covers, and when one is offered by itself. Pure: no database, no React, so
 * the rules are tested directly.
 */

export type RecapKind = 'month' | 'year';

export interface RecapPeriod {
  kind: RecapKind;
  /** What is marked as seen: "2026-10" for a month, "2026" for a year. */
  key: string;
  /** "October 2026", "2026". */
  label: string;
  /** "October", "2026": the heading on the first card. */
  shortLabel: string;
  /** Milliseconds since the epoch, local time; `to` is exclusive. */
  from: number;
  to: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A recap of the month `date` falls in. */
export function monthPeriod(date: Date): RecapPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    kind: 'month',
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${MONTHS[month]} ${year}`,
    shortLabel: MONTHS[month],
    from: new Date(year, month, 1).getTime(),
    to: new Date(year, month + 1, 1).getTime(),
  };
}

/** A recap of the year `date` falls in. */
export function yearPeriod(date: Date): RecapPeriod {
  const year = date.getFullYear();
  return {
    kind: 'year',
    key: String(year),
    label: String(year),
    shortLabel: String(year),
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year + 1, 0, 1).getTime(),
  };
}

/** The span before this one: last month, or last year. */
export function previousPeriod(period: RecapPeriod): RecapPeriod {
  const start = new Date(period.from);
  if (period.kind === 'year') return yearPeriod(new Date(start.getFullYear() - 1, 0, 1));
  return monthPeriod(new Date(start.getFullYear(), start.getMonth() - 1, 1));
}

export function isLastDayOfMonth(date: Date): boolean {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getDate() === 1;
}

/** The month Settings offers: this one on its last day, the one just gone on any other. */
export function monthPeriodAround(now: Date): RecapPeriod {
  return isLastDayOfMonth(now) ? monthPeriod(now) : monthPeriod(new Date(now.getFullYear(), now.getMonth(), 0));
}

/** How many days a span holds, for "you listened on 18 of 31 days". */
export function daysInPeriod(period: RecapPeriod): number {
  return Math.round((period.to - period.from) / 86_400_000);
}

/**
 * A month's recap is offered on its last day, and for the first three days of the next month, so
 * a day away from the phone does not lose it. A year's is offered from two weeks before the end
 * of December and through the first week of January, and takes December's place while it is up.
 */
export function dueRecap(now: Date): RecapPeriod | null {
  const month = now.getMonth();
  const day = now.getDate();
  if (month === 11 && day >= 17) return yearPeriod(now);
  if (month === 0 && day <= 7) return yearPeriod(new Date(now.getFullYear() - 1, 0, 1));
  if (isLastDayOfMonth(now)) return monthPeriod(now);
  if (day <= 3) return monthPeriod(new Date(now.getFullYear(), month, 0));
  return null;
}
