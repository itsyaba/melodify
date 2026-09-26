import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { serial } from '@/db/serial';
import { deleteTrackRows, setFavorite, setHidden } from '@/db/tracks';
import type { Track } from '@/db/types';
import { musicUri, notifyMediaChanged } from '@/storage';
import { libraryEvents } from '@/utils/events';
import { shareFile } from '@/utils/share';
import { patchTracks, queue } from './queue-store';

/**
 * Changes to tracks themselves rather than to a queue: favorite, hide, delete, share. Each keeps
 * the in-memory queue copies in step with the rows and tells the lists to reload.
 */

export function fileUri(track: Track): string {
  return musicUri(track.path);
}

export async function setFavorites(db: SQLiteDatabase, tracks: Track[], favorite: boolean): Promise<void> {
  if (tracks.length === 1) return queue.setFavorite(tracks[0], favorite);
  await serial(async () => {
    for (const t of tracks) await setFavorite(db, t.id, favorite);
  });
  patchTracks(tracks.map((t) => t.id), { favorite: favorite ? 1 : 0 });
  libraryEvents.emit('changed', undefined);
}

/** Hidden songs stay in queues and playlists; they only leave the library lists. */
export async function setTracksHidden(db: SQLiteDatabase, tracks: Track[], hidden: boolean): Promise<void> {
  const ids = tracks.map((t) => t.id);
  await serial(() => setHidden(db, ids, hidden));
  patchTracks(ids, { hidden: hidden ? 1 : 0 });
  libraryEvents.emit('changed', undefined);
}

/**
 * Deletes the files from the phone, then their rows, which takes them out of every playlist
 * through the foreign keys, and out of the queues. Returns how many files could not be deleted;
 * their rows stay, so the library still matches what is on disk.
 */
export async function deleteTrackFiles(db: SQLiteDatabase, tracks: Track[]): Promise<number> {
  const deleted: number[] = [];
  let failed = 0;
  for (const t of tracks) {
    try {
      const file = new File(fileUri(t));
      if (file.exists) file.delete();
      deleted.push(t.id);
    } catch (err) {
      failed += 1;
      console.warn('[melodify] deleting a file failed:', t.path, err);
    }
  }
  if (deleted.length) {
    notifyMediaChanged(tracks.filter((t) => deleted.includes(t.id)).map(fileUri));
    await queue.forgetTracks(deleted);
    await serial(() => deleteTrackRows(db, deleted));
    libraryEvents.emit('changed', undefined);
  }
  return failed;
}

/** The share sheet with the audio file itself: AirDrop or Files on iOS, any app on Android. */
export async function shareTrack(track: Track): Promise<void> {
  await shareFile(fileUri(track), { title: track.title });
}
