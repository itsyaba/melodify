import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { SymbolView } from '@/components/symbol';
import { listPlaysBetween, type PlayRow } from '@/db/recap';
import { getTrack } from '@/db/tracks';
import type { Track } from '@/db/types';
import { usePlaybackState } from '@/player/queue-store';
import { sweep } from '@/screens/home/cards';
import { Glow, useReduceMotion } from '@/screens/onboarding/art';
import { face } from '@/screens/onboarding/fonts';
import { RECAP, RECAP_CARDS, radius, spacing, type } from '@/theme';
import { formatCount, formatDate } from '@/utils/format';
import { previousPeriod, type RecapPeriod } from './period';
import { startRecapSound, stopRecapSound, toggleRecapSound } from './sound';
import { closeRecap, currentRecap, subscribeRecap } from './state';
import { buildRecap, hourLabel, hourPhrase, minutesChange, type Recap } from './stats';

const FADE_MS = 320;
/** How long a card holds before the next one comes up by itself. */
const CARD_MS = 7000;
/** The last card waits longer: it is the one with the buttons on it. */
const LAST_CARD_MS = 12_000;
const ENTER_MS = 620;
/** How many of the span's top songs play behind the cards. */
const SOUNDTRACK = 5;

/**
 * The recap, over the whole app: mounted once in the root layout beside the welcome pages. It
 * fades in when a month or a year is due, or when Settings asks for one, reads its numbers from
 * the plays table, and plays the songs it is about while the cards go by on their own.
 */
export function RecapHost() {
  const period = useSyncExternalStore(subscribeRecap, currentRecap, currentRecap);
  const [shown, setShown] = useState<RecapPeriod | null>(period);
  const opacity = useRef(new Animated.Value(period ? 1 : 0)).current;

  useEffect(() => {
    if (period) setShown(period);
    const fade = Animated.timing(opacity, {
      toValue: period ? 1 : 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished && !period) setShown(null);
    });
    return () => fade.stop();
  }, [period, opacity]);

  if (!shown) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={period ? 'auto' : 'none'} accessibilityViewIsModal>
      <RecapStory period={shown} open={period !== null} />
    </Animated.View>
  );
}

function RecapStory({ period, open }: { period: RecapPeriod; open: boolean }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const scroller = useRef<Animated.FlatList<CardSpec>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [held, setHeld] = useState(false);
  // The transport on its own, so the mute button follows a pause from anywhere without the
  // position ticks re-rendering the cards four times a second.
  const playback = usePlaybackState();

  useEffect(() => {
    let cancelled = false;
    const before = previousPeriod(period);
    Promise.all([listPlaysBetween(db, period.from, period.to), listPlaysBetween(db, before.from, before.to)])
      .then(([rows, earlier]: [PlayRow[], PlayRow[]]) => {
        if (!cancelled) setRecap(buildRecap(period, rows, earlier));
      })
      .catch((err: unknown) => {
        console.warn('[melodify] building the recap failed:', err);
        if (!cancelled) setRecap(buildRecap(period, []));
      });
    return () => {
      cancelled = true;
    };
  }, [db, period]);

  // The songs the recap is about, playing behind it. Loaded from the library by id, since the
  // ranking carries only what the plays table knows.
  useEffect(() => {
    if (!recap || !open) return;
    let cancelled = false;
    const ids = recap.topTracks.slice(0, SOUNDTRACK).map((t) => t.track_id);
    if (ids.length === 0) return;
    void Promise.all(ids.map((id) => getTrack(db, id)))
      .then((tracks) => {
        const found = tracks.filter((t): t is Track => t !== null);
        if (!cancelled && found.length) return startRecapSound(found);
      })
      .catch((err: unknown) => console.warn('[melodify] the recap soundtrack failed:', err));
    return () => {
      cancelled = true;
    };
  }, [db, recap, open]);

  // Leaving the recap, however it happens, gives the queue back as it was.
  useEffect(() => () => void stopRecapSound(), []);

  const cards = useMemo(() => (recap ? buildCards(recap) : []), [recap]);
  const count = Math.max(1, cards.length);

  const go = (next: number) => {
    const target = Math.min(count - 1, Math.max(0, next));
    setPage(target);
    scroller.current?.scrollToOffset({ offset: target * width, animated: true });
  };

  // Android's back button steps back a card, and closes the recap on the first one.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page > 0) go(page - 1);
      else closeRecap();
      return true;
    });
    return () => sub.remove();
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(e.nativeEvent.contentOffset.x / width);
    if (at !== page) setPage(at);
  };

  const look = RECAP_CARDS[page % RECAP_CARDS.length];
  const muted = playback !== 'playing';

  return (
    <View style={[styles.root, sweep(look.gradient)]}>
      <StatusBar style="light" />
      <DriftingGlow size={width * 1.5} hex={look.glow} strength={0.5} still={reduceMotion} corner="top" />
      <DriftingGlow size={width * 1.1} hex={look.glow} strength={0.3} still={reduceMotion} corner="bottom" />

      <Animated.FlatList
        ref={scroller}
        data={cards.length ? cards : [LOADING_CARD]}
        keyExtractor={(card: CardSpec) => card.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={StyleSheet.absoluteFill}
        renderItem={({ item, index }: { item: CardSpec; index: number }) => (
          <StoryPage
            spec={item}
            index={index}
            active={index === page}
            scrollX={scrollX}
            width={width}
            height={height}
            reduceMotion={reduceMotion}
            padTop={insets.top + 64}
            padBottom={insets.bottom + 104}
          />
        )}
      />

      {/* The tap zones sit under the buttons: a tap on either half steps through the cards, and
          a finger held down holds the card, as a story does. */}
      <Pressable
        style={[styles.tap, styles.tapLeft, { top: insets.top + 56, bottom: insets.bottom + 88 }]}
        onPress={() => go(page - 1)}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        accessibilityLabel="Previous card"
        accessibilityRole="button"
      />
      <Pressable
        style={[styles.tap, styles.tapRight, { top: insets.top + 56, bottom: insets.bottom + 88 }]}
        onPress={() => (page === count - 1 ? closeRecap() : go(page + 1))}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        accessibilityLabel={page === count - 1 ? 'Close the recap' : 'Next card'}
        accessibilityRole="button"
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.segments}>
          {Array.from({ length: count }, (_, i) => (
            <Segment
              key={i}
              state={i < page ? 'done' : i === page ? 'running' : 'waiting'}
              duration={i === count - 1 ? LAST_CARD_MS : CARD_MS}
              paused={held || !recap}
              onDone={() => {
                if (i === page && page < count - 1) go(page + 1);
              }}
            />
          ))}
        </View>
        <View style={styles.topRow} pointerEvents="box-none">
          <Text style={[type.footnote, styles.topLabel, face('medium')]}>
            {period.kind === 'year' ? `${period.label} in music` : period.label}
          </Text>
          <View style={styles.topButtons}>
            <Pressable
              onPress={() => void toggleRecapSound()}
              hitSlop={spacing.md}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Play the recap’s music' : 'Mute the recap’s music'}
            >
              <SymbolView name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} size={18} tintColor={RECAP.ink} weight="semibold" />
            </Pressable>
            <Pressable onPress={closeRecap} hitSlop={spacing.md} accessibilityRole="button" accessibilityLabel="Close the recap">
              <SymbolView name="xmark" size={18} tintColor={RECAP.ink} weight="semibold" />
            </Pressable>
          </View>
        </View>
      </View>

      {recap ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]} pointerEvents="box-none">
          {page === count - 1 ? (
            <View style={styles.bottomRow}>
              <Pressable style={styles.ghost} onPress={() => void shareRecap(recap)} accessibilityRole="button">
                <SymbolView name="square.and.arrow.up" size={16} tintColor={RECAP.ink} />
                <Text style={[type.subhead, styles.ghostText, face('semibold')]}>Share</Text>
              </Pressable>
              <Pressable style={styles.solid} onPress={closeRecap} accessibilityRole="button">
                <Text style={[type.subhead, styles.solidText, face('semibold')]}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.solid} onPress={() => go(page + 1)} accessibilityRole="button">
              <Text style={[type.subhead, styles.solidText, face('semibold')]}>Next</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One of the bars across the top. The one on the card being shown fills over the card's time and
 * then calls for the next; a finger held down holds it where it is.
 */
function Segment({
  state,
  duration,
  paused,
  onDone,
}: {
  state: 'done' | 'running' | 'waiting';
  duration: number;
  paused: boolean;
  onDone: () => void;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  // Where the fill was when a hold paused it, so it carries on rather than starting over.
  const at = useRef(0);

  useEffect(() => {
    const listener = fill.addListener(({ value }) => (at.current = value));
    return () => fill.removeListener(listener);
  }, [fill]);

  useEffect(() => {
    if (state === 'waiting') {
      fill.setValue(0);
      at.current = 0;
      return;
    }
    if (state === 'done') {
      fill.setValue(1);
      return;
    }
    if (paused) return;
    const run = Animated.timing(fill, {
      toValue: 1,
      duration: Math.max(200, duration * (1 - at.current)),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => run.stop();
  }, [state, paused, duration, fill]);

  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, { transform: [{ scaleX: fill }] }]} />
    </View>
  );
}

/**
 * A card with the two motions a story has: it slides in from the side as the pager moves (its
 * text a little faster than its background, so the page has depth), and its parts rise into
 * place one after another when it becomes the one being read.
 */
function StoryPage({
  spec,
  index,
  active,
  scrollX,
  width,
  height,
  reduceMotion,
  padTop,
  padBottom,
}: {
  spec: CardSpec;
  index: number;
  active: boolean;
  scrollX: Animated.Value;
  width: number;
  height: number;
  reduceMotion: boolean;
  padTop: number;
  padBottom: number;
}) {
  const enter = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (!active) {
      enter.setValue(0);
      return;
    }
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    const run = Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [active, enter, reduceMotion]);

  const window = [(index - 1) * width, index * width, (index + 1) * width];
  const parallax = reduceMotion
    ? 0
    : scrollX.interpolate({ inputRange: window, outputRange: [width * 0.35, 0, -width * 0.35], extrapolate: 'clamp' });
  const fade = scrollX.interpolate({ inputRange: window, outputRange: [0, 1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ width, height }}>
      <Animated.View
        style={[
          styles.page,
          { paddingTop: padTop, paddingBottom: padBottom, opacity: fade, transform: [{ translateX: parallax }] },
        ]}
      >
        <Card spec={spec} enter={enter} active={active} />
      </Animated.View>
    </View>
  );
}

/** Rises in over `[from, to]` of the card's entrance, and shifts up as it does. */
function Rise({ enter, from, to, children }: { enter: Animated.Value; from: number; to: number; children: ReactNode }) {
  const range = { inputRange: [from, to], extrapolate: 'clamp' as const };
  return (
    <Animated.View
      style={{
        opacity: enter.interpolate({ ...range, outputRange: [0, 1] }),
        transform: [{ translateY: enter.interpolate({ ...range, outputRange: [26, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function Card({ spec, enter, active }: { spec: CardSpec; enter: Animated.Value; active: boolean }) {
  return (
    <View style={styles.card}>
      <Rise enter={enter} from={0} to={0.45}>
        <Text style={[type.footnote, styles.eyebrow, face('semibold')]}>{spec.eyebrow.toUpperCase()}</Text>
      </Rise>
      <Rise enter={enter} from={0.1} to={0.6}>
        {spec.count ? (
          <CountUp value={spec.count.value} suffix={spec.count.suffix} active={active} />
        ) : (
          <Text style={[styles.title, face('semibold')]} numberOfLines={3} adjustsFontSizeToFit>
            {spec.title}
          </Text>
        )}
      </Rise>
      {spec.lines.map((line, i) => (
        <Rise key={line} enter={enter} from={0.25 + i * 0.08} to={0.75 + i * 0.08}>
          <Text style={[type.body, styles.line, face('regular')]}>{line}</Text>
        </Rise>
      ))}
      {spec.extra ? (
        <Rise enter={enter} from={0.4} to={1}>
          {spec.extra(enter, active)}
        </Rise>
      ) : null}
    </View>
  );
}

/** A number that counts up to itself, the way a scoreboard lands on a total. */
function CountUp({ value, suffix, active }: { value: number; suffix: string; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(active ? 0 : value);

  useEffect(() => {
    if (!active) {
      setShown(value);
      return;
    }
    // Only as many steps as the eye can follow, so the text is not set 60 times a second.
    const step = Math.max(1, Math.round(value / 40));
    const listener = progress.addListener(({ value: at }) => {
      const next = Math.round((at * value) / step) * step;
      setShown(Math.min(value, next));
    });
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start(({ finished }) => {
      if (finished) setShown(value);
    });
    return () => {
      run.stop();
      progress.removeListener(listener);
    };
  }, [active, value, progress]);

  return (
    <Text style={[styles.title, face('semibold')]} numberOfLines={2} adjustsFontSizeToFit>
      {shown.toLocaleString()}
      {suffix}
    </Text>
  );
}

/** A glow that drifts and breathes, so a card is never quite still. */
function DriftingGlow({
  size,
  hex,
  strength,
  still,
  corner,
}: {
  size: number;
  hex: string;
  strength: number;
  still: boolean;
  corner: 'top' | 'bottom';
}) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, still]);

  const away = corner === 'top' ? 1 : -1;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40 * away] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 30 * away] }) },
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        },
      ]}
    >
      <Glow
        size={size}
        hex={hex}
        strength={strength}
        style={corner === 'top' ? { top: -size * 0.45, left: -size * 0.2 } : { bottom: -size * 0.4, right: -size * 0.3 }}
      />
    </Animated.View>
  );
}

/** A ranked row under a headline: "2  Song — Artist", with its plays at the end. */
function RankRow({ at, name, under, plays }: { at: number; name: string; under?: string | null; plays: number }) {
  return (
    <View style={styles.rank}>
      <Text style={[type.subhead, styles.rankAt, face('semibold')]}>{at}</Text>
      <View style={styles.rankText}>
        <Text numberOfLines={1} style={[type.subhead, styles.rankName, face('medium')]}>{name}</Text>
        {under ? <Text numberOfLines={1} style={[type.caption, styles.rankUnder]}>{under}</Text> : null}
      </View>
      <Text style={[type.caption, styles.rankPlays]}>{plays}</Text>
    </View>
  );
}

/** The clock card's 24 bars, growing one after another, tallest at the hour with the most plays. */
function HourBars({ byHour, enter }: { byHour: number[]; enter: Animated.Value }) {
  const peak = Math.max(1, ...byHour);
  return (
    <View style={styles.bars} accessibilityRole="image" accessibilityLabel="Plays through the day">
      {byHour.map((count, hour) => {
        const height = Math.max(3, (count / peak) * 110);
        const from = 0.3 + (hour / byHour.length) * 0.5;
        return (
          <View key={hour} style={styles.barSlot}>
            <Animated.View
              style={[
                styles.bar,
                count === peak && styles.barPeak,
                {
                  height,
                  transform: [
                    {
                      scaleY: enter.interpolate({ inputRange: [from, Math.min(1, from + 0.25)], outputRange: [0.04, 1], extrapolate: 'clamp' }),
                    },
                  ],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/** The artwork a card leads with, turning in as the card arrives. */
function Hero({ artKey, round, enter }: { artKey: string | null; round?: boolean; enter: Animated.Value }) {
  const range = { inputRange: [0.35, 0.9], extrapolate: 'clamp' as const };
  return (
    <Animated.View
      style={[
        styles.hero,
        {
          opacity: enter.interpolate({ ...range, outputRange: [0, 1] }),
          transform: [
            { scale: enter.interpolate({ ...range, outputRange: [0.82, 1] }) },
            { rotate: enter.interpolate({ ...range, outputRange: ['-6deg', '0deg'] }) },
          ],
        },
      ]}
    >
      <Artwork artKey={artKey} size={132} rounded={round ? 'full' : 'lg'} />
    </Animated.View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, face('semibold')]}>{value.toLocaleString()}</Text>
      <Text style={[type.caption, styles.statLabel]}>{label}</Text>
    </View>
  );
}

interface CardSpec {
  key: string;
  eyebrow: string;
  title: string;
  /** A headline that counts up to itself instead of simply being there. */
  count?: { value: number; suffix: string };
  lines: string[];
  extra?: (enter: Animated.Value, active: boolean) => ReactNode;
}

const LOADING_CARD: CardSpec = { key: 'loading', eyebrow: 'Counting', title: 'One moment', lines: ['Reading what you played…'] };

function buildCards(recap: Recap): CardSpec[] {
  const { period } = recap;
  const cards: CardSpec[] = [];
  const whole = period.kind === 'year' ? 'year' : 'month';
  const change = minutesChange(recap);
  const top = recap.topArtists[0];
  const song = recap.topTracks[0];

  cards.push({
    key: 'open',
    eyebrow: period.kind === 'year' ? 'Your year in music' : 'Your month in music',
    title: period.shortLabel,
    lines: [`${formatCount(recap.plays, 'play')} across ${formatCount(recap.songs, 'song')}.`, 'Here is how it sounded.'],
  });

  cards.push({
    key: 'minutes',
    eyebrow: 'Time spent listening',
    title: `${recap.minutes.toLocaleString()} minutes`,
    count: { value: recap.minutes, suffix: ' minutes' },
    lines: [
      change
        ? `${change.percent}% ${change.up ? 'more' : 'less'} than the ${whole} before.`
        : `That is ${formatCount(Math.round(recap.minutes / 60), 'hour')} of music.`,
    ],
    extra: () => (
      <View style={styles.stats}>
        <Stat value={recap.songs} label="songs" />
        <Stat value={recap.artists} label="artists" />
        <Stat value={recap.albums} label="albums" />
      </View>
    ),
  });

  if (top) {
    cards.push({
      key: 'artist',
      eyebrow: `Your top artist this ${whole}`,
      title: top.name,
      lines: [
        `${formatCount(top.plays, 'play')} · ${formatCount(Math.round(top.ms / 60_000), 'minute')}`,
        recap.topArtistShare >= 0.15
          ? `That is ${Math.round(recap.topArtistShare * 100)}% of everything you played.`
          : 'Played more than anyone else in your library.',
      ],
      extra: (enter) => (
        <View>
          <Hero artKey={top.art_key} round enter={enter} />
          {recap.topArtists.slice(1).map((artist, i) => (
            <RankRow key={artist.name} at={i + 2} name={artist.name} plays={artist.plays} />
          ))}
        </View>
      ),
    });
  }

  if (song) {
    cards.push({
      key: 'song',
      eyebrow: `On repeat this ${whole}`,
      title: song.name,
      lines: [song.artist ?? 'Unknown artist', formatCount(song.plays, 'play')],
      extra: (enter) => (
        <View>
          <Hero artKey={song.art_key} enter={enter} />
          {recap.topTracks.slice(1).map((track, i) => (
            <RankRow key={track.track_id} at={i + 2} name={track.name} under={track.artist} plays={track.plays} />
          ))}
        </View>
      ),
    });
  }

  cards.push({
    key: 'clock',
    eyebrow: 'Your listening clock',
    title: hourLabel(recap.peakHour),
    lines: [
      `You play the most music ${hourPhrase(recap.peakHour)}.`,
      recap.busiestDay
        ? `Your busiest day was ${formatDate(recap.busiestDay.at)}, with ${formatCount(recap.busiestDay.plays, 'play')}.`
        : '',
    ].filter(Boolean),
    extra: (enter) => <HourBars byHour={recap.byHour} enter={enter} />,
  });

  cards.push({
    key: 'days',
    eyebrow: 'Days with music',
    title: `${recap.activeDays} of ${recap.totalDays}`,
    lines: [
      recap.streak > 1 ? `Your longest run was ${formatCount(recap.streak, 'day')} without a gap.` : 'Every one of them counted.',
      recap.discoveries.songs
        ? `You heard ${formatCount(recap.discoveries.songs, 'song')} for the first time${
            recap.discoveries.artists ? `, from ${formatCount(recap.discoveries.artists, 'new artist')}` : ''
          }.`
        : '',
    ].filter(Boolean),
    extra: recap.discoveries.covers.length
      ? (enter) => (
          <View style={styles.covers}>
            {recap.discoveries.covers.map((art, i) => (
              <Animated.View
                key={art}
                style={{
                  opacity: enter.interpolate({ inputRange: [0.4 + i * 0.07, 0.7 + i * 0.07], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    {
                      translateY: enter.interpolate({
                        inputRange: [0.4 + i * 0.07, 0.7 + i * 0.07],
                        outputRange: [18, 0],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                }}
              >
                <Artwork artKey={art} size={56} rounded="md" />
              </Animated.View>
            ))}
          </View>
        )
      : undefined,
  });

  cards.push({
    key: 'persona',
    eyebrow: `Your ${whole} in one word`,
    title: recap.persona.title,
    lines: [recap.persona.blurb, recap.averageYear ? `The music you played was released around ${recap.averageYear}.` : ''].filter(Boolean),
    extra: recap.topGenres.length
      ? () => (
          <View style={styles.chips}>
            {recap.topGenres.map((genre) => (
              <View key={genre.name} style={styles.chip}>
                <Text style={[type.caption, styles.chipText, face('medium')]}>{genre.name}</Text>
              </View>
            ))}
          </View>
        )
      : undefined,
  });

  cards.push({
    key: 'outro',
    eyebrow: 'That was it',
    title: period.kind === 'year' ? `See you in ${Number(period.key) + 1}` : 'See you next month',
    lines: [
      top ? `${top.name} carried this ${whole}.` : '',
      `${recap.minutes.toLocaleString()} minutes, ${formatCount(recap.songs, 'song')}, ${formatCount(recap.artists, 'artist')}.`,
      'Settings › Your recap opens this again any time.',
    ].filter(Boolean),
  });

  return cards;
}

/** The recap as a few lines of text, for the share sheet. Nothing leaves the phone on its own. */
async function shareRecap(recap: Recap): Promise<void> {
  const lines = [
    `My ${recap.period.label} in music (Melodify)`,
    `${recap.minutes.toLocaleString()} minutes · ${formatCount(recap.plays, 'play')} · ${formatCount(recap.songs, 'song')}`,
    recap.topArtists[0] ? `Top artist: ${recap.topArtists[0].name} (${formatCount(recap.topArtists[0].plays, 'play')})` : '',
    recap.topTracks[0] ? `On repeat: ${recap.topTracks[0].name} (${formatCount(recap.topTracks[0].plays, 'play')})` : '',
    `${recap.persona.title}: ${recap.persona.blurb}`,
  ].filter(Boolean);
  try {
    await Share.share({ message: lines.join('\n') });
  } catch (err) {
    console.warn('[melodify] sharing the recap failed:', err);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#120a1f', overflow: 'hidden' },
  page: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  card: { gap: spacing.sm },
  eyebrow: { color: RECAP.muted, letterSpacing: 1.4 },
  title: { color: RECAP.ink, fontSize: 44, lineHeight: 50 },
  line: { color: RECAP.muted },
  hero: { alignItems: 'flex-start', paddingVertical: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.xl, paddingTop: spacing.lg },
  stat: { gap: 2 },
  statValue: { color: RECAP.ink, fontSize: 26 },
  statLabel: { color: RECAP.muted },
  rank: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 5 },
  rankAt: { color: RECAP.faint, width: 18 },
  rankText: { flex: 1 },
  rankName: { color: RECAP.ink },
  rankUnder: { color: RECAP.muted },
  rankPlays: { color: RECAP.muted },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120, paddingTop: spacing.lg },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3, backgroundColor: RECAP.faint, transformOrigin: 'bottom' },
  barPeak: { backgroundColor: RECAP.ink },
  covers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: RECAP.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RECAP.glassEdge,
  },
  chipText: { color: RECAP.ink },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: spacing.lg, gap: spacing.sm },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: RECAP.faint, overflow: 'hidden' },
  segmentFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: RECAP.ink,
    transformOrigin: 'left',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { color: RECAP.muted },
  topButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  tap: { position: 'absolute', width: '28%' },
  tapLeft: { left: 0 },
  tapRight: { right: 0 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl },
  bottomRow: { flexDirection: 'row', gap: spacing.md },
  solid: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.full, backgroundColor: RECAP.button },
  solidText: { color: RECAP.buttonInk },
  ghost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: RECAP.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RECAP.glassEdge,
  },
  ghostText: { color: RECAP.ink },
});
