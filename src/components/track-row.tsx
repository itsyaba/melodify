import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@/db/types';
import { artSize, colors, radius, spacing, type } from '@/theme';
import { formatDuration } from '@/utils/format';
import { Artwork } from './artwork';

interface Props {
  track: Track;
  /** Show the track number instead of art (album view). */
  showNumber?: boolean;
  onPress?: (track: Track) => void;
  onLongPress?: (track: Track) => void;
}

export function TrackRow({ track, showNumber, onPress, onLongPress }: Props) {
  const subtitle = [track.artist, track.album].filter(Boolean).join(' · ') || track.folder || 'Unknown';
  return (
    <Pressable
      onPress={() => onPress?.(track)}
      onLongPress={() => onLongPress?.(track)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {showNumber ? (
        <View style={styles.number}>
          <Text style={[type.subhead, { color: colors.secondaryLabel }]}>{track.track_no ?? '–'}</Text>
        </View>
      ) : (
        <Artwork artKey={track.art_key} size={artSize.row} />
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.body, { color: colors.label }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      </View>
      <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>{formatDuration(track.duration_ms)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  pressed: { backgroundColor: colors.fill },
  number: { width: artSize.row, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  art: { borderRadius: radius.sm },
});
