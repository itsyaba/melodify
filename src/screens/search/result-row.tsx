import type { ReactNode } from 'react';
import { Artwork } from '@/components/artwork';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { useDensity } from '@/hooks/use-density';
import type { SearchItem } from '@/search/rank';
import { formatCount } from '@/utils/format';

interface Props {
  item: SearchItem;
  /** The playing song: its title takes the accent. */
  active?: boolean;
  trailing: ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}

/** A search result or recent search, named with its kind the way Spotify's are: "Song · fun.". */
export function ResultRow({ item, active, trailing, onPress, onLongPress }: Props) {
  const { art } = useDensity();
  let title: string;
  let subtitle: string;
  let leading: ReactNode;
  switch (item.kind) {
    case 'track': {
      const t = item.track;
      title = t.title;
      subtitle = ['Song', t.artist].filter(Boolean).join(' · ');
      leading = <Artwork artKey={t.art_key} size={art} />;
      break;
    }
    case 'album': {
      const a = item.album;
      title = a.album;
      subtitle = ['Album', a.album_artist].filter(Boolean).join(' · ');
      leading = <Artwork artKey={a.art_key} size={art} />;
      break;
    }
    case 'artist': {
      const g = item.artist;
      title = g.name;
      subtitle = `Artist · ${formatCount(g.track_count, 'song')}`;
      leading = <Artwork artKey={g.art_key} size={art} rounded="full" />;
      break;
    }
    case 'playlist': {
      const p = item.playlist;
      title = p.name;
      subtitle = `Playlist · ${formatCount(p.track_count, 'song')}`;
      leading = <Artwork artKey={p.art_key} size={art} />;
      break;
    }
    case 'folder': {
      const f = item.folder;
      title = f.name;
      subtitle = `Folder · ${f.path}`;
      leading = <IconTile name="folder.fill" size={art} />;
      break;
    }
  }
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      leading={leading}
      trailing={trailing}
      tinted={active}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}
