import { FlatList, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { promptText, showMenu } from '@/components/menus';
import { deleteBookmark, listBookmarks, renameBookmark } from '@/db/bookmarks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { artSize, makeStyles } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatDate, formatDuration } from '@/utils/format';

/** Every bookmark, newest first. Tap to play from it; long press to rename or delete. */
export function BookmarksScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const { data } = useLibraryQuery((d) => listBookmarks(d));
  return (
    <View style={styles.root}>
      <FlatList
        data={data}
        keyExtractor={(b) => String(b.id)}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => (
          <ListRow
            title={item.label ? `${item.label} — ${item.track.title}` : item.track.title}
            subtitle={`at ${formatDuration(item.position_ms)} · ${formatDate(item.created_at)}`}
            leading={<Artwork artKey={item.track.art_key} size={artSize.row} />}
            trailing={null}
            onPress={() => void queue.jumpTo(item.track, item.position_ms)}
            onLongPress={() =>
              showMenu({
                title: item.label ?? item.track.title,
                items: [
                  { label: 'Play from here', onPress: () => void queue.jumpTo(item.track, item.position_ms) },
                  {
                    label: 'Rename…',
                    onPress: async () => {
                      const label = await promptText('Rename bookmark', { defaultValue: item.label ?? '', ok: 'Save' });
                      if (label === null) return;
                      await renameBookmark(db, item.id, label || null);
                      libraryEvents.emit('changed', undefined);
                    },
                  },
                  {
                    label: 'Delete bookmark',
                    destructive: true,
                    onPress: async () => {
                      await deleteBookmark(db, item.id);
                      libraryEvents.emit('changed', undefined);
                    },
                  },
                ],
              })
            }
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              title="No bookmarks"
              body="In the player, tap the bookmark button to mark the current spot in a long track."
            />
          ) : null
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({ root: { flex: 1, backgroundColor: colors.background } }));
