import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SFSymbol } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { LyricsView } from '@/components/lyrics-view';
import type { MenuItem } from '@/components/menus';
import { SeekBar } from '@/components/seek-bar';
import { Slider } from '@/components/slider';
import { toast, ToastHost } from '@/components/toast';
import { albumHref, choosePlaylist, groupHref, useTrackActions } from '@/components/track-actions';
import { useAbLoop } from '@/player/ab-repeat';
import { cycleRepeat, nextIndex, previousIndex } from '@/player/queue-ops';
import { queue, useQueue, type RepeatMode } from '@/player/queue-store';
import { useSleepTimer, type SleepTimer } from '@/player/sleep-timer';
import { previewSound } from '@/player/sound';
import { shareTrack } from '@/player/track-edits';
import { ALL_PLAYER_SHORTCUTS, setPref, usePrefs, type PlayerShortcut } from '@/prefs';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { setKeepAwake } from '@/utils/device';
import { formatDuration } from '@/utils/format';
import { AboutCard, BookmarksCard, LyricsCard, UpNextCard } from './cards';
import { Backdrop, FavoriteButton, ModeButton, PlayButton, PlayerHeader, StatusPills, type Pill } from './controls';
import { abMark, abMenu, bookmarkHere, bookmarksMenu, queueMenu, sleepLabel, sleepMenu } from './menus';
import { SHORTCUTS } from './shortcuts';
import { SwipeArt } from './swipe-art';

const REPEAT_LABEL: Record<RepeatMode, string> = { off: 'Repeat off', all: 'Repeat queue', one: 'Repeat song' };
const REPEAT_STATE: Record<RepeatMode, string> = { off: 'off', all: 'queue', one: 'this song' };

/** SF Symbols ship numbered skip glyphs for these intervals only. */
const NUMBERED = new Set([5, 10, 15, 30, 45, 60, 75, 90]);
function skipIcon(direction: 'back' | 'forward', seconds: number): SFSymbol {
  const base = direction === 'back' ? 'gobackward' : 'goforward';
  return (NUMBERED.has(seconds) ? `${base}.${seconds}` : base) as SFSymbol;
}

/** Songs listed under Up next in the compact layout. */
const UP_NEXT = 6;
const COMPACT_ART = 96;
/** How much of the first card shows under the controls, hinting that the player scrolls. */
const CARD_PEEK = 44;

/** While previous or next is held, the position moves this far every tick. */
const HOLD_STEP_MS = 5000;
const HOLD_TICK_MS = 200;
/** Two taps on the artwork within this long count as a double tap. */
const DOUBLE_TAP_MS = 300;

function sleepPill(timer: SleepTimer, remainingMs: number): string {
  if (timer.mode === 'minutes') return formatDuration(remainingMs);
  if (timer.mode === 'songs') return timer.left === 1 ? 'After this song' : `${timer.left} songs`;
  return '';
}

/**
 * Now Playing, laid out like Spotify's: a header naming the queue, big artwork that swipes to
 * the next or previous song, the title with an add button, a thin seek bar, round play button,
 * and a row of shortcuts; then cards that scroll up from under it. What goes in it is
 * Musicolet's: several queues, A–B repeat, bookmarks, the sleep timer, speed, pitch and equalizer,
 * skipping by seconds in long songs, and the lyrics and details from the files themselves.
 */
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
  const {
    queues, activeId, tracks, currentIndex, state, positionMs, durationMs, repeat,
    toggle, next, previous, seek, shuffle, undo, setRepeat, playAt,
  } = useQueue();
  // While the thumb is down the labels follow it, not the engine, which keeps ticking underneath.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [viewport, setViewport] = useState(0);
  const [artBox, setArtBox] = useState({ width: 0, height: 0 });
  const scroll = useRef<ScrollView>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTap = useRef({ at: 0, side: 'left' as 'left' | 'right' });
  const latest = useRef({ positionMs, durationMs });
  latest.current = { positionMs, durationMs };
  const track = tracks[currentIndex];
  const loop = useAbLoop(track?.id);
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

  // Albums, artists and bookmarks live under the tabs, behind the player, so it closes first.
  const leave = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      router.back();
      router.push(href);
    },
    [router],
  );
  const openQueue = useCallback(() => router.push('/queue'), [router]);
  const goAlbum = useCallback(() => {
    if (track?.album) leave(albumHref(track.album, track.album_artist ?? track.artist));
  }, [track, leave]);
  const goArtist = useCallback(() => {
    if (track?.artist) leave(groupHref('artist', track.artist));
  }, [track, leave]);
  const openDetails = useCallback(() => {
    if (track) router.push({ pathname: '/track/[id]', params: { id: String(track.id) } });
  }, [track, router]);
  const editLyrics = useCallback(() => {
    if (track) router.push({ pathname: '/lyrics/[id]', params: { id: String(track.id) } });
  }, [track, router]);
  // Lyrics take the artwork's place at the top, so a card asking for them scrolls back up there.
  const toggleLyrics = useCallback(() => {
    setShowLyrics((v) => !v);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }, []);

  if (!track) {
    return <EmptyState title="Nothing playing" body="Pick a song from the library to start a queue." />;
  }

  const playing = state === 'playing';
  const shown = scrubMs ?? positionMs;
  const skipMs = prefs.skipSeconds * 1000;
  // Audiobooks, podcasts and mixes: the songs long enough to remember their place get Spotify's
  // podcast controls, skipping by seconds where shuffle and repeat would be.
  const longForm = prefs.resumeMinMs > 0 && (durationMs || track.duration_ms || 0) >= prefs.resumeMinMs;
  const canNext = nextIndex(tracks.length, currentIndex, repeat, true) >= 0;
  const canPrevious = currentIndex > 0 || (repeat === 'all' && tracks.length > 1);
  const queueName = queues.find((q) => q.id === activeId)?.name ?? 'Queue';
  const sleeping = sleepLabel(timer, remainingMs);
  const soundChanged = prefs.playbackRate !== 1 || prefs.pitchSemitones !== 0 || prefs.pitchFollowsSpeed || prefs.equalizer.enabled;

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
  const onArtTap = (x: number, size: number) => {
    const side = x < size / 2 ? 'left' : 'right';
    const now = Date.now();
    if (now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
      skip(side === 'left' ? -skipMs : skipMs);
      toast.show(`${side === 'left' ? '−' : '+'}${prefs.skipSeconds} s`);
      lastTap.current = { at: 0, side };
    } else {
      lastTap.current = { at: now, side };
    }
  };

  const doShuffle = () => void shuffle().then(() => toast.show('Queue shuffled', { label: 'Undo', onPress: () => void undo() }));
  const doRepeat = () => {
    const mode = cycleRepeat(repeat);
    setRepeat(mode);
    toast.show(REPEAT_LABEL[mode]);
  };
  const openSound = () => router.push('/sound');
  const openAbMenu = () => abMenu(track, latest.current.positionMs, latest.current.durationMs, (ms) => void seek(ms));
  const openBookmarks = () =>
    void bookmarksMenu(db, track, {
      positionMs: () => latest.current.positionMs,
      seek: (ms) => void seek(ms),
      openAll: () => leave('/bookmarks'),
    });

  const shortcut = (key: PlayerShortcut): { active: boolean; label: string; hint?: string; onPress: () => void; onLongPress?: () => void } => {
    switch (key) {
      case 'lyrics':
        return { active: showLyrics, label: showLyrics ? 'Show artwork' : 'Show lyrics', onPress: toggleLyrics };
      case 'sleep':
        return { active: timer.mode !== 'off', label: sleeping ?? 'Sleep timer', onPress: sleepMenu };
      case 'abRepeat':
        return {
          active: loop !== null,
          label: loop ? 'A–B repeat is on. Next step' : 'A–B repeat: set A here',
          hint: 'Hold for more',
          onPress: () => abMark(track, latest.current.positionMs, latest.current.durationMs),
          onLongPress: openAbMenu,
        };
      case 'bookmark':
        return {
          active: false,
          label: 'Bookmark this spot',
          hint: 'Hold for this song’s bookmarks',
          onPress: () => void bookmarkHere(db, track, latest.current.positionMs),
          onLongPress: openBookmarks,
        };
      case 'sound':
        return {
          active: soundChanged,
          label: prefs.playbackRate !== 1 ? `Speed and sound, playing at ${prefs.playbackRate} times` : 'Speed and sound',
          onPress: openSound,
        };
      case 'queue':
        return { active: false, label: 'Open the queue', onPress: openQueue };
      case 'details':
        return { active: false, label: 'Song details', onPress: openDetails };
      case 'playlist':
        return { active: false, label: 'Add to playlist', onPress: () => void choosePlaylist(db, [track]) };
      case 'share':
        return { active: false, label: 'Share the file', onPress: () => void shareTrack(track) };
    }
  };

  // The shortcuts switched off still belong somewhere: the top of the menu, above the song's own
  // items, saying what is on. Details, playlists and sharing are in every song's menu already.
  const menuItem: Partial<Record<PlayerShortcut, MenuItem>> = {
    lyrics: { label: showLyrics ? 'Hide lyrics' : 'Show lyrics', icon: SHORTCUTS.lyrics.icon, onPress: toggleLyrics },
    sleep: { label: `${sleeping ?? 'Sleep timer'}…`, icon: SHORTCUTS.sleep.icon, onPress: sleepMenu },
    abRepeat: { label: loop ? 'A–B repeat: on…' : 'A–B repeat…', icon: SHORTCUTS.abRepeat.icon, onPress: openAbMenu },
    bookmark: { label: 'Bookmarks…', icon: SHORTCUTS.bookmark.icon, onPress: openBookmarks },
    sound: {
      label: prefs.playbackRate !== 1 ? `Speed and sound: ${prefs.playbackRate}×` : 'Speed and sound',
      icon: SHORTCUTS.sound.icon,
      onPress: openSound,
    },
    queue: { label: 'Open the queue', icon: SHORTCUTS.queue.icon, onPress: openQueue },
  };
  const moreMenu = () =>
    actions.trackMenu(track, {
      beforeNavigate: () => router.back(),
      first: [
        ...(longForm
          ? [
              { label: 'Shuffle the queue', icon: 'shuffle' as const, hidden: tracks.length < 2, onPress: doShuffle },
              { label: `Repeat: ${REPEAT_STATE[repeat]}`, icon: 'repeat' as const, onPress: doRepeat },
            ]
          : []),
        ...ALL_PLAYER_SHORTCUTS.filter((k) => !prefs.playerShortcuts.includes(k)).flatMap((k) => menuItem[k] ?? []),
      ],
    });

  const pills: Pill[] = [];
  if (sleeping) {
    pills.push({ key: 'sleep', icon: 'moon.zzz.fill', text: sleepPill(timer, remainingMs), onPress: sleepMenu, accessibilityLabel: `${sleeping}. Change the sleep timer` });
  }
  if (loop) {
    const text = loop.bMs === null ? `A ${formatDuration(loop.aMs)} · set B` : `${formatDuration(loop.aMs)} – ${formatDuration(loop.bMs)}`;
    pills.push({ key: 'ab', icon: 'arrow.triangle.capsulepath', text, onPress: openAbMenu, accessibilityLabel: `A–B repeat, ${text}. Change it` });
  }
  if (prefs.playbackRate !== 1) {
    pills.push({ key: 'speed', icon: 'speedometer', text: `${prefs.playbackRate}×`, onPress: openSound, accessibilityLabel: `Playing at ${prefs.playbackRate} times. Change the speed` });
  }
  if (!prefs.pitchFollowsSpeed && prefs.pitchSemitones !== 0) {
    const text = `Pitch ${prefs.pitchSemitones > 0 ? '+' : '−'}${Math.abs(prefs.pitchSemitones)}`;
    pills.push({ key: 'pitch', icon: 'music.note', text, onPress: openSound, accessibilityLabel: `${text} semitones. Change the pitch` });
  }
  if (prefs.equalizer.enabled) {
    const text = `EQ ${prefs.equalizer.name || 'custom'}`;
    pills.push({ key: 'eq', icon: 'slider.vertical.3', text, onPress: openSound, accessibilityLabel: `Equalizer on, ${prefs.equalizer.name || 'custom'}. Change it` });
  }

  const measureArt = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setArtBox((box) => (Math.abs(box.width - w) < 1 && Math.abs(box.height - h) < 1 ? box : { width: w, height: h }));
  };
  const artwork = (size: number, rounded: 'none' | 'md') => (
    <SwipeArt
      width={size}
      canNext={canNext}
      canPrevious={canPrevious}
      onNext={() => void next()}
      onPrevious={() => void playAt(previousIndex(tracks.length, currentIndex, repeat))}
      onActive={setSwiping}
    >
      <Pressable
        onPress={(e) => onArtTap(e.nativeEvent.locationX, size)}
        accessibilityRole="image"
        accessibilityLabel={`Artwork for ${track.title}`}
        accessibilityHint={`Swipe sideways for the next or previous song. Double-tap the left or right side to skip ${prefs.skipSeconds} seconds`}
      >
        <View style={[styles.artShadow, { borderRadius: radius[rounded] }]}>
          <Artwork artKey={track.art_key} size={size} rounded={rounded} />
        </View>
      </Pressable>
    </SwipeArt>
  );
  const lyrics = <LyricsView track={track} positionMs={positionMs} onSeek={seek} />;

  const header = (
    <PlayerHeader
      from={queueName}
      detail={`${currentIndex + 1} of ${tracks.length}`}
      onClose={() => router.back()}
      onFrom={() => queueMenu(openQueue)}
      onMore={moreMenu}
    />
  );
  const titleRow = (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text
          numberOfLines={1}
          onPress={track.album ? goAlbum : undefined}
          accessibilityRole={track.album ? 'link' : 'header'}
          accessibilityHint={track.album ? 'Goes to the album' : undefined}
          style={styles.title}
        >
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          onPress={track.artist ? goArtist : undefined}
          accessibilityRole={track.artist ? 'link' : 'text'}
          accessibilityHint={track.artist ? 'Goes to the artist' : undefined}
          style={styles.artist}
        >
          {track.artist ?? track.album ?? track.folder}
        </Text>
      </View>
      <FavoriteButton
        favorite={!!track.favorite}
        onPress={() => void queue.setFavorite(track, !track.favorite)}
        onLongPress={() => void choosePlaylist(db, [track])}
      />
    </View>
  );
  const seekRow = (
    <View>
      <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} onScrub={setScrubMs} color={colors.label} loop={loop} />
      <View style={styles.times}>
        <Text style={[type.caption, styles.time]}>{formatDuration(shown)}</Text>
        <Text style={[type.caption, styles.time]}>{durationMs > 0 ? `-${formatDuration(durationMs - shown)}` : '--:--'}</Text>
      </View>
    </View>
  );
  const transport = (
    <View style={styles.transport}>
      {longForm ? (
        <IconButton name={skipIcon('back', prefs.skipSeconds)} size={26} onPress={() => skip(-skipMs)} accessibilityLabel={`Back ${prefs.skipSeconds} seconds`} />
      ) : (
        <ModeButton name="shuffle" active={false} disabled={tracks.length < 2} onPress={doShuffle} accessibilityLabel="Shuffle the queue" />
      )}
      <IconButton
        name="backward.end.fill"
        size={30}
        onPress={previous}
        onLongPress={() => startHold(-1)}
        onPressOut={endHold}
        accessibilityLabel="Previous track"
        accessibilityHint="Hold to rewind"
      />
      <PlayButton playing={playing} onPress={toggle} />
      <IconButton
        name="forward.end.fill"
        size={30}
        onPress={next}
        onLongPress={() => startHold(1)}
        onPressOut={endHold}
        accessibilityLabel="Next track"
        accessibilityHint="Hold to fast-forward"
      />
      {longForm ? (
        <IconButton name={skipIcon('forward', prefs.skipSeconds)} size={26} onPress={() => skip(skipMs)} accessibilityLabel={`Forward ${prefs.skipSeconds} seconds`} />
      ) : (
        <ModeButton
          name={repeat === 'one' ? 'repeat.1' : 'repeat'}
          active={repeat !== 'off'}
          onPress={doRepeat}
          accessibilityLabel={`${REPEAT_LABEL[repeat]}. Change repeat mode`}
        />
      )}
    </View>
  );
  const volumeRow = prefs.showVolume ? (
    <View style={styles.volume}>
      <IconButton name="speaker.fill" size={14} color={colors.secondaryLabel} onPress={() => setPref('volume', 0)} accessibilityLabel="Mute" />
      <View style={{ flex: 1 }}>
        <Slider
          value={prefs.volume}
          min={0}
          max={1}
          step={0.01}
          accessibilityLabel="Volume"
          formatValue={(v) => `${Math.round(v * 100)} percent`}
          onChange={(v) => previewSound({ volume: v })}
          onCommit={(v) => setPref('volume', v)}
        />
      </View>
      <IconButton name="speaker.wave.3.fill" size={14} color={colors.secondaryLabel} onPress={() => setPref('volume', 1)} accessibilityLabel="Full volume" />
    </View>
  ) : null;
  const shortcutRow = prefs.playerShortcuts.length ? (
    <View style={[styles.shortcuts, prefs.playerShortcuts.length < 4 && styles.fewShortcuts]}>
      {prefs.playerShortcuts.map((key) => {
        const s = shortcut(key);
        const def = SHORTCUTS[key];
        return (
          <IconButton
            key={key}
            name={s.active && def.activeIcon ? def.activeIcon : def.icon}
            size={20}
            color={s.active ? colors.tint : colors.secondaryLabel}
            onPress={s.onPress}
            onLongPress={s.onLongPress}
            accessibilityLabel={s.label}
            accessibilityHint={s.hint}
          />
        );
      })}
    </View>
  ) : null;
  const controls = (
    <>
      <StatusPills pills={pills} />
      {seekRow}
      {transport}
      {volumeRow}
      {shortcutRow}
    </>
  );

  let body: ReactElement;
  if (landscape) {
    // Side by side: the artwork as tall as the screen allows, everything else beside it.
    const size = Math.min(height - insets.top - insets.bottom - spacing.xl * 2, width * 0.42);
    body = (
      <View style={[styles.landscape, { paddingLeft: insets.left + spacing.xl, paddingRight: insets.right + spacing.xl }]}>
        <View style={{ width: size, height: size }}>{showLyrics ? lyrics : artwork(size, 'md')}</View>
        <ScrollView
          style={styles.side}
          contentContainerStyle={styles.sideContent}
          scrollEnabled={scrubMs === null}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {showLyrics ? (
            // Lyrics took the artwork's place, so a small copy of it stays beside the title.
            <View style={styles.compactHead}>
              <Artwork artKey={track.art_key} size={COMPACT_ART / 1.5} rounded="md" />
              <View style={{ flex: 1 }}>{titleRow}</View>
            </View>
          ) : (
            titleRow
          )}
          {controls}
        </ScrollView>
      </View>
    );
  } else {
    // One screen of player, then the cards; the first card peeks out at the bottom.
    const heroHeight = Math.max(0, (viewport || height) - insets.bottom - CARD_PEEK);
    const upNext = tracks.slice(currentIndex + 1, currentIndex + 1 + UP_NEXT);
    const size = Math.floor(Math.min(artBox.width, artBox.height));
    const hero =
      layout === 'compact' ? (
        // Smaller artwork beside the title, and the next few songs where the artwork was.
        <View style={[styles.hero, { height: heroHeight }]}>
          {header}
          <View style={styles.compactHead}>
            {showLyrics ? null : <Artwork artKey={track.art_key} size={COMPACT_ART} rounded="md" />}
            <View style={{ flex: 1 }}>{titleRow}</View>
          </View>
          <View style={styles.upNext}>
            {showLyrics ? (
              lyrics
            ) : (
              <>
                <Text style={[type.footnote, styles.upNextTitle]}>{upNext.length ? 'UP NEXT' : 'END OF THE QUEUE'}</Text>
                {upNext.map((t, i) => (
                  <Pressable
                    key={`${t.id}:${i}`}
                    onPress={() => void playAt(currentIndex + 1 + i)}
                    style={({ pressed }) => [styles.upNextRow, pressed && { opacity: 0.5 }]}
                    accessibilityRole="button"
                  >
                    <Artwork artKey={t.art_key} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[type.subhead, { color: colors.label }]}>{t.title}</Text>
                      <Text numberOfLines={1} style={[type.caption, { color: colors.secondaryLabel }]}>{t.artist ?? t.folder}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </View>
          {controls}
        </View>
      ) : (
        // Standard: Spotify's rounded artwork. Edge: the artwork from one side to the other.
        <View style={[styles.hero, { height: heroHeight }]}>
          {header}
          <View style={[styles.artArea, layout === 'edge' && styles.edgeArt]} onLayout={measureArt}>
            {showLyrics ? lyrics : size > 0 ? artwork(size, layout === 'edge' ? 'none' : 'md') : null}
          </View>
          {titleRow}
          {controls}
        </View>
      );
    body = (
      <ScrollView
        ref={scroll}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        scrollEnabled={!swiping && scrubMs === null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {hero}
        <View style={styles.cards}>
          <LyricsCard track={track} positionMs={positionMs} showing={showLyrics} onToggle={toggleLyrics} onEdit={editLyrics} />
          {layout === 'compact' ? null : (
            <UpNextCard queues={queues} activeId={activeId} tracks={tracks} currentIndex={currentIndex} onOpen={openQueue} />
          )}
          <BookmarksCard trackId={track.id} onSeek={seek} />
          <AboutCard track={track} onAlbum={goAlbum} onArtist={goArtist} onDetails={openDetails} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      {prefs.blurBackground ? <Backdrop artKey={track.art_key} /> : null}
      {/* The sheet's own top edge, not the phone's; the sides and bottom are padded by hand. */}
      <SafeAreaView edges={['top']} style={styles.safe}>
        {body}
      </SafeAreaView>
      {/* The app-wide toast sits under this modal, so the player shows its own. */}
      <ToastHost />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  hero: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.sm },
  artArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  edgeArt: { marginHorizontal: -spacing.xl },
  artShadow: { boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: colors.shadow }] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleText: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontWeight: '700', color: colors.label },
  artist: { ...type.body, color: colors.secondaryLabel },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.xs },
  time: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  volume: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shortcuts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  fewShortcuts: { justifyContent: 'space-around' },
  cards: { paddingHorizontal: spacing.lg, gap: spacing.md },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  upNext: { flex: 1, minHeight: 0, gap: spacing.sm },
  upNextTitle: { color: colors.secondaryLabel, paddingTop: spacing.sm },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  landscape: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  side: { flex: 1, alignSelf: 'stretch' },
  sideContent: { flexGrow: 1, justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.md },
}));
