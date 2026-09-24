import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { SeekBar } from '@/components/seek-bar';
import { toast, ToastHost } from '@/components/toast';
import { useTrackActions } from '@/components/track-actions';
import { cycleRepeat } from '@/player/queue-ops';
import { useQueue, type RepeatMode } from '@/player/queue-store';
import { artSize, colors, spacing, type } from '@/theme';
import { formatDuration } from '@/utils/format';

const REPEAT_LABEL: Record<RepeatMode, string> = { off: 'Repeat off', all: 'Repeat queue', one: 'Repeat song' };

export function PlayerScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const actions = useTrackActions();
  const router = useRouter();
  const { tracks, currentIndex, state, positionMs, durationMs, repeat, toggle, next, previous, seek, shuffle, undo, setRepeat } =
    useQueue();
  // While the thumb is down the labels follow it, not the engine, which keeps ticking underneath.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const track = tracks[currentIndex];

  if (!track) {
    return <EmptyState title="Nothing playing" body="Pick a song from the library to start a queue." />;
  }

  const playing = state === 'playing';
  const shown = scrubMs ?? positionMs;
  const art = Math.min(artSize.player, width - spacing.xl * 2);
  const subtitle = [track.artist, track.album].filter(Boolean).join(' — ');

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.artWrap}>
        <Artwork artKey={track.art_key} size={art} rounded="lg" />
      </View>

      <View style={styles.meta}>
        <Text numberOfLines={2} style={[type.title, { color: colors.label, textAlign: 'center' }]}>
          {track.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[type.subhead, styles.subtitle]}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={styles.seek}>
        <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} onScrub={setScrubMs} />
        <View style={styles.times}>
          <Text style={[type.caption, styles.time]}>{formatDuration(shown)}</Text>
          <Text style={[type.caption, styles.time]}>
            {durationMs > 0 ? `-${formatDuration(durationMs - shown)}` : '--:--'}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <IconButton
          name={repeat === 'one' ? 'repeat.1' : 'repeat'}
          size={20}
          color={repeat === 'off' ? colors.secondaryLabel : colors.tint}
          onPress={() => {
            const nextMode = cycleRepeat(repeat);
            setRepeat(nextMode);
            toast.show(REPEAT_LABEL[nextMode]);
          }}
          accessibilityLabel={`${REPEAT_LABEL[repeat]}. Change repeat mode`}
        />
        <IconButton name="backward.fill" size={30} onPress={previous} accessibilityLabel="Previous track" />
        <IconButton
          name={playing ? 'pause.circle.fill' : 'play.circle.fill'}
          size={64}
          color={colors.tint}
          onPress={toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        />
        <IconButton name="forward.fill" size={30} onPress={next} accessibilityLabel="Next track" />
        <IconButton
          name="shuffle"
          size={20}
          color={colors.secondaryLabel}
          disabled={tracks.length < 2}
          onPress={() => void shuffle().then(() => toast.show('Queue shuffled', { label: 'Undo', onPress: () => void undo() }))}
          accessibilityLabel="Shuffle the queue"
        />
      </View>
      {/* The app-wide toast sits under this modal, so the player shows its own. */}
      <ToastHost />
      <View style={styles.secondary}>
        <IconButton name="ellipsis.circle" size={24} color={colors.secondaryLabel} onPress={() => actions.trackMenu(track, { beforeNavigate: () => router.back() })} accessibilityLabel="More for this song" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, gap: spacing.lg },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  meta: { gap: spacing.xs },
  subtitle: { color: colors.secondaryLabel, textAlign: 'center' },
  seek: { gap: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.secondaryLabel },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  secondary: { flexDirection: 'row', justifyContent: 'center' },
});
