import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { EmptyState } from '@/components/empty-state';
import { TrackRow } from '@/components/track-row';
import { searchTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { playTrackFromList } from '@/player/queue-actions';
import { colors, radius, spacing, type } from '@/theme';

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const active = query.trim().length >= 2;
  const { data } = useLibraryQuery(async (db) => (active ? searchTracks(db, query) : []), [query, active]);
  const tracks = data ?? [];
  return (
    <View style={styles.root}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Songs, artists, albums, files"
        placeholderTextColor={colors.tertiaryLabel}
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={[type.body, styles.input]}
      />
      <FlatList
        data={tracks}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TrackRow track={item} onPress={(t) => playTrackFromList(t, tracks)} />}
        ListEmptyComponent={active && data ? <EmptyState title="No matches" /> : null}
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  input: {
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.label,
  },
});
