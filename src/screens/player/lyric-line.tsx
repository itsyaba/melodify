import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import type { Track } from '@/db/types';
import { useLyrics } from '@/hooks/use-lyrics';
import { activeLine } from '@/lyrics/lrc';
import { makeStyles } from '@/theme';

const LINE_HEIGHT = 26;
const LINES = 2;

/**
 * The synced lyric being sung, on its own under the artwork, as Spotify shows it. Each new line
 * rises in as the last one goes. A song with synced lyrics keeps the two lines' room the whole
 * way through, so the artwork above does not jump between verses; one without takes none.
 * A tap opens the whole lyrics.
 */
export function LyricLine({ track, positionMs, onPress }: { track: Track; positionMs: number; onPress: () => void }) {
  const styles = useStyles();
  const lyrics = useLyrics(track);
  if (!lyrics?.synced) return null;
  const index = activeLine(lyrics.lines, positionMs);
  // Before the first line nothing shows; a blank line in the file is a pause in the singing.
  const text = index < 0 ? '' : lyrics.lines[index].text.trim() || '♪';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text ? `Lyrics: ${text}` : 'Lyrics'}
      accessibilityHint="Shows the whole lyrics"
      style={styles.box}
    >
      <Line key={index} text={text} />
    </Pressable>
  );
}

function Line({ text }: { text: string }) {
  const styles = useStyles();
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(shown, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [shown]);
  return (
    <Animated.Text
      numberOfLines={LINES}
      style={[
        styles.text,
        { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { height: LINE_HEIGHT * LINES },
  text: { fontSize: 20, lineHeight: LINE_HEIGHT, fontWeight: '700', letterSpacing: -0.2, color: colors.label },
}));
