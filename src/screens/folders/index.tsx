import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { TrackRow } from '@/components/track-row';
import { listFolder } from '@/db/tracks';
import type { FolderEntry, Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { playTrackFromList } from '@/player/queue-actions';
import { colors } from '@/theme';
import { formatCount } from '@/utils/format';

type Row = { kind: 'folder'; folder: FolderEntry } | { kind: 'track'; track: Track };

export function FoldersScreen({ path }: { path: string }) {
  const router = useRouter();
  const { data } = useLibraryQuery((db) => listFolder(db, path), [path]);
  const rows: Row[] = [
    ...(data?.folders ?? []).map((folder) => ({ kind: 'folder', folder }) as Row),
    ...(data?.tracks ?? []).map((track) => ({ kind: 'track', track }) as Row),
  ];
  const tracks = data?.tracks ?? [];
  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'folder' ? `d:${r.folder.path}` : `t:${r.track.id}`)}
        renderItem={({ item }) =>
          item.kind === 'folder' ? (
            <ListRow
              title={item.folder.name}
              subtitle={formatCount(item.folder.track_count, 'song')}
              onPress={() => router.push({ pathname: '/folder/[...path]', params: { path: item.folder.path.split('/') } })}
            />
          ) : (
            <TrackRow track={item.track} onPress={(t) => playTrackFromList(t, tracks)} />
          )
        }
        ListEmptyComponent={
          data ? <EmptyState title="Empty folder" body={path === '' ? 'Scan your library from Settings.' : undefined} /> : null
        }
        contentInsetAdjustmentBehavior="automatic"
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
