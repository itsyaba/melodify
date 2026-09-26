import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { useQueue } from '@/player/queue-store';
import { makeStyles, spacing, type, useTheme } from '@/theme';

const ART = 36;

/**
 * Lives in the tab bar's bottom accessory (iOS 26), so UIKit lays it out above the tab bar and
 * insets the scroll views behind it. `usePlacement` reports 'inline' once the tab bar minimizes,
 * which leaves room for the artwork, the title and one button and nothing else.
 */
export function MiniPlayer() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayerBar compact={placement === 'inline'} />;
}

/**
 * The mini player itself. Android docks it above its own tab bar (AndroidTabBar), outside any
 * bottom accessory, where asking for the placement would throw.
 */
export function MiniPlayerBar({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const { tracks, currentIndex, state, positionMs, durationMs, toggle, next } = useQueue();
  const track = tracks[currentIndex];
  if (!track) return null;

  const playing = state === 'playing';
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;

  return (
    <Pressable
      style={styles.root}
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel={`Now playing: ${track.title}. Open the player.`}
    >
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Artwork artKey={track.art_key} size={ART} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[type.subhead, { color: colors.label }]}>{track.title}</Text>
          {!compact && track.artist ? (
            <Text numberOfLines={1} style={[type.caption, { color: colors.secondaryLabel }]}>{track.artist}</Text>
          ) : null}
        </View>
        <IconButton
          name={playing ? 'pause.fill' : 'play.fill'}
          size={20}
          onPress={toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        />
        {!compact ? (
          <IconButton name="forward.fill" size={20} onPress={next} accessibilityLabel="Next track" />
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, justifyContent: 'center' },
  progress: { height: 2, backgroundColor: colors.fill },
  progressFill: { height: 2, backgroundColor: colors.tint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 1 },
}));
