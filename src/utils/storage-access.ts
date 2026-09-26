import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { NativeStorageAccess } from '../../modules/melodify-audio/src/MelodifyAudioModule';

/**
 * Android's permission to the music in shared storage. "full" is All files access (Android 11+),
 * or read and write before that: everything works. "read" is the media permission alone: songs
 * play, but `.lrc` files, tag editing, deleting and backups beside the music do not. iOS needs
 * none of this; the music is in the app's own folder, so it always reads "full".
 */
export type StorageAccess = NativeStorageAccess;

type Native = {
  storageAccess?(): StorageAccess;
  requestStorageAccess?(kind: 'full' | 'read'): Promise<StorageAccess>;
  sdkVersion?: number;
};

function native(): Native | null {
  if (Platform.OS !== 'android') return null;
  try {
    return require('../../modules/melodify-audio/src/MelodifyAudioModule').default as Native;
  } catch {
    return null;
  }
}

export function storageAccess(): StorageAccess {
  const mod = native();
  if (Platform.OS !== 'android') return 'full';
  return mod?.storageAccess?.() ?? 'none';
}

/**
 * Asks for access. "full" opens the system's All files access page, from which the user comes
 * back; before Android 11 it is the ordinary permission prompt. Resolves with what was granted.
 */
export async function requestStorageAccess(kind: 'full' | 'read' = 'full'): Promise<StorageAccess> {
  const mod = native();
  if (!mod?.requestStorageAccess) return storageAccess();
  try {
    return await mod.requestStorageAccess(kind);
  } catch {
    return storageAccess();
  }
}

/** Android 11 and later ask for All files access on a settings page, not in a prompt. */
export function accessIsASettingsPage(): boolean {
  return (native()?.sdkVersion ?? 0) >= 30;
}

/**
 * The access now, read again each time the app comes back to the foreground (from the settings
 * page, say), with a way to ask for more that updates it.
 */
export function useStorageAccess(): [StorageAccess, (kind: 'full' | 'read') => Promise<StorageAccess>] {
  const [access, setAccess] = useState(storageAccess);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setAccess(storageAccess());
    });
    return () => sub.remove();
  }, []);
  const request = async (kind: 'full' | 'read') => {
    const granted = await requestStorageAccess(kind);
    setAccess(granted);
    return granted;
  };
  return [access, request];
}
