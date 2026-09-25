import type { AlbumSummary } from '@/db/types';
import { Tile, tileGap } from './tile';

const SIZE = 132;

interface Props {
  album: AlbumSummary;
  /** Side of the artwork; the card is that wide. */
  size?: number;
  /** What the second line shows: the year (on an artist, where the artist is known) or the artist. */
  subtitle?: 'year' | 'artist';
  onPress: () => void;
  onLongPress?: () => void;
}

/** An album as a tile: the strip on an artist, genre or year, and the albums grid. */
export function AlbumCard({ album, size = SIZE, subtitle = 'year', onPress, onLongPress }: Props) {
  const second = subtitle === 'year' ? (album.year ?? album.album_artist) : (album.album_artist ?? album.year);
  return (
    <Tile
      artKey={album.art_key}
      title={album.album}
      subtitle={second}
      size={size}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${album.album}${album.album_artist ? ` by ${album.album_artist}` : ''}`}
    />
  );
}

export const albumCardGap = tileGap;
