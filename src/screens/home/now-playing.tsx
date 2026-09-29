import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Artwork, artSource } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { SymbolView } from '@/components/symbol';
import { useQueue } from '@/player/queue-store';
import { face } from '@/screens/onboarding/fonts';
import { HERO, spacing, type } from '@/theme';

const ART = 104;
const PLAY = 48;
export const HERO_RADIUS = 24;

/**
 * The top of Home: the song on now, or the one left paused at the last run, over its own cover
 * blurred to fill the card. Tapping it opens the player; the round button plays or pauses and the
 * arrow skips, without leaving Home. Nothing shows while the queue is empty.
 *
 * Its own component, so the position ticks re-render it and not the page.
 */
export function NowPlayingCard() {
  const router = useRouter();
  const { tracks, currentIndex, state, positionMs, durationMs, toggle, next } = useQueue();
  const track = tracks[currentIndex];
  if (!track) return null;

  const playing = state === 'playing';
  const upNext = tracks[currentIndex + 1];
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;

  return (
    <Pressable
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel={`${playing ? 'Now playing' : 'Paused'}: ${track.title}${track.artist ? ` by ${track.artist}` : ''}. Open the player.`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={artSource(track.art_key)} blurRadius={40} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.shade]} />

      <View style={styles.row}>
        <View style={styles.cover}>
          <Artwork artKey={track.art_key} size={ART} rounded="md" />
        </View>
        <View style={styles.text}>
          <View style={styles.status}>
            {playing ? <SymbolView name="waveform" size={12} tintColor={HERO.muted} /> : null}
            <Text style={[type.caption, styles.muted, styles.statusText]}>{playing ? 'Now playing' : 'Paused'}</Text>
          </View>
          <Text numberOfLines={2} style={[styles.title, face('semibold')]}>{track.title}</Text>
          <Text numberOfLines={1} style={[type.subhead, styles.muted]}>{track.artist ?? 'Unknown artist'}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text numberOfLines={1} style={[type.footnote, styles.muted, styles.upNext]}>
          {upNext ? `Up next: ${upNext.title}` : 'Last song in the queue'}
        </Text>
        <IconButton name="forward.fill" size={20} color={HERO.ink} onPress={next} accessibilityLabel="Next track" />
        <Pressable
          onPress={toggle}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.play, !playing && styles.nudge, pressed && styles.pressed]}
        >
          <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={20} tintColor={HERO.buttonInk} />
        </Pressable>
      </View>

      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

// Every color here is a HERO constant, the same in every theme, so the sheet needs no rebuild.
const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: HERO_RADIUS,
    overflow: 'hidden',
    padding: spacing.lg,
    paddingBottom: spacing.md + 3,
    gap: spacing.md,
    backgroundColor: HERO.buttonInk,
  },
  shade: { backgroundColor: HERO.shade },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cover: {
    borderRadius: 10,
    shadowColor: HERO.buttonInk,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: { flex: 1, gap: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontWeight: '600' },
  title: { fontSize: 21, lineHeight: 25, color: HERO.ink, letterSpacing: -0.2 },
  muted: { color: HERO.muted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  upNext: { flex: 1 },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HERO.button,
  },
  // A play triangle looks off-centre when it is centred exactly.
  nudge: { paddingLeft: 3 },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: HERO.track },
  progressFill: { height: 3, backgroundColor: HERO.ink },
  pressed: { opacity: 0.75 },
});
