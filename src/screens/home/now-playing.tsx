import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { artSource } from '@/components/artwork';
import { useTrackActions } from '@/components/track-actions';
import { queue, useQueue } from '@/player/queue-store';
import { HERO, type CardLook } from '@/theme';
import { HeroCard } from './cards';

/** White text and buttons over the song's own cover, blurred and darkened, whatever the theme. */
const LOOK: CardLook = {
  fill: HERO.buttonInk,
  ink: HERO.ink,
  muted: HERO.muted,
  button: HERO.button,
  buttonInk: HERO.buttonInk,
};

/**
 * The first of Home's big cards: the song on now, or the one left paused at the last run, over its
 * own cover blurred to fill the card. Tapping it opens the player; the round button plays or
 * pauses, the heart favorites it and the arrow skips, without leaving Home. Nothing shows while
 * the queue is empty.
 *
 * Its own component, so the position ticks re-render it and not the page.
 */
export function NowPlayingCard({ width }: { width: number }) {
  const router = useRouter();
  const actions = useTrackActions();
  const { tracks, currentIndex, state, positionMs, durationMs, toggle, next } = useQueue();
  const track = tracks[currentIndex];
  if (!track) return null;

  const playing = state === 'playing';
  const upNext = tracks[currentIndex + 1];
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;
  const artist = track.artist ?? 'Unknown artist';

  return (
    <HeroCard
      look={LOOK}
      width={width}
      eyebrow={playing ? 'Now playing' : 'Paused'}
      eyebrowIcon={playing ? 'waveform' : undefined}
      title={track.title}
      body={upNext ? `${artist}\nUp next: ${upNext.title}` : artist}
      artKey={track.art_key}
      icon="music.note"
      play={{ icon: playing ? 'pause.fill' : 'play.fill', label: playing ? 'Pause' : 'Play', onPress: toggle }}
      actions={[
        {
          icon: track.favorite ? 'heart.fill' : 'heart',
          label: track.favorite ? 'Remove from favorites' : 'Add to favorites',
          onPress: () => void queue.setFavorite(track, !track.favorite),
        },
        { icon: 'forward.fill', label: 'Next track', onPress: next },
      ]}
      backdrop={
        <>
          <Image source={artSource(track.art_key)} blurRadius={40} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.shade]} />
        </>
      }
      footer={
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      }
      accessibilityLabel={`${playing ? 'Now playing' : 'Paused'}: ${track.title} by ${artist}. Open the player.`}
      onPress={() => router.push('/player')}
      onLongPress={() => actions.trackMenu(track)}
    />
  );
}

// Every color here is a HERO constant, the same in every theme, so the sheet needs no rebuild.
const styles = StyleSheet.create({
  shade: { backgroundColor: HERO.shade },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: HERO.track },
  progressFill: { height: 3, backgroundColor: HERO.ink },
});
