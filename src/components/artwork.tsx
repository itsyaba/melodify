import { useState } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { artFileUri } from '@/storage';
import { makeStyles, radius } from '@/theme';

/**
 * Shown for songs with no embedded or folder art, and for art whose file has gone missing. It lives
 * in the audio module because the lock screen shows the same file, and a pod can only bundle
 * resources from inside its own folder.
 */
export const DEFAULT_ART: ImageSourcePropType = require('../../modules/melodify-audio/ios/Resources/default-art.jpg');

interface Props {
  /** Folder art, relative to the music folder, or extracted art in the cache (`.artcache/…`). */
  artKey: string | null;
  /** The width, and the height too unless `height` is given. */
  size: number;
  /** For art that is not square, e.g. Search's tall Discover cards; the cover is cropped to fill. */
  height?: number;
  rounded?: keyof typeof radius;
}

export function artUri(artKey: string | null): string | null {
  if (!artKey) return null;
  return artFileUri(artKey);
}

/** The song's own art, or the default cover when it has none. */
export function artSource(artKey: string | null): ImageSourcePropType {
  const uri = artUri(artKey);
  return uri ? { uri } : DEFAULT_ART;
}

export function Artwork({ artKey, size, height = size, rounded = 'sm' }: Props) {
  const styles = useStyles();
  // Keyed by uri rather than a plain flag, so a row reused for another song does not inherit
  // the previous song's failure.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const uri = artUri(artKey);
  const source = uri && uri !== failedUri ? { uri } : DEFAULT_ART;
  const box = { width: size, height, borderRadius: radius[rounded] };
  return (
    <Image
      source={source}
      style={[styles.image, box]}
      resizeMode="cover"
      onError={uri ? () => setFailedUri(uri) : undefined}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  // Behind the image while it decodes, so a row never flashes transparent.
  image: { backgroundColor: colors.fill },
}));
