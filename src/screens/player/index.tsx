import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork, artSource } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { LyricsView } from '@/components/lyrics-view';
import { promptText, showMenu } from '@/components/menus';
import { SeekBar } from '@/components/seek-bar';
import { toast, ToastHost } from '@/components/toast';
import { useTrackActions } from '@/components/track-actions';
import { addBookmark, listBookmarks } from '@/db/bookmarks';
import { cycleRepeat } from '@/player/queue-ops';
import { queue, useQueue, type RepeatMode } from '@/player/queue-store';
import { sleepTimer, useSleepTimer, type SleepTimer } from '@/player/sleep-timer';
import { usePrefs } from '@/prefs';
import { artSize, makeStyles, spacing, type, useTheme } from '@/theme';
import { setKeepAwake } from '@/utils/device';
import { libraryEvents } from '@/utils/events';
import { formatDuration } from '@/utils/format';

const REPEAT_LABEL: Record<RepeatMode, string> = { off: 'Repeat off', all: 'Repeat queue', one: 'Repeat song' };

/** SF Symbols ship numbered skip glyphs for these intervals only. */
const NUMBERED = new Set([5, 10, 15, 30, 45, 60, 75, 90]);
function skipIcon(direction: 'back' | 'forward', seconds: number): SFSymbol {
  const base = direction === 'back' ? 'gobackward' : 'goforward';
  return (NUMBERED.has(seconds) ? `${base}.${seconds}` : base) as SFSymbol;
}

/** Songs listed under Up next in the compact layout. */
const UP_NEXT = 6;
const COMPACT_ART = 96;

/** While previous or next is held, the position moves this far every tick. */
const HOLD_STEP_MS = 5000;
const HOLD_TICK_MS = 200;
/** Two taps on the artwork within this long count as a double tap. */
const DOUBLE_TAP_MS = 300;

function sleepLabel(timer: SleepTimer, remainingMs: number): string | null {
  if (timer.mode === 'minutes') return `Sleep in ${formatDuration(remainingMs)}`;
  if (timer.mode === 'songs') return timer.left === 1 ? 'Stops after this song' : `Stops after ${timer.left} songs`;
  return null;
}

export function PlayerScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const actions = useTrackActions();
  const prefs = usePrefs();
  const { timer, remainingMs } = useSleepTimer();
  const { tracks, currentIndex, state, positionMs, durationMs, repeat, toggle, next, previous, seek, shuffle, undo, setRepeat } =
    useQueue();
  // While the thumb is down the labels follow it, not the engine, which keeps ticking underneath.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTap = useRef({ at: 0, side: 'left' as 'left' | 'right' });
  const latest = useRef({ positionMs, durationMs });
  latest.current = { positionMs, durationMs };
  const track = tracks[currentIndex];
  const layout = prefs.playerLayout;

  useEffect(() => () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
  }, []);

  // Only while the player is open, and only if asked for: it costs battery.
  useEffect(() => {
    if (!prefs.keepAwake) return;
    setKeepAwake(true);
    return () => setKeepAwake(false);
  }, [prefs.keepAwake]);

  if (!track) {
    return <EmptyState title="Nothing playing" body="Pick a song from the library to start a queue." />;
  }

  const playing = state === 'playing';
  const shown = scrubMs ?? positionMs;
  const art = Math.min(artSize.player, width - spacing.xl * 2);
  const subtitle = [track.artist, track.album].filter(Boolean).join(' — ');
  const skipMs = prefs.skipSeconds * 1000;

  const skip = (ms: number) => {
    const { positionMs: at, durationMs: total } = latest.current;
    void seek(Math.max(0, Math.min(total > 0 ? total - 500 : at + ms, at + ms)));
  };
  const startHold = (direction: 1 | -1) => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    skip(direction * HOLD_STEP_MS);
    holdTimer.current = setInterval(() => skip(direction * HOLD_STEP_MS), HOLD_TICK_MS);
  };
  const endHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
  };

  const onArtTap = (x: number) => {
    const side = x < art / 2 ? 'left' : 'right';
    const now = Date.now();
    if (now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
      skip(side === 'left' ? -skipMs : skipMs);
      toast.show(`${side === 'left' ? '−' : '+'}${prefs.skipSeconds} s`);
      lastTap.current = { at: 0, side };
    } else {
      lastTap.current = { at: now, side };
    }
  };

  const sleepMenu = () =>
    showMenu({
      title: 'Sleep timer',
      message: sleepLabel(timer, remainingMs) ?? (prefs.sleepFade ? 'Fades out over the last 30 seconds.' : undefined),
      items: [
        { label: 'Turn off', hidden: timer.mode === 'off', destructive: true, onPress: () => sleepTimer.cancel() },
        { label: 'Add 10 minutes', hidden: timer.mode !== 'minutes', onPress: () => sleepTimer.extend(10) },
        ...[15, 30, 45, 60, 90].map((m) => ({
          label: m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : '1 hour 30 minutes',
          onPress: () => {
            sleepTimer.minutes(m);
            toast.show(`Sleep in ${m} minutes`);
          },
        })),
        {
          label: 'Custom…',
          onPress: async () => {
            const text = await promptText('Sleep in how many minutes?', { ok: 'Start' });
            const minutes = Number(text);
            if (text && Number.isFinite(minutes) && minutes > 0) sleepTimer.minutes(minutes);
          },
        },
        { label: 'End of this song', onPress: () => sleepTimer.songs(1) },
        {
          label: 'After a number of songs…',
          onPress: async () => {
            const text = await promptText('Stop after how many songs?', { message: 'This song counts as the first.', ok: 'Start' });
            const count = Number(text);
            if (text && Number.isInteger(count) && count > 0) sleepTimer.songs(count);
          },
        },
      ],
    });

  const bookmarkHere = async () => {
    const at = latest.current.positionMs;
    const label = await promptText(`Bookmark at ${formatDuration(at)}`, { message: 'A name is optional.', ok: 'Save' });
    if (label === null) return;
    await addBookmark(db, track.id, at, label || null);
    libraryEvents.emit('changed', undefined);
    toast.show(`Bookmarked at ${formatDuration(at)}`);
  };
  const bookmarksMenu = async () => {
    const marks = await listBookmarks(db, track.id);
    showMenu({
      title: marks.length ? 'Bookmarks in this song' : 'No bookmarks in this song yet',
      items: [
        ...marks.map((b) => ({
          label: `${formatDuration(b.position_ms)}${b.label ? ` — ${b.label}` : ''}`,
          onPress: () => void seek(b.position_ms),
        })),
        { label: 'Bookmark this spot…', onPress: () => void bookmarkHere() },
        {
          label: 'All bookmarks',
          onPress: () => {
            router.back();
            router.push('/bookmarks');
          },
        },
      ],
    });
  };

  const sleeping = sleepLabel(timer, remainingMs);
  const upNext = tracks.slice(currentIndex + 1, currentIndex + 1 + UP_NEXT);

  const artArea = (size: number) =>
    showLyrics ? (
      <LyricsView track={track} positionMs={positionMs} onSeek={seek} />
    ) : (
      <Pressable
        onPress={(e) => onArtTap(e.nativeEvent.locationX)}
        accessibilityRole="image"
        accessibilityLabel="Artwork"
        accessibilityHint={`Double-tap the left or right side to skip ${prefs.skipSeconds} seconds`}
      >
        <Artwork artKey={track.art_key} size={size} rounded={layout === 'edge' && !landscape ? 'none' : 'lg'} />
      </Pressable>
    );
  const meta = (align: 'center' | 'left') => (
    <View style={styles.meta}>
      <Text numberOfLines={2} style={[type.title, { color: colors.label, textAlign: align }]}>
        {track.title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={[type.subhead, styles.subtitle, { textAlign: align }]}>{subtitle}</Text>
      ) : null}
      {sleeping ? <Text style={[type.caption, { color: colors.tint, textAlign: align }]}>{sleeping}</Text> : null}
    </View>
  );
  const seekRow = (
    <View style={styles.seek}>
      <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} onScrub={setScrubMs} />
      <View style={styles.times}>
        <Text style={[type.caption, styles.time]}>{formatDuration(shown)}</Text>
        <Text style={[type.caption, styles.time]}>
          {durationMs > 0 ? `-${formatDuration(durationMs - shown)}` : '--:--'}
        </Text>
      </View>
    </View>
  );
  const controls = (
    <View style={styles.controls}>
      <IconButton
        name={skipIcon('back', prefs.skipSeconds)}
        size={26}
        onPress={() => skip(-skipMs)}
        accessibilityLabel={`Back ${prefs.skipSeconds} seconds`}
      />
      <IconButton
        name="backward.fill"
        size={30}
        onPress={previous}
        onLongPress={() => startHold(-1)}
        onPressOut={endHold}
        accessibilityLabel="Previous track"
        accessibilityHint="Hold to rewind"
      />
      <IconButton
        name={playing ? 'pause.circle.fill' : 'play.circle.fill'}
        size={64}
        color={colors.tint}
        onPress={toggle}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
      />
      <IconButton
        name="forward.fill"
        size={30}
        onPress={next}
        onLongPress={() => startHold(1)}
        onPressOut={endHold}
        accessibilityLabel="Next track"
        accessibilityHint="Hold to fast-forward"
      />
      <IconButton
        name={skipIcon('forward', prefs.skipSeconds)}
        size={26}
        onPress={() => skip(skipMs)}
        accessibilityLabel={`Forward ${prefs.skipSeconds} seconds`}
      />
    </View>
  );
  const secondary = (
    <View style={styles.secondary}>
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
      <IconButton
        name="shuffle"
        size={20}
        color={colors.secondaryLabel}
        disabled={tracks.length < 2}
        onPress={() => void shuffle().then(() => toast.show('Queue shuffled', { label: 'Undo', onPress: () => void undo() }))}
        accessibilityLabel="Shuffle the queue"
      />
      <IconButton
        name={showLyrics ? 'quote.bubble.fill' : 'quote.bubble'}
        size={20}
        color={showLyrics ? colors.tint : colors.secondaryLabel}
        onPress={() => setShowLyrics((v) => !v)}
        accessibilityLabel={showLyrics ? 'Show artwork' : 'Show lyrics'}
      />
      <IconButton
        name={timer.mode === 'off' ? 'moon.zzz' : 'moon.zzz.fill'}
        size={20}
        color={timer.mode === 'off' ? colors.secondaryLabel : colors.tint}
        onPress={sleepMenu}
        accessibilityLabel={sleeping ?? 'Sleep timer'}
      />
      <IconButton
        name="bookmark"
        size={20}
        color={colors.secondaryLabel}
        onPress={() => void bookmarkHere()}
        onLongPress={() => void bookmarksMenu()}
        accessibilityLabel="Bookmark this spot"
        accessibilityHint="Hold for this song’s bookmarks"
      />
      <IconButton
        name={track.favorite ? 'heart.fill' : 'heart'}
        size={20}
        color={track.favorite ? colors.tint : colors.secondaryLabel}
        onPress={() => void queue.setFavorite(track, !track.favorite)}
        accessibilityLabel={track.favorite ? 'Remove from favorites' : 'Add to favorites'}
      />
      <IconButton
        name="ellipsis.circle"
        size={20}
        color={colors.secondaryLabel}
        onPress={() => actions.trackMenu(track, { beforeNavigate: () => router.back() })}
        accessibilityLabel="More for this song"
      />
    </View>
  );

  const background =
    prefs.blurBackground ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={artSource(track.art_key)} blurRadius={60} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      </View>
    ) : null;

  let body: ReactElement;
  if (landscape) {
    // Side by side: the artwork as tall as the screen allows, everything else beside it.
    const size = Math.min(height - insets.top - insets.bottom - spacing.xl * 2, width * 0.45);
    body = (
      <View style={[styles.landscape, { paddingLeft: insets.left + spacing.xl, paddingRight: insets.right + spacing.xl }]}>
        <View style={[styles.artWrap, { flex: 0, width: size }]}>{artArea(size)}</View>
        <View style={styles.side}>
          {meta('left')}
          {seekRow}
          {controls}
          {secondary}
        </View>
      </View>
    );
  } else if (layout === 'compact') {
    // Smaller artwork beside the title, and the next few songs where the artwork was.
    body = (
      <View style={styles.padded}>
        <View style={styles.compactHead}>
          {showLyrics ? null : artArea(COMPACT_ART)}
          <View style={{ flex: 1 }}>{meta('left')}</View>
        </View>
        <View style={styles.upNext}>
          {showLyrics ? (
            <LyricsView track={track} positionMs={positionMs} onSeek={seek} />
          ) : (
            <>
              <Text style={[type.footnote, styles.upNextTitle]}>{upNext.length ? 'UP NEXT' : 'END OF THE QUEUE'}</Text>
              {upNext.map((t, i) => (
                <Pressable
                  key={`${t.id}:${i}`}
                  onPress={() => void queue.playAt(currentIndex + 1 + i)}
                  style={({ pressed }) => [styles.upNextRow, pressed && { opacity: 0.5 }]}
                  accessibilityRole="button"
                >
                  <Artwork artKey={t.art_key} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type.subhead, { color: colors.label }]}>{t.title}</Text>
                    <Text numberOfLines={1} style={[type.caption, { color: colors.secondaryLabel }]}>
                      {t.artist ?? t.folder}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </View>
        {seekRow}
        {controls}
        {secondary}
      </View>
    );
  } else if (layout === 'edge') {
    // Artwork edge to edge at the top, square, with the rest padded below it.
    body = (
      <>
        {/* Full width where the screen is tall enough, otherwise as large as fits. */}
        <View style={styles.edgeArt}>{artArea(Math.min(width, Math.round(height * 0.5)))}</View>
        <View style={[styles.padded, { flex: 0 }]}>
          {meta('center')}
          {seekRow}
          {controls}
          {secondary}
        </View>
      </>
    );
  } else {
    body = (
      <View style={styles.padded}>
        <View style={styles.artWrap}>{artArea(art)}</View>
        {meta('center')}
        {seekRow}
        {controls}
        {secondary}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.lg }]}>
      {background}
      {body}
      {/* The app-wide toast sits under this modal, so the player shows its own. */}
      <ToastHost />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  padded: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.lg },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  edgeArt: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0, marginBottom: spacing.lg },
  landscape: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  side: { flex: 1, gap: spacing.md, justifyContent: 'center' },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg },
  upNext: { flex: 1, minHeight: 0, gap: spacing.sm },
  upNextTitle: { color: colors.secondaryLabel, paddingTop: spacing.sm },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  // Keeps text legible over the blurred artwork in both light and dark.
  scrim: { backgroundColor: colors.background, opacity: 0.55 },
  meta: { gap: spacing.xs },
  subtitle: { color: colors.secondaryLabel },
  seek: { gap: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.secondaryLabel },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
}));
