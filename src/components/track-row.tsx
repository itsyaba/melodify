import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@/db/types';
import { artSize, makeStyles, spacing, type, useTheme } from '@/theme';
import { useDensity } from '@/hooks/use-density';
import { formatDuration } from '@/utils/format';
import { Artwork } from './artwork';

interface Props {
  track: Track;
  /** Show the track number instead of art (album view). */
  showNumber?: boolean;
  /** The playing track: its title takes the tint color. */
  active?: boolean;
  /** Replaces the duration, e.g. with a selection check or a drag handle. */
  trailing?: ReactNode;
  onPress?: (track: Track) => void;
  onLongPress?: (track: Track) => void;
}

export function TrackRow({ track, showNumber, active, trailing, onPress, onLongPress }: Props) {
  const styles = useStyles();
  const colors = useTheme();
  const density = useDensity();
  const subtitle = [track.artist, track.album].filter(Boolean).join(' · ') || track.folder || 'Unknown';
  return (
    <Pressable
      onPress={() => onPress?.(track)}
      onLongPress={onLongPress ? () => onLongPress(track) : undefined}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: density.paddingVertical, minHeight: density.minHeight },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : undefined}
    >
      {showNumber ? (
        <View style={[styles.number, { width: density.art }]}>
          <Text style={[type.subhead, { color: active ? colors.tint : colors.secondaryLabel }]}>{track.track_no ?? '–'}</Text>
        </View>
      ) : (
        <Artwork artKey={track.art_key} size={density.art} />
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.body, { color: active ? colors.tint : colors.label }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      </View>
      {trailing ?? (
        <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>{formatDuration(track.duration_ms)}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
