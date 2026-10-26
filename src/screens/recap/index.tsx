import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
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
import { face } from '@/screens/onboarding/fonts';
import { sweep } from '@/screens/home/cards';
import { Glow } from '@/screens/onboarding/art';
import { RECAP, RECAP_CARDS, radius, spacing, type } from '@/theme';
import { formatCount, formatDate } from '@/utils/format';
import { previousPeriod, type RecapPeriod } from './period';
import { closeRecap, currentRecap, subscribeRecap } from './state';
import { buildRecap, hourLabel, hourPhrase, minutesChange, type Recap } from './stats';

const FADE_MS = 320;

/**
 * The recap, over the whole app: mounted once in the root layout beside the welcome pages. It
 * fades in when a month or a year is due, or when Settings asks for one, and reads its numbers
 * from the plays table while the first card is already on screen.
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
      <RecapStory period={shown} />
    </Animated.View>
  );
}

function RecapStory({ period }: { period: RecapPeriod }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [recap, setRecap] = useState<Recap | null>(null);

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

  // Android's back button steps back a card, and closes the recap on the first one.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page > 0) {
        go(page - 1);
        return true;
      }
      closeRecap();
      return true;
    });
    return () => sub.remove();
  });

  const cards = useMemo(() => (recap ? buildCards(recap) : []), [recap]);
  const count = Math.max(1, cards.length);

  const go = (next: number) => {
    const target = Math.min(count - 1, Math.max(0, next));
    setPage(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(e.nativeEvent.contentOffset.x / width);
    if (at !== page) setPage(at);
  };

  const look = RECAP_CARDS[page % RECAP_CARDS.length];

  return (
    <View style={[styles.root, sweep(look.gradient)]}>
      <StatusBar style="light" />
      <Glow size={width * 1.4} hex={look.glow} strength={0.5} style={{ top: -width * 0.5, left: -width * 0.2 }} />
      <Glow size={width} hex={look.glow} strength={0.3} style={{ bottom: -width * 0.3, right: -width * 0.3 }} />

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={StyleSheet.absoluteFill}
      >
        {(cards.length ? cards : [<Loading key="loading" period={period} />]).map((card, i) => (
          <View key={i} style={{ width, height }}>
            <View style={[styles.page, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 96 }]}>{card}</View>
          </View>
        ))}
      </ScrollView>

      {/* The tap zones sit under the buttons: a tap on either half steps through the cards. */}
      <Pressable
        style={[styles.tap, styles.tapLeft, { top: insets.top + 56, bottom: insets.bottom + 80 }]}
        onPress={() => go(page - 1)}
        accessibilityLabel="Previous card"
        accessibilityRole="button"
      />
      <Pressable
        style={[styles.tap, styles.tapRight, { top: insets.top + 56, bottom: insets.bottom + 80 }]}
        onPress={() => (page === count - 1 ? closeRecap() : go(page + 1))}
        accessibilityLabel={page === count - 1 ? 'Close the recap' : 'Next card'}
        accessibilityRole="button"
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.segments}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={[styles.segment, i <= page && styles.segmentOn]} />
          ))}
        </View>
        <View style={styles.topRow} pointerEvents="box-none">
          <Text style={[type.footnote, styles.topLabel, face('medium')]}>
            {period.kind === 'year' ? `${period.label} in music` : `${period.label}`}
          </Text>
          <Pressable onPress={closeRecap} hitSlop={spacing.md} accessibilityRole="button" accessibilityLabel="Close the recap">
            <SymbolView name="xmark" size={18} tintColor={RECAP.ink} weight="semibold" />
          </Pressable>
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

function Loading({ period }: { period: RecapPeriod }) {
  return (
    <Card eyebrow="Counting" title={period.shortLabel} lines={['Reading what you played…']} />
  );
}

/** The shape every card shares: a small label, a headline, and lines under it. */
function Card({
  eyebrow,
  title,
  lines,
  children,
}: {
  eyebrow: string;
  title: string;
  lines?: string[];
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={[type.footnote, styles.eyebrow, face('semibold')]}>{eyebrow.toUpperCase()}</Text>
      <Text style={[styles.title, face('semibold')]} numberOfLines={3} adjustsFontSizeToFit>
        {title}
      </Text>
      {lines?.map((line) => (
        <Text key={line} style={[type.body, styles.line, face('regular')]}>
          {line}
        </Text>
      ))}
      {children}
    </View>
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

/** The clock card's 24 bars, tallest at the hour with the most plays. */
function HourBars({ byHour }: { byHour: number[] }) {
  const peak = Math.max(1, ...byHour);
  return (
    <View style={styles.bars} accessibilityRole="image" accessibilityLabel="Plays through the day">
      {byHour.map((count, hour) => (
        <View key={hour} style={styles.barSlot}>
          <View style={[styles.bar, { height: Math.max(3, (count / peak) * 110) }, count === peak && styles.barPeak]} />
        </View>
      ))}
    </View>
  );
}

function buildCards(recap: Recap): ReactNode[] {
  const { period } = recap;
  const cards: ReactNode[] = [];
  const whole = period.kind === 'year' ? 'year' : 'month';
  const change = minutesChange(recap);
  const top = recap.topArtists[0];
  const song = recap.topTracks[0];

  cards.push(
    <Card
      key="open"
      eyebrow={period.kind === 'year' ? 'Your year in music' : 'Your month in music'}
      title={period.shortLabel}
      lines={[
        `${formatCount(recap.plays, 'play')} across ${formatCount(recap.songs, 'song')}.`,
        'Here is how it sounded.',
      ]}
    />,
  );

  cards.push(
    <Card
      key="minutes"
      eyebrow="Time spent listening"
      title={`${recap.minutes.toLocaleString()} minutes`}
      lines={[
        change
          ? `${change.percent}% ${change.up ? 'more' : 'less'} than the ${whole} before.`
          : `That is ${formatCount(Math.round(recap.minutes / 60), 'hour')} of music.`,
      ]}
    >
      <View style={styles.stats}>
        <Stat value={recap.songs} label="songs" />
        <Stat value={recap.artists} label="artists" />
        <Stat value={recap.albums} label="albums" />
      </View>
    </Card>,
  );

  if (top) {
    cards.push(
      <Card
        key="artist"
        eyebrow={`Your top artist this ${whole}`}
        title={top.name}
        lines={[
          `${formatCount(top.plays, 'play')} · ${formatCount(Math.round(top.ms / 60_000), 'minute')}`,
          recap.topArtistShare >= 0.15
            ? `That is ${Math.round(recap.topArtistShare * 100)}% of everything you played.`
            : 'Played more than anyone else in your library.',
        ]}
      >
        <View style={styles.hero}>
          <Artwork artKey={top.art_key} size={132} rounded="full" />
        </View>
        {recap.topArtists.slice(1).map((artist, i) => (
          <RankRow key={artist.name} at={i + 2} name={artist.name} plays={artist.plays} />
        ))}
      </Card>,
    );
  }

  if (song) {
    cards.push(
      <Card
        key="song"
        eyebrow={`On repeat this ${whole}`}
        title={song.name}
        lines={[song.artist ?? 'Unknown artist', `${formatCount(song.plays, 'play')}`]}
      >
        <View style={styles.hero}>
          <Artwork artKey={song.art_key} size={132} rounded="lg" />
        </View>
        {recap.topTracks.slice(1).map((track, i) => (
          <RankRow key={track.track_id} at={i + 2} name={track.name} under={track.artist} plays={track.plays} />
        ))}
      </Card>,
    );
  }

  cards.push(
    <Card
      key="clock"
      eyebrow="Your listening clock"
      title={hourLabel(recap.peakHour)}
      lines={[
        `You play the most music ${hourPhrase(recap.peakHour)}.`,
        recap.busiestDay
          ? `Your busiest day was ${formatDate(recap.busiestDay.at)}, with ${formatCount(recap.busiestDay.plays, 'play')}.`
          : '',
      ].filter(Boolean)}
    >
      <HourBars byHour={recap.byHour} />
    </Card>,
  );

  cards.push(
    <Card
      key="days"
      eyebrow="Days with music"
      title={`${recap.activeDays} of ${recap.totalDays}`}
      lines={[
        recap.streak > 1 ? `Your longest run was ${formatCount(recap.streak, 'day')} without a gap.` : 'Every one of them counted.',
        recap.discoveries.songs
          ? `You heard ${formatCount(recap.discoveries.songs, 'song')} for the first time${
              recap.discoveries.artists ? `, from ${formatCount(recap.discoveries.artists, 'new artist')}` : ''
            }.`
          : '',
      ].filter(Boolean)}
    >
      {recap.discoveries.covers.length ? (
        <View style={styles.covers}>
          {recap.discoveries.covers.map((art) => (
            <Artwork key={art} artKey={art} size={56} rounded="md" />
          ))}
        </View>
      ) : null}
    </Card>,
  );

  cards.push(
    <Card
      key="persona"
      eyebrow={`Your ${whole} in one word`}
      title={recap.persona.title}
      lines={[
        recap.persona.blurb,
        recap.averageYear ? `The music you played was released around ${recap.averageYear}.` : '',
      ].filter(Boolean)}
    >
      {recap.topGenres.length ? (
        <View style={styles.chips}>
          {recap.topGenres.map((genre) => (
            <View key={genre.name} style={styles.chip}>
              <Text style={[type.caption, styles.chipText, face('medium')]}>{genre.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>,
  );

  cards.push(
    <Card
      key="outro"
      eyebrow="That was it"
      title={period.kind === 'year' ? `See you in ${Number(period.key) + 1}` : 'See you next month'}
      lines={[
        top ? `${top.name} carried this ${whole}.` : '',
        `${recap.minutes.toLocaleString()} minutes, ${formatCount(recap.songs, 'song')}, ${formatCount(recap.artists, 'artist')}.`,
        'Settings › Your recap opens this again any time.',
      ].filter(Boolean)}
    />,
  );

  return cards;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, face('semibold')]}>{value.toLocaleString()}</Text>
      <Text style={[type.caption, styles.statLabel]}>{label}</Text>
    </View>
  );
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
  bar: { borderRadius: 3, backgroundColor: RECAP.faint },
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
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: RECAP.faint },
  segmentOn: { backgroundColor: RECAP.ink },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { color: RECAP.muted },
  tap: { position: 'absolute', width: '28%' },
  tapLeft: { left: 0 },
  tapRight: { right: 0 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl },
  bottomRow: { flexDirection: 'row', gap: spacing.md },
  solid: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: RECAP.button,
  },
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
