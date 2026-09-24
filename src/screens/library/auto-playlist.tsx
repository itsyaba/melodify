import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { EmptyState } from '@/components/empty-state';
import { ListToolbar } from '@/components/list-toolbar';
import { useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { listAutoPlaylist, type AutoPlaylist } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { colors } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

export const AUTO_PLAYLISTS: readonly { kind: AutoPlaylist; title: string; icon: SFSymbol; empty: string }[] = [
  { kind: 'favorites', title: 'Favorites', icon: 'heart.fill', empty: 'Long-press a song and choose Add to favorites, or tap the heart in the player.' },
  { kind: 'recently_added', title: 'Recently added', icon: 'calendar.badge.plus', empty: 'Songs appear here after a scan.' },
  { kind: 'most_played', title: 'Most played', icon: 'chart.bar.fill', empty: 'A song counts as played at half way, or four minutes in.' },
  { kind: 'recently_played', title: 'Recently played', icon: 'clock.arrow.circlepath', empty: 'Nothing played yet.' },
];

const NO_TRACKS: Track[] = [];

/**
 * A playlist the library fills in by itself. Plays are counted without telling the lists, so as
 * not to reload every screen once a song, and this one refreshes whenever it comes into view.
 */
export function AutoPlaylistScreen({ kind }: { kind: AutoPlaylist }) {
  const actions = useTrackActions();
  const meta = AUTO_PLAYLISTS.find((p) => p.kind === kind)!;
  const { data, refresh } = useLibraryQuery((db) => listAutoPlaylist(db, kind), [kind]);
  useFocusEffect(useCallback(() => refresh(), [refresh]));
  const tracks = data ?? NO_TRACKS;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  return (
    <View style={styles.root}>
      <TrackList
        tracks={tracks}
        header={
          tracks.length ? (
            <ListToolbar
              summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`}
              onShuffle={() => void queue.playShuffled(tracks)}
              onPlay={() => void queue.replace(tracks, 0)}
            />
          ) : null
        }
        empty={data ? <EmptyState title={`No ${meta.title.toLowerCase()} yet`} body={meta.empty} /> : null}
        onMenu={tracks.length ? () => actions.collectionMenu(meta.title, async () => tracks) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
