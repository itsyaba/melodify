import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { Track } from '@/db/types';
import { useLyricsSearch } from '@/hooks/use-lyrics-search';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

/**
 * "Search online" for a song with no lyrics, and how that went. After a miss it offers "Search
 * for…", the user's own words, since the miss is usually the tags. The lyrics view centres it
 * under its "No lyrics"; the player's lyrics card lines it up at the start.
 */
export function LyricsSearch({ track, align = 'center' }: { track: Track; align?: 'center' | 'start' }) {
  const styles = useStyles();
  const colors = useTheme();
  const { state, search, searchWords } = useLyricsSearch(track);
  const alignItems = align === 'center' ? 'center' : 'flex-start';
  const next = state.status === 'failed' ? state.next : 'search';

  if (state.status === 'searching') {
    return (
      <View style={[styles.row, { alignSelf: alignItems }]} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.secondaryLabel} />
        <Text style={[type.subhead, styles.muted]}>Searching LRCLIB…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.wrap, { alignItems }]}>
      {state.status === 'failed' ? (
        <Text style={[type.footnote, styles.muted, { textAlign: align === 'center' ? 'center' : 'left' }]} accessibilityLiveRegion="polite">
          {state.message}
        </Text>
      ) : null}
      {next ? (
        <Pressable
          onPress={next === 'words' ? searchWords : search}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityHint={
            next === 'words'
              ? 'Searches LRCLIB for words you type, and lets you choose the lyrics'
              : 'Looks the song up on LRCLIB and saves what it finds as a .lrc file beside it'
          }
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={[type.subhead, styles.label]}>{next === 'words' ? 'Search for…' : next === 'retry' ? 'Try again' : 'Search online'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  button: { backgroundColor: colors.fill, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pressed: { opacity: 0.5 },
  label: { color: colors.label, fontWeight: '600' },
  muted: { color: colors.secondaryLabel },
}));
