import type { SQLiteDatabase } from 'expo-sqlite';
import { promptText, showMenu } from '@/components/menus';
import { toast } from '@/components/toast';
import { addBookmark, listBookmarks } from '@/db/bookmarks';
import type { Track } from '@/db/types';
import { abRepeat } from '@/player/ab-repeat';
import { queue, queueSnapshot } from '@/player/queue-store';
import { sleepTimer, type SleepTimer } from '@/player/sleep-timer';
import { getPrefs } from '@/prefs';
import { libraryEvents } from '@/utils/events';
import { formatCount, formatDuration } from '@/utils/format';

/** The player's sheets. Plain functions reading the stores when opened, so none of them go stale. */

export function sleepLabel(timer: SleepTimer, remainingMs: number): string | null {
  if (timer.mode === 'minutes') return `Sleep in ${formatDuration(remainingMs)}`;
  if (timer.mode === 'songs') return timer.left === 1 ? 'Stops after this song' : `Stops after ${timer.left} songs`;
  return null;
}

export function sleepMenu() {
  const timer = sleepTimer.get();
  const remaining = timer.mode === 'minutes' ? Math.max(0, timer.endsAt - Date.now()) : 0;
  showMenu({
    title: 'Sleep timer',
    message: sleepLabel(timer, remaining) ?? (getPrefs().sleepFade ? 'Fades out over the last 30 seconds.' : undefined),
    items: [
      { label: 'Turn off', hidden: timer.mode === 'off', destructive: true, onPress: () => sleepTimer.cancel() },
      { label: 'Add 10 minutes', hidden: timer.mode !== 'minutes', onPress: () => sleepTimer.extend(10) },
      ...[15, 30, 45, 60, 90].map((m) => ({
        label: m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : '1 hour 30 minutes',
        onPress: () => {
          sleepTimer.minutes(m);
          toast.show(`Sleep in ${m} minutes`);
        },
      })),
      {
        label: 'Custom…',
        onPress: async () => {
          const text = await promptText('Sleep in how many minutes?', { ok: 'Start' });
          const minutes = Number(text);
          if (text && Number.isFinite(minutes) && minutes > 0) sleepTimer.minutes(minutes);
        },
      },
      { label: 'End of this song', onPress: () => sleepTimer.songs(1) },
      {
        label: 'After a number of songs…',
        onPress: async () => {
          const text = await promptText('Stop after how many songs?', { message: 'This song counts as the first.', ok: 'Start' });
          const count = Number(text);
          if (text && Number.isInteger(count) && count > 0) sleepTimer.songs(count);
        },
      },
    ],
  });
}

export async function bookmarkHere(db: SQLiteDatabase, track: Track, positionMs: number) {
  const label = await promptText(`Bookmark at ${formatDuration(positionMs)}`, { message: 'A name is optional.', ok: 'Save' });
  if (label === null) return;
  await addBookmark(db, track.id, positionMs, label || null);
  libraryEvents.emit('changed', undefined);
  toast.show(`Bookmarked at ${formatDuration(positionMs)}`);
}

export async function bookmarksMenu(
  db: SQLiteDatabase,
  track: Track,
  opts: { positionMs: () => number; seek: (ms: number) => void; openAll: () => void },
) {
  const marks = await listBookmarks(db, track.id);
  showMenu({
    title: marks.length ? 'Bookmarks in this song' : 'No bookmarks in this song yet',
    items: [
      ...marks.map((b) => ({
        label: `${formatDuration(b.position_ms)}${b.label ? ` — ${b.label}` : ''}`,
        onPress: () => opts.seek(b.position_ms),
      })),
      { label: 'Bookmark this spot…', onPress: () => void bookmarkHere(db, track, opts.positionMs()) },
      { label: 'All bookmarks', onPress: opts.openAll },
    ],
  });
}

/** The A–B button: A, then B, then off, each said out loud in a toast. */
export function abMark(track: Track, positionMs: number, durationMs: number) {
  const result = abRepeat.mark(track.id, positionMs, durationMs);
  const loop = abRepeat.get();
  if (result === 'a') toast.show(`A set at ${formatDuration(positionMs)}. Tap again where the part ends.`);
  else if (result === 'b' && loop?.bMs != null) toast.show(`Repeating ${formatDuration(loop.aMs)} to ${formatDuration(loop.bMs)}`);
  else if (result === 'off') toast.show('A–B repeat off');
  else toast.show('B has to be at least a second after A');
}

/** Everything A–B repeat can do, for a long press or the player's menu. */
export function abMenu(track: Track, positionMs: number, durationMs: number, seek: (ms: number) => void) {
  const loop = abRepeat.get()?.trackId === track.id ? abRepeat.get() : null;
  const here = formatDuration(positionMs);
  showMenu({
    title: 'A–B repeat',
    message: !loop
      ? 'Plays one part of this song over and over.'
      : loop.bMs === null
        ? `A at ${formatDuration(loop.aMs)}. Set B where the part ends.`
        : `Repeating ${formatDuration(loop.aMs)} to ${formatDuration(loop.bMs)}.`,
    items: [
      { label: loop ? `Move A here (${here})` : `Set A here (${here})`, onPress: () => abRepeat.setA(track.id, positionMs, durationMs) },
      {
        label: loop?.bMs != null ? `Move B here (${here})` : `Set B here (${here})`,
        hidden: !loop,
        onPress: () => {
          if (!abRepeat.setB(track.id, positionMs, durationMs)) toast.show('B has to be at least a second after A');
        },
      },
      { label: 'Play from A', hidden: loop?.bMs == null, onPress: () => loop && seek(loop.aMs) },
      { label: 'Turn off', hidden: !loop, destructive: true, onPress: () => abRepeat.clear() },
    ],
  });
}

/** The header's "Playing from": switch to another queue, or open them all. */
export function queueMenu(openQueue: () => void) {
  const { queues, activeId } = queueSnapshot();
  showMenu({
    title: 'Playing from',
    items: [
      ...queues.map((q) => ({
        label: `${q.id === activeId ? '✓ ' : ''}${q.name} · ${formatCount(q.tracks.length, 'song')}`,
        onPress: () => void queue.switchTo(q.id),
      })),
      { label: 'Open the queue', onPress: openQueue },
    ],
  });
}
