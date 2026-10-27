import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@/db/types';
import { activeLine } from '@/lyrics/lrc';
import { loadLyrics, type LoadedLyrics } from '@/lyrics/load';
import { makeStyles, spacing, type, useTheme } from '@/theme';
import { LyricsSearch } from './lyrics-search';

/** After the user scrolls the lyrics by hand, leave them there this long before following again. */
const MANUAL_SCROLL_HOLD_MS = 4000;

/** How far a line fades as it moves away from the one being sung. */
const FADE = [1, 0.5, 0.34, 0.24, 0.16];

/**
 * Lyrics in place of the artwork. Synced lyrics highlight the line being sung, keep it about a
 * third of the way down, and seek to a line when it is tapped.
 *
 * `size` is `large` when the lyrics have the screen to themselves, as they do in the Material
 * player: the type grows, the line being sung is white and the ones around it fall away line by
 * line, the way the lyric screens of other players do it.
 */
export function LyricsView({
  track,
  positionMs,
  onSeek,
  size = 'normal',
}: {
  track: Track;
  positionMs: number;
  onSeek: (ms: number) => void;
  size?: 'normal' | 'large';
}) {
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
    const above = size === 'large' ? 0.38 : 1 / 3;
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - height * above), animated: true });
  }, [current, height, size]);

  const large = size === 'large';

  // Rebuilt only when the highlighted line changes, not on every position tick.
  const body = useMemo(() => {
    if (!lyrics) return null;
    return lyrics.lines.map((line, i) => {
      const text = line.text || ' ';
      if (!lyrics.synced) {
        return (
          <Text key={i} style={[large ? styles.plainLarge : type.body, styles.plain]}>
            {text}
          </Text>
        );
      }
      const active = i === current;
      // Lines fall away from the one being sung, rather than every other line sharing one grey.
      const away = current < 0 ? 1 : Math.abs(i - current);
      const opacity = active ? 1 : (FADE[Math.min(away, FADE.length - 1)] ?? 0.16);
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
          <Text
            style={[
              large ? styles.big : type.title,
              styles.line,
              large
                ? { color: colors.label, opacity: current < 0 ? 0.8 : opacity }
                : { color: active ? colors.label : colors.tertiaryLabel },
            ]}
          >
            {text}
          </Text>
        </Pressable>
      );
    });
  }, [lyrics, current, onSeek, colors, styles, large]);

  if (lyrics === undefined) return <View style={styles.root} />;
  if (lyrics === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.headline, { color: colors.label }]}>No lyrics</Text>
        <Text style={[type.subhead, styles.hint]}>
          Put a .lrc file with the same name next to the song and rescan, embed lyrics in its tags, or look them up
          online.
        </Text>
        <LyricsSearch track={track} />
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
      <View style={styles.footer}>
        <Text style={[type.caption, styles.source]}>{lyrics.source === 'lrc' ? 'From the .lrc file' : 'From the file’s tags'}</Text>
        <LyricsSearch track={track} align="start" replacing />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, alignSelf: 'stretch' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  hint: { color: colors.secondaryLabel, textAlign: 'center' },
  content: { gap: spacing.md, paddingVertical: spacing.lg },
  line: { fontWeight: '700' },
  big: { fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  plainLarge: { fontSize: 20, lineHeight: 29, fontWeight: '600' },
  plain: { color: colors.label, lineHeight: 26 },
  footer: { gap: spacing.md, paddingTop: spacing.xl, alignItems: 'flex-start' },
  source: { color: colors.tertiaryLabel },
}));
