import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@/db/types';
import { activeLine } from '@/lyrics/lrc';
import { loadLyrics, type LoadedLyrics } from '@/lyrics/load';
import { makeStyles, spacing, type, useTheme } from '@/theme';

/** After the user scrolls the lyrics by hand, leave them there this long before following again. */
const MANUAL_SCROLL_HOLD_MS = 4000;

/**
 * Lyrics in place of the artwork. Synced lyrics highlight the line being sung, keep it about a
 * third of the way down, and seek to a line when it is tapped.
 */
export function LyricsView({ track, positionMs, onSeek }: { track: Track; positionMs: number; onSeek: (ms: number) => void }) {
  const styles = useStyles();
  const colors = useTheme();
  const [lyrics, setLyrics] = useState<LoadedLyrics | null | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);
  const lineY = useRef<number[]>([]);
  const heldUntil = useRef(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLyrics(undefined);
    lineY.current = [];
    void loadLyrics(track).then((l) => {
      if (!cancelled) setLyrics(l);
    });
    return () => {
      cancelled = true;
    };
  }, [track]);

  const current = lyrics?.synced ? activeLine(lyrics.lines, positionMs) : -1;

  useEffect(() => {
    if (current < 0 || Date.now() < heldUntil.current) return;
    const y = lineY.current[current];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - height / 3), animated: true });
  }, [current, height]);

  // Rebuilt only when the highlighted line changes, not on every position tick.
  const body = useMemo(() => {
    if (!lyrics) return null;
    return lyrics.lines.map((line, i) => {
      const text = line.text || ' ';
      if (!lyrics.synced) {
        return (
          <Text key={i} style={[type.body, styles.plain]}>
            {text}
          </Text>
        );
      }
      const active = i === current;
      return (
        <Pressable
          key={i}
          onLayout={(e) => {
            lineY.current[i] = e.nativeEvent.layout.y;
          }}
          onPress={() => line.timeMs !== null && onSeek(line.timeMs)}
          accessibilityRole="button"
          accessibilityHint="Plays from this line"
        >
          <Text style={[type.title, styles.line, { color: active ? colors.label : colors.tertiaryLabel }]}>{text}</Text>
        </Pressable>
      );
    });
  }, [lyrics, current, onSeek, colors, styles]);

  if (lyrics === undefined) return <View style={styles.root} />;
  if (lyrics === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.headline, { color: colors.label }]}>No lyrics</Text>
        <Text style={[type.subhead, styles.hint]}>
          Put a .lrc file with the same name next to the song and rescan, or embed lyrics in its tags.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      ref={scroll}
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: height / 2 }]}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => {
        heldUntil.current = Date.now() + MANUAL_SCROLL_HOLD_MS;
      }}
      onMomentumScrollEnd={() => {
        heldUntil.current = Date.now() + MANUAL_SCROLL_HOLD_MS;
      }}
    >
      {body}
      <Text style={[type.caption, styles.source]}>{lyrics.source === 'lrc' ? 'From the .lrc file' : 'From the file’s tags'}</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, alignSelf: 'stretch' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  hint: { color: colors.secondaryLabel, textAlign: 'center' },
  content: { gap: spacing.md, paddingVertical: spacing.lg },
  line: { fontWeight: '700' },
  plain: { color: colors.label, lineHeight: 26 },
  source: { color: colors.tertiaryLabel, paddingTop: spacing.xl },
}));
