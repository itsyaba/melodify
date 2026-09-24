/**
 * LRC parsing: `[mm:ss.xx]line` with any number of timestamps per line, the `[offset:±ms]` tag,
 * and enhanced LRC's inline `<mm:ss.xx>` word timings, which are dropped. Text without a single
 * timestamp comes back unsynced, one entry per line, so embedded plain lyrics go through here too.
 */
export interface LyricLine {
  /** Null for unsynced lyrics. */
  timeMs: number | null;
  text: string;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const TAG = /^\[([a-z#]+):(.*)\]$/i;
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function stampMs(min: string, sec: string, frac: string | undefined): number {
  // ".5" is half a second, ".05" five hundredths, ".005" five thousandths.
  const fraction = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
  return Number(min) * 60_000 + Number(sec) * 1000 + fraction;
}

export function parseLyrics(source: string): Lyrics {
  const raw = source.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  let offset = 0;
  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];

  for (const line of raw) {
    const trimmed = line.trim();
    const tag = trimmed.match(TAG);
    if (tag && !/^\d/.test(tag[1])) {
      if (tag[1].toLowerCase() === 'offset') offset = Number(tag[2].trim()) || 0;
      continue;
    }
    const stamps = [...trimmed.matchAll(STAMP)];
    if (stamps.length === 0) {
      plain.push({ timeMs: null, text: trimmed });
      continue;
    }
    const text = trimmed.replace(STAMP, '').replace(WORD_STAMP, '').trim();
    for (const s of stamps) timed.push({ timeMs: stampMs(s[1], s[2], s[3]), text });
  }

  if (timed.length === 0) {
    // Keep paragraph breaks, but not a run of blank lines at either end.
    while (plain.length && plain[0].text === '') plain.shift();
    while (plain.length && plain[plain.length - 1].text === '') plain.pop();
    return { synced: false, lines: plain };
  }
  // A positive offset shows every line that much sooner.
  for (const l of timed) l.timeMs = Math.max(0, (l.timeMs ?? 0) - offset);
  timed.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
  return { synced: true, lines: timed };
}

/** Index of the line being sung at `positionMs`, or -1 before the first. */
export function activeLine(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].timeMs ?? 0) <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
