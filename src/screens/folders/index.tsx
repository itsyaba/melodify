import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyState } from '@/components/empty-state';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { ListToolbar } from '@/components/list-toolbar';
import { useTrackActions } from '@/components/track-actions';
import { TrackList, type LeadingRow } from '@/components/track-list';
import { listFolder, listFolderTracksRecursive } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { colors } from '@/theme';
import { formatCount } from '@/utils/format';

const NO_TRACKS: Track[] = [];

/**
 * One folder: its subfolders, then the songs directly inside it. Play and shuffle take in
 * everything beneath the folder, as Musicolet's do; tapping a song plays just this level.
 */
export function FoldersScreen({ path }: { path: string }) {
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const { data } = useLibraryQuery((d) => listFolder(d, path), [path]);
  const tracks = data?.tracks ?? NO_TRACKS;
  const folders = data?.folders;
  const below = useMemo(
    () => (folders ?? []).reduce((sum, f) => sum + f.track_count, 0) + tracks.length,
    [folders, tracks],
  );

  const leading: LeadingRow[] = useMemo(
    () =>
      (folders ?? []).map((folder) => ({
        key: folder.path,
        element: (
          <ListRow
            title={folder.name}
            subtitle={formatCount(folder.track_count, 'song')}
            leading={<IconTile name="folder.fill" />}
            onPress={() => router.push({ pathname: '/folder/[...path]', params: { path: folder.path.split('/') } })}
            onLongPress={() => actions.collectionMenu(folder.name, (d) => listFolderTracksRecursive(d, folder.path))}
          />
        ),
      })),
    [folders, router, actions],
  );

  const playAll = async (shuffle: boolean) => {
    const all = await listFolderTracksRecursive(db, path);
    if (shuffle) await queue.playShuffled(all);
    else await queue.replace(all, 0);
  };

  const summary = [
    folders?.length ? formatCount(folders.length, 'folder') : null,
    formatCount(below, 'song'),
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <TrackList
        tracks={tracks}
        leading={leading}
        header={
          below > 0 ? (
            <ListToolbar summary={summary} onShuffle={() => void playAll(true)} onPlay={() => void playAll(false)} />
          ) : null
        }
        onMenu={
          below > 0
            ? () => actions.collectionMenu(path.split('/').pop() || 'All music', (d) => listFolderTracksRecursive(d, path))
            : undefined
        }
        empty={
          data && leading.length === 0 ? (
            <EmptyState title="Empty folder" body={path === '' ? 'Scan your library from Settings.' : undefined} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
