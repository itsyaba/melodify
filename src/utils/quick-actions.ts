import { AppState } from 'react-native';
import { router } from 'expo-router';
import { Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listAutoPlaylist, listTracks } from '@/db/tracks';
import { queue, queueSnapshot } from '@/player/queue-store';
import type { NativeShortcut } from '../../modules/melodify-audio/src/MelodifyAudio.types';

/**
 * Home screen quick actions: hold the app icon for Resume, Shuffle all, Favorites and Search.
 * Resume names the song it would play, so the list is refreshed whenever the app goes to the
 * background. Needs module 0.9.0, and a real install: under LiveContainer the icon belongs to
 * LiveContainer, whose own actions must not be replaced, so nothing is set there.
 */
type ActionType = 'resume' | 'shuffle' | 'favorites' | 'search';

type Native = {
  setShortcuts(items: NativeShortcut[]): Promise<void>;
  takeLaunchShortcut(): string | null;
  addListener(event: 'shortcut', fn: (payload: { type: string }) => void): unknown;
};

function native(): Native | null {
  try {
    const mod = require('../../modules/melodify-audio/src/MelodifyAudioModule').default as Partial<Native> | undefined;
    return typeof mod?.setShortcuts === 'function' && typeof mod.takeLaunchShortcut === 'function' ? (mod as Native) : null;
  } catch {
    return null;
  }
}

/** A LiveContainer guest's Documents sits inside LiveContainer's own, under Data/Application. */
export function isLiveContainerGuest(documentsUri = Paths.document.uri): boolean {
  return /\/Documents\/Data\/Application\/[^/]+\/Documents\/?$/.test(decodeURIComponent(documentsUri));
}

function shortcuts(): NativeShortcut[] {
  const { tracks, currentIndex } = queueSnapshot();
  const current = tracks[currentIndex];
  return [
    ...(current ? [{ type: 'resume', title: 'Resume', subtitle: current.title, symbol: 'play.fill' }] : []),
    { type: 'shuffle', title: 'Shuffle all', symbol: 'shuffle' },
    { type: 'favorites', title: 'Favorites', symbol: 'heart.fill' },
    { type: 'search', title: 'Search', symbol: 'magnifyingglass' },
  ];
}

let lastHandled = { type: '', at: 0 };

async function perform(db: SQLiteDatabase, type: string): Promise<void> {
  // iOS can report a launch action twice, in the launch options and again as an action.
  const now = Date.now();
  if (type === lastHandled.type && now - lastHandled.at < 3000) return;
  lastHandled = { type, at: now };
  switch (type as ActionType) {
    case 'resume': {
      const { state } = queueSnapshot();
      if (state !== 'playing') await queue.toggle();
      return;
    }
    case 'shuffle': {
      const tracks = await listTracks(db);
      if (tracks.length) await queue.playShuffled(tracks);
      return;
    }
    case 'favorites': {
      const tracks = await listAutoPlaylist(db, 'favorites');
      if (tracks.length) await queue.replace(tracks, 0);
      return;
    }
    case 'search':
      router.push('/search');
      return;
  }
}

/** After the queue is restored: runs a launch action, listens for later ones, keeps the list fresh. */
export function startQuickActions(db: SQLiteDatabase): void {
  const mod = native();
  if (!mod || isLiveContainerGuest()) return;
  const run = (type: string) =>
    void perform(db, type).catch((err: unknown) => console.warn('[melodify] quick action failed:', type, err));
  const publish = () => void mod.setShortcuts(shortcuts()).catch(() => undefined);
  mod.addListener('shortcut', ({ type }) => run(type));
  const launch = mod.takeLaunchShortcut();
  // The navigator mounts after the database is ready; a push before that has nowhere to go.
  if (launch) setTimeout(() => run(launch), launch === 'search' ? 500 : 0);
  publish();
  AppState.addEventListener('change', (next) => {
    if (next === 'background') publish();
  });
}
