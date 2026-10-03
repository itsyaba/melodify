import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { exportPlaylist, shareFile } from '@/backup';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListToolbar } from '@/components/list-toolbar';
import { confirm, promptText } from '@/components/menus';
import { ReorderableList } from '@/components/reorderable-list';
import { toast } from '@/components/toast';
import { useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { TrackRow } from '@/components/track-row';
import { deletePlaylist, getPlaylist, listPlaylistTracks, renamePlaylist, setPlaylistTracks } from '@/db/playlists';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useTrackSort } from '@/hooks/use-track-sort';
import { moveTrack, removeTracks } from '@/player/queue-ops';
import { queue } from '@/player/queue-store';
import { artSize, makeStyles, spacing, type, useTheme } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatCount, formatDuration } from '@/utils/format';

const NO_TRACKS: Track[] = [];

export function PlaylistScreen({ id }: { id: number }) {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const router = useRouter();
  const actions = useTrackActions();
  const { data: playlist } = useLibraryQuery((d) => getPlaylist(d, id), [id]);
  const { data } = useLibraryQuery((d) => listPlaylistTracks(d, id), [id]);
  const tracks = data ?? NO_TRACKS;
  // Sorting only changes how the list is shown; edits work on the playlist's own order.
  const sorted = useTrackSort('playlist.songs', tracks, { label: 'Playlist order' });
  const own = (indexes: number[]) => indexes.map((i) => sorted.order[i]).sort((a, b) => a - b);
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);
  const name = playlist?.name ?? '';

  /** Saves a new order or a removal; the list reloads through the change event. */
  const save = async (next: Track[]) => {
    await setPlaylistTracks(db, id, next.map((t) => t.id));
    libraryEvents.emit('changed', undefined);
  };

  const removeAt = async (indexes: number[]) => {
    const before = tracks;
    await save(removeTracks({ tracks, currentIndex: -1 }, indexes).tracks);
    toast.show(`Removed ${formatCount(indexes.length, 'song')} from ${name}`, {
      label: 'Undo',
      onPress: () => void save(before),
    });
  };

  const menu = () =>
    actions.collectionMenu(name, (d) => listPlaylistTracks(d, id), [
      { label: 'Reorder and remove', hidden: tracks.length === 0, onPress: () => setEditing(true) },
      {
        label: 'Rename…',
        onPress: async () => {
          const next = await promptText('Rename playlist', { defaultValue: name, ok: 'Rename' });
          if (!next) return;
          await renamePlaylist(db, id, next);
          libraryEvents.emit('changed', undefined);
        },
      },
      {
        label: 'Export as M3U',
        hidden: tracks.length === 0,
        onPress: async () => {
          try {
            const file = await exportPlaylist(db, id, name);
            toast.show(`Saved ${file.path}`, { label: 'Share', onPress: () => void shareFile(file.uri) });
          } catch (err) {
            toast.show(`Exporting failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
      },
      {
        label: 'Delete playlist',
        destructive: true,
        onPress: async () => {
          if (!(await confirm(`Delete “${name}”?`, 'The songs stay in your library.', 'Delete'))) return;
          await deletePlaylist(db, id);
          libraryEvents.emit('changed', undefined);
          router.back();
        },
      },
    ]);

  const header = (
    <View style={styles.header}>
      <Artwork artKey={tracks.find((t) => t.art_key)?.art_key ?? null} size={artSize.card} rounded="lg" />
      <Text style={[type.title, { color: colors.label, textAlign: 'center' }]}>{name}</Text>
      <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>
        {formatCount(tracks.length, 'song')} · {formatDuration(total)}
      </Text>
      {tracks.length && !editing ? (
        <View style={styles.buttons}>
          <IconButton name="play.fill" color={colors.tint} onPress={() => void queue.replace(sorted.tracks, 0)} accessibilityLabel="Play playlist" />
          <IconButton name="shuffle" color={colors.tint} onPress={() => void queue.playShuffled(tracks)} accessibilityLabel="Shuffle playlist" />
        </View>
      ) : null}
    </View>
  );

  const empty = data ? (
    <EmptyState title="Empty playlist" body="Long-press songs anywhere in the library and choose Add to playlist." />
  ) : null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: name }} />
      {editing ? (
        <EditOrder
          tracks={tracks}
          header={header}
          onDone={stopEditing}
          onMove={(from, to) => void save(moveTrack({ tracks, currentIndex: -1 }, from, to).tracks)}
          onRemove={(index) => void removeAt([index])}
        />
      ) : (
        <TrackList
          tracks={sorted.tracks}
          header={
            tracks.length > 1 ? (
              <View>
                {header}
                <ListToolbar sort={sorted.sort} />
              </View>
            ) : (
              header
            )
          }
          empty={empty}
          onMenu={menu}
          menuExtra={(index) => [{ label: 'Remove from playlist', destructive: true, onPress: () => void removeAt(own([index])) }]}
          batchExtra={(indexes) => [
            { label: 'Remove from playlist', destructive: true, onPress: () => void removeAt(own(indexes)) },
          ]}
        />
      )}
    </View>
  );
}

/** Drag handles and swipe-to-remove, with a Done button in the header. */
function EditOrder({
  tracks,
  header,
  onDone,
  onMove,
  onRemove,
}: {
  tracks: Track[];
  header: React.ReactElement;
  onDone: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const colors = useTheme();
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={onDone} hitSlop={spacing.sm} accessibilityRole="button">
          <Text style={[type.headline, { color: colors.tint }]}>Done</Text>
        </Pressable>
      ),
    });
  }, [navigation, onDone]);
  useLayoutEffect(() => () => navigation.setOptions({ headerRight: undefined }), [navigation]);

  return (
    <ReorderableList
      data={tracks}
      keyExtractor={(t, i) => `${t.id}:${i}`}
      header={header}
      onMove={onMove}
      onSwipeRemove={onRemove}
      renderItem={({ item, handle }) => <TrackRow track={item} trailing={handle} />}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  buttons: { flexDirection: 'row', gap: spacing.xxl, paddingTop: spacing.sm },
}));
