import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { toast } from '@/components/toast';
import type { Track } from '@/db/types';
import { queue } from '@/player/queue-store';
import { scanLibrary } from '@/scan/scanner';
import { musicRoot } from '@/storage';

/**
 * Android's "Open with Melodify": a file manager, the downloads list or a chat app hands over a
 * song. If it is one of the library's, it plays next, straight away, as a bookmark does, and the
 * queue is otherwise left alone. A song in the phone's storage that no scan has seen yet is
 * scanned in first. The system delivers the file as a link, which expo-router passes through
 * `src/app/+native-intent.tsx` to here.
 */

type Opened = { path: string | null; name: string | null; size: number | null };
type Native = { resolveOpenedFile?(uri: string): Promise<Opened> };

let db: SQLiteDatabase | null = null;
let pending: string | null = null;

export function isOpenedFile(url: string): boolean {
  return Platform.OS === 'android' && /^(content|file):\/\//i.test(url);
}

/** Called for every such link; one that arrives before the queue is restored waits for it. */
export function handleOpenedFile(url: string): void {
  pending = url;
  if (db) void run(db);
}

/** After the queue is restored at launch, as the quick actions start. */
export function startOpenWith(database: SQLiteDatabase): void {
  db = database;
  if (pending) void run(database);
}

function native(): Native | null {
  try {
    return require('../../modules/melodify-audio/src/MelodifyAudioModule').default as Native;
  } catch {
    return null;
  }
}

/** The file's path relative to the music folder, or null when it is not inside it. */
function relativePath(absolute: string): string | null {
  const root = decodeURIComponent(musicRoot.uri).replace(/^file:\/\//, '').replace(/\/$/, '');
  return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : null;
}

async function find(database: SQLiteDatabase, opened: Opened): Promise<Track | null> {
  const relative = opened.path ? relativePath(opened.path) : null;
  if (relative) {
    const byPath = await database.getFirstAsync<Track>('SELECT * FROM tracks WHERE path = ?', relative);
    if (byPath) return byPath;
  }
  if (!opened.name) return null;
  // Same name, and the same size where it is known: a copy of the song kept somewhere else.
  return database.getFirstAsync<Track>(
    'SELECT * FROM tracks WHERE filename = ? ORDER BY (size = ?) DESC, id LIMIT 1',
    opened.name,
    opened.size ?? -1,
  );
}

async function run(database: SQLiteDatabase): Promise<void> {
  const url = pending;
  pending = null;
  if (!url) return;
  try {
    const opened = await native()?.resolveOpenedFile?.(url);
    if (!opened) return;
    let track = await find(database, opened);
    if (!track && opened.path && relativePath(opened.path)) {
      toast.show('Adding it to the library…');
      await scanLibrary(database);
      track = await find(database, opened);
    }
    if (!track) {
      toast.show('That song is not in the phone’s storage, so Melodify cannot keep it in the library.');
      return;
    }
    await queue.jumpTo(track, 0);
    router.navigate('/player');
  } catch (err) {
    toast.show(`Could not open the song: ${err instanceof Error ? err.message : String(err)}`);
  }
}
