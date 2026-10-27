import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { addToPlaylist, createPlaylist, listPlaylists } from '@/db/playlists';
import type { GroupKind } from '@/db/tracks';
import type { Track } from '@/db/types';
import { lyricsFromLrclib } from '@/hooks/use-lyrics-search';
import { queue, queueSnapshot } from '@/player/queue-store';
import { deleteTrackFiles, setFavorites, setTracksHidden, shareTrack } from '@/player/track-edits';
import { getPrefs } from '@/prefs';
import { canEditTags } from '@/tags';
import { libraryEvents } from '@/utils/events';
import { formatCount } from '@/utils/format';
import { confirm, promptText, showMenu, type MenuItem } from './menus';
import { toast } from './toast';

const songs = (n: number) => formatCount(n, 'song');

/** Offers undo for the queue edit just made; the undo stack is shared, so this is that edit. */
function undoable(text: string) {
  toast.show(text, { label: 'Undo', onPress: () => void queue.undo() });
}

function queueName(id: number): string {
  return queueSnapshot().queues.find((q) => q.id === id)?.name ?? 'queue';
}

export async function appendTo(tracks: Track[], queueId = queueSnapshot().activeId) {
  if (tracks.length === 0) return;
  await queue.append(tracks, queueId);
  undoable(`Added ${songs(tracks.length)} to ${queueName(queueId)}`);
}

export async function playNextIn(tracks: Track[], queueId = queueSnapshot().activeId) {
  if (tracks.length === 0) return;
  await queue.playNext(tracks, queueId);
  undoable(`${songs(tracks.length)} will play next`);
}

/** Every queue plus a new one, for "Add to queue…". */
export function chooseQueue(tracks: Track[]) {
  const { queues, activeId } = queueSnapshot();
  showMenu({
    title: `Add ${songs(tracks.length)} to`,
    items: [
      ...queues.map((q) => ({
        label: `${q.name}${q.id === activeId ? ' (playing)' : ''} · ${q.tracks.length}`,
        icon: 'list.bullet' as const,
        onPress: () => void appendTo(tracks, q.id),
      })),
      {
        label: 'New queue…',
        icon: 'plus',
        onPress: async () => {
          const name = await promptText('New queue', { message: 'Leave empty for a numbered name.', ok: 'Create' });
          if (name === null) return;
          const id = await queue.createQueue({ name, tracks });
          if (id === null) toast.show('That is the most queues there can be');
          else toast.show(`Created ${queueName(id)} with ${songs(tracks.length)}`);
        },
      },
    ],
  });
}

export async function newPlaylistWith(db: SQLiteDatabase, tracks: Track[], suggested = '') {
  const name = await promptText('New playlist', { defaultValue: suggested, ok: 'Create' });
  if (!name) return null;
  const id = await createPlaylist(db, name, tracks.map((t) => t.id));
  libraryEvents.emit('changed', undefined);
  toast.show(tracks.length ? `Saved ${songs(tracks.length)} to ${name}` : `Created ${name}`);
  return id;
}

export async function choosePlaylist(db: SQLiteDatabase, tracks: Track[]) {
  const playlists = await listPlaylists(db, 'updated');
  showMenu({
    title: `Add ${songs(tracks.length)} to playlist`,
    items: [
      { label: 'New playlist…', icon: 'plus', onPress: () => void newPlaylistWith(db, tracks) },
      ...playlists.map((p) => ({
        label: `${p.name} · ${p.track_count}`,
        icon: 'music.note.list' as const,
        onPress: async () => {
          await addToPlaylist(db, p.id, tracks.map((t) => t.id));
          libraryEvents.emit('changed', undefined);
          toast.show(`Added ${songs(tracks.length)} to ${p.name}`);
        },
      })),
    ],
  });
}

/** Asks first, since this removes files from the phone, not just rows from the library. */
export async function confirmDelete(db: SQLiteDatabase, tracks: Track[]): Promise<boolean> {
  const what = tracks.length === 1 ? `“${tracks[0].title}”` : songs(tracks.length);
  const ok = await confirm(
    `Delete ${what}?`,
    'The file is removed from this phone and from every playlist and queue. This cannot be undone.',
    'Delete',
  );
  if (!ok) return false;
  const failed = await deleteTrackFiles(db, tracks);
  toast.show(failed ? `${songs(failed)} could not be deleted` : `Deleted ${what}`);
  return failed === 0;
}

export function groupHref(kind: GroupKind, value: string) {
  return { pathname: '/group/[kind]/[value]', params: { kind, value } } as const;
}

export function albumHref(album: string, albumArtist: string | null) {
  return { pathname: '/album/[id]', params: { id: album, artist: albumArtist ?? '' } } as const;
}

export function tagsHref(tracks: Track[]) {
  return { pathname: '/tags', params: { ids: tracks.map((t) => t.id).join(',') } } as const;
}

interface TrackMenuOptions {
  /** Screen-specific items shown before anything else: the player's own tools. */
  first?: MenuItem[];
  /** Screen-specific items, shown after the queue items: "Remove from playlist" and so on. */
  extra?: MenuItem[];
  /** Adds "Select" to start multi-select with this track. */
  onSelect?: () => void;
  /** Runs before a "Go to" item navigates: the player uses it to close itself first. */
  beforeNavigate?: () => void;
  /** Leaves "Preview" out: the player is already playing this song in full. */
  previewing?: boolean;
}

/** How a collection's menu is headed: its cover, and a line under its name. */
export interface CollectionLook {
  artKey?: string | null;
  subtitle?: string;
  /** Round art, for an artist. */
  round?: boolean;
}

/**
 * Long-press menus. A hook because the playlist items need the database and the "Go to" items
 * need the router; the functions themselves are plain and can be called from any handler.
 */
export function useTrackActions() {
  const db = useSQLiteContext();
  const router = useRouter();
  return useMemo(() => {
    /** The items every list of tracks shares: queueing, playlists. */
    const queueItems = (tracks: Track[]): MenuItem[] => [
      { label: 'Play next', icon: 'text.line.first.and.arrowtriangle.forward', onPress: () => void playNextIn(tracks) },
      { label: 'Add to queue', icon: 'text.line.last.and.arrowtriangle.forward', onPress: () => void appendTo(tracks) },
      { label: 'Add to another queue…', icon: 'rectangle.stack', onPress: () => chooseQueue(tracks) },
      { label: 'Add to playlist…', icon: 'plus.circle', onPress: () => void choosePlaylist(db, tracks) },
    ];

    return {
      queueItems,
      trackMenu(track: Track, opts: TrackMenuOptions = {}) {
        const go = (href: Parameters<typeof router.push>[0]) => {
          opts.beforeNavigate?.();
          router.push(href);
        };
        showMenu({
          title: track.title,
          message: [track.artist, track.album].filter(Boolean).join(' • ') || undefined,
          artKey: track.art_key,
          items: [
            ...(opts.first ?? []),
            {
              label: 'Preview',
              icon: 'waveform',
              hidden: opts.previewing === true,
              onPress: () => void queue.preview(track),
            },
            ...queueItems([track]),
            ...(opts.extra ?? []),
            {
              label: track.favorite ? 'Remove from favorites' : 'Add to favorites',
              icon: track.favorite ? 'heart.slash' : 'heart',
              onPress: () => void queue.setFavorite(track, !track.favorite),
            },
            {
              label: 'Go to album',
              icon: 'opticaldisc',
              hidden: !track.album,
              onPress: () => go(albumHref(track.album!, track.album_artist ?? track.artist)),
            },
            {
              label: 'Go to artist',
              icon: 'person',
              hidden: !track.artist,
              onPress: () => go(groupHref('artist', track.artist!)),
            },
            {
              label: 'Go to folder',
              icon: 'folder',
              // A switched-off tab cannot be navigated to at all.
              hidden: !track.folder || !getPrefs().tabs.includes('folders'),
              onPress: () => go({ pathname: '/folder/[...path]', params: { path: track.folder.split('/') } }),
            },
            { label: 'Select', icon: 'checkmark.circle', hidden: !opts.onSelect, onPress: () => opts.onSelect?.() },
            // Not through `go`: details and the editors open as sheets, so over the player is fine.
            { label: 'Details', icon: 'info.circle', onPress: () => router.push({ pathname: '/track/[id]', params: { id: String(track.id) } }) },
            { label: 'Edit tags…', icon: 'tag', hidden: !canEditTags(), onPress: () => router.push(tagsHref([track])) },
            { label: 'Edit lyrics…', icon: 'quote.bubble', onPress: () => router.push({ pathname: '/lyrics/[id]', params: { id: String(track.id) } }) },
            { label: 'Lyrics from LRCLIB…', icon: 'globe', onPress: () => void lyricsFromLrclib(db, track) },
            { label: 'Share file…', icon: 'square.and.arrow.up', onPress: () => void shareTrack(track) },
            {
              label: track.hidden ? 'Show in library' : 'Hide from library',
              icon: track.hidden ? 'eye' : 'eye.slash',
              onPress: () =>
                void setTracksHidden(db, [track], !track.hidden).then(() =>
                  toast.show(track.hidden ? `“${track.title}” is back in the library` : `Hid “${track.title}”. Settings lists hidden songs.`),
                ),
            },
            { label: 'Delete file…', icon: 'trash', destructive: true, onPress: () => void confirmDelete(db, [track]) },
          ],
        });
      },
      /** For an album, artist, folder or playlist row: the tracks are loaded only if an item is picked. */
      collectionMenu(title: string, load: (db: SQLiteDatabase) => Promise<Track[]>, extra: MenuItem[] = [], look: CollectionLook = {}) {
        const withTracks = (fn: (tracks: Track[]) => unknown) => () => {
          void load(db).then((tracks) => {
            if (tracks.length === 0) toast.show('No songs in there');
            else fn(tracks);
          });
        };
        showMenu({
          title,
          message: look.subtitle,
          artKey: look.artKey,
          round: look.round,
          items: [
            { label: 'Play', icon: 'play.circle', onPress: withTracks((t) => queue.replace(t, 0)) },
            { label: 'Shuffle', icon: 'shuffle', onPress: withTracks((t) => queue.playShuffled(t)) },
            { label: 'Play next', icon: 'text.line.first.and.arrowtriangle.forward', onPress: withTracks((t) => playNextIn(t)) },
            { label: 'Add to queue', icon: 'text.line.last.and.arrowtriangle.forward', onPress: withTracks((t) => appendTo(t)) },
            { label: 'Add to another queue…', icon: 'rectangle.stack', onPress: withTracks((t) => chooseQueue(t)) },
            { label: 'Add to playlist…', icon: 'plus.circle', onPress: withTracks((t) => choosePlaylist(db, t)) },
            ...extra,
          ],
        });
      },
      /** For a multi-selection. */
      batchMenu(tracks: Track[], extra: MenuItem[] = []) {
        if (tracks.length === 0) return;
        showMenu({
          title: `${songs(tracks.length)} selected`,
          items: [
            { label: 'Play', icon: 'play.circle', onPress: () => void queue.replace(tracks, 0) },
            { label: 'Shuffle', icon: 'shuffle', onPress: () => void queue.playShuffled(tracks) },
            ...queueItems(tracks),
            { label: 'Add to favorites', icon: 'heart', onPress: () => void setFavorites(db, tracks, true).then(() => toast.show(`Added ${songs(tracks.length)} to favorites`)) },
            { label: 'Edit tags…', icon: 'tag', hidden: !canEditTags(), onPress: () => router.push(tagsHref(tracks)) },
            ...extra,
            {
              label: 'Hide from library',
              icon: 'eye.slash',
              onPress: () => void setTracksHidden(db, tracks, true).then(() => toast.show(`Hid ${songs(tracks.length)}`)),
            },
            { label: 'Delete files…', icon: 'trash', destructive: true, onPress: () => void confirmDelete(db, tracks) },
          ],
        });
      },
    };
  }, [db, router]);
}
