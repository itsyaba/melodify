import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/empty-state';
import { TrackRow } from '@/components/track-row';
import { useQueue } from '@/player/queue-store';
import { colors, spacing, type } from '@/theme';
import { formatDuration } from '@/utils/format';

export function QueueScreen() {
  const { tracks, currentIndex, state, positionMs, durationMs, playAt } = useQueue();
  const current = tracks[currentIndex];
  // Inside the list, not beside it: only the scroll view receives the large-title
  // header's content inset, so a sibling View here would sit under the status bar.
  const header = current ? (
    <View style={styles.now}>
      <Text numberOfLines={1} style={[type.headline, { color: colors.label }]}>{current.title}</Text>
      <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>
        {state} · {formatDuration(positionMs)} / {formatDuration(durationMs)}
      </Text>
    </View>
  ) : null;
  return (
    <View style={styles.root}>
      <FlatList
        ListHeaderComponent={header}
        data={tracks}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        renderItem={({ item, index }) => (
          <View style={index === currentIndex ? styles.active : undefined}>
            <TrackRow track={item} onPress={() => playAt(index)} />
          </View>
        )}
        ListEmptyComponent={<EmptyState title="Queue is empty" body="Tap any song to start a queue." />}
        contentInsetAdjustmentBehavior="automatic"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  now: { padding: spacing.lg, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  active: { backgroundColor: colors.secondaryBackground },
});
