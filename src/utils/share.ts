import { Platform, Share } from 'react-native';

type NativeShare = { shareFile?(uri: string, mimeType: string | null, title: string | null): Promise<void> };

function native(): NativeShare | null {
  try {
    return require('../../modules/melodify-audio/src/MelodifyAudioModule').default as NativeShare;
  } catch {
    return null;
  }
}

/**
 * The share sheet with a file itself: a song, a backup, an exported playlist. iOS takes the
 * file:// URL as it is; Android needs it as a content:// URI granted to the receiving app, which
 * the module makes through its FileProvider.
 */
export async function shareFile(uri: string, opts: { title?: string; mimeType?: string } = {}): Promise<void> {
  if (Platform.OS === 'android') {
    const mod = native();
    if (typeof mod?.shareFile === 'function') {
      await mod.shareFile(uri, opts.mimeType ?? null, opts.title ?? null);
      return;
    }
  }
  await Share.share({ url: uri, title: opts.title });
}
