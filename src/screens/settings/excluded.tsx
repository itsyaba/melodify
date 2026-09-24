import { FlatList, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyState } from '@/components/empty-state';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { showMenu } from '@/components/menus';
import { toast } from '@/components/toast';
import { includeFolder, listExcludedFolders } from '@/db/folders';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { makeStyles } from '@/theme';
import { libraryEvents } from '@/utils/events';

export function ExcludedFoldersScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const { data } = useLibraryQuery(listExcludedFolders);
  const include = async (folder: string) => {
    await includeFolder(db, folder);
    libraryEvents.emit('changed', undefined);
    toast.show(`${folder} is back in the library. Rescan to pick up files added since.`);
  };
  return (
    <View style={styles.root}>
      <FlatList
        data={data}
        keyExtractor={(f) => f}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => (
          <ListRow
            title={item.slice(item.lastIndexOf('/') + 1)}
            subtitle={item}
            leading={<IconTile name="folder.badge.minus" />}
            trailing={null}
            onPress={() =>
              showMenu({ title: item, items: [{ label: 'Include in library again', onPress: () => void include(item) }] })
            }
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              title="No excluded folders"
              body="In Folders, long-press a folder and choose Exclude from library. Its songs are hidden and it is skipped by scans."
            />
          ) : null
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({ root: { flex: 1, backgroundColor: colors.background } }));
