import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { TrackRow } from '@/components/track-row';
import { useQueue } from '@/player/queue-store';
import { artSize, colors, spacing, type } from '@/theme';
import { formatDuration } from '@/utils/format';

export function QueueScreen() {
  const router = useRouter();
  const { tracks, currentIndex, state, positionMs, durationMs, playAt } = useQueue();
  const current = tracks[currentIndex];
  // Inside the list, not beside it: only the scroll view receives the large-title
  // header's content inset, so a sibling View here would sit under the status bar.
  // Also the way into the player on an iOS old enough to have no tab bar accessory.
  const header = current ? (
    <Pressable
      style={({ pressed }) => [styles.now, pressed && styles.pressed]}
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel="Open the player"
    >
      <Artwork artKey={current.art_key} size={artSize.row} />
      <View style={styles.nowText}>
        <Text numberOfLines={1} style={[type.headline, { color: colors.label }]}>{current.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>
          {state} · {formatDuration(positionMs)} / {formatDuration(durationMs)}
        </Text>
      </View>
    </Pressable>
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
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  nowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.fill },
  active: { backgroundColor: colors.secondaryBackground },
});
