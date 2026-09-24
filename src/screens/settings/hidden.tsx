import { StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyState } from '@/components/empty-state';
import { toast } from '@/components/toast';
import { TrackList } from '@/components/track-list';
import { listHiddenTracks } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { setTracksHidden } from '@/player/track-edits';
import { colors } from '@/theme';
import { formatCount } from '@/utils/format';

const NO_TRACKS: Track[] = [];

/** Songs hidden from the library, to bring back. Their long-press menu has "Show in library". */
export function HiddenSongsScreen() {
  const db = useSQLiteContext();
  const { data } = useLibraryQuery(listHiddenTracks);
  const tracks = data ?? NO_TRACKS;
  return (
    <View style={styles.root}>
      <TrackList
        tracks={tracks}
        batchExtra={(indexes) => [
          {
            label: 'Show in library',
            onPress: () =>
              void setTracksHidden(db, indexes.map((i) => tracks[i]), false).then(() =>
                toast.show(`${formatCount(indexes.length, 'song')} back in the library`),
              ),
          },
        ]}
        empty={data ? <EmptyState title="No hidden songs" body="Long-press a song and choose Hide from library." /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
