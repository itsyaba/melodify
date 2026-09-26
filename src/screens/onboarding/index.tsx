import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickFile } from '@/backup';
import { IconTile } from '@/components/icon-tile';
import { ImportCard, ImportTiles, InfoCard, ScanCard } from '@/components/import-cards';
import { toast } from '@/components/toast';
import { MAX_QUEUES } from '@/db/queues';
import { libraryOverview } from '@/db/tracks';
import { useLibraryJobs } from '@/hooks/use-library-jobs';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { setPref, usePrefs } from '@/prefs';
import {
  accentColor,
  ACCENTS,
  BROWSE_TILE_COLORS,
  currentTheme,
  makeStyles,
  radius,
  spacing,
  THEME_SWATCHES,
  type,
  useTheme,
  type AccentName,
  type ThemeName,
} from '@/theme';
import { isLiveContainerGuest } from '@/utils/quick-actions';
import { finishOnboarding, isOnboardingOpen, subscribeOnboarding } from './state';

const PAGES = 4;
const BAR = 44;
/** How far down from the top the accent wash fades out. */
const WASH = 420;
const DOT = 8;
const DOT_GAP = 8;

/**
 * The welcome pages, over the whole app: mounted once in the root layout, next to the toasts.
 * They fade in when Settings opens them and out when they close; on the first launch they are
 * simply there, so the app underneath never shows first.
 */
export function OnboardingHost() {
  const open = useSyncExternalStore(subscribeOnboarding, isOnboardingOpen, isOnboardingOpen);
  const [mounted, setMounted] = useState(open);
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setMounted(true);
    const fade = Animated.timing(opacity, { toValue: open ? 1 : 0, duration: 250, useNativeDriver: true });
    fade.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => fade.stop();
  }, [open, opacity]);

  if (!mounted) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={open ? 'auto' : 'none'} accessibilityViewIsModal>
      <Onboarding />
    </Animated.View>
  );
}

/**
 * Four pages, swiped or stepped through with the button: what Melodify is, what it does, adding
 * music (the real import tiles and scan, with their progress), and the theme and accent, which
 * apply as they are tapped. Skip, or the last page's button, closes them for good.
 */
function Onboarding() {
  const styles = useStyles();
  useTheme(); // Re-render when the accent changes, which the wash is drawn in.
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pageRef = useRef(0);
  const [page, setPage] = useState(0);
  const { data: overview } = useLibraryQuery(libraryOverview);
  const songs = overview?.songs ?? 0;
  const last = page === PAGES - 1;

  // A rotation changes the page width; keep the same page in view.
  useEffect(() => {
    pager.current?.scrollTo({ x: pageRef.current * width, animated: false });
  }, [width]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const p = Math.min(PAGES - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
          if (p !== pageRef.current) {
            pageRef.current = p;
            setPage(p);
          }
        },
      }),
    [scrollX, width],
  );

  const next = () => {
    if (last) finishOnboarding();
    else pager.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  // The accent, as strong as Import and scan's, fading to nothing down the page.
  const wash = `${ACCENTS[currentTheme().accent].hex}${scheme === 'dark' ? '8c' : '59'}`;
  const gradient = useMemo(
    () => ({
      experimental_backgroundImage: [
        {
          type: 'linear-gradient' as const,
          direction: 'to bottom',
          colorStops: [
            { color: wash, positions: ['0%'] },
            { color: `${wash.slice(0, 7)}00`, positions: ['100%'] },
          ],
        },
      ],
    }),
    [wash],
  );

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={[styles.wash, { height: insets.top + WASH }, gradient]} />
      <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + BAR }]}>
        {!last ? (
          <Pressable
            onPress={finishOnboarding}
            hitSlop={spacing.md}
            accessibilityRole="button"
            accessibilityHint="Closes the welcome pages. Settings opens them again."
            style={({ pressed }) => pressed && styles.dimmed}
          >
            <Text style={[type.body, styles.skip]}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.pager}
      >
        <Page width={width}>
          <Welcome />
        </Page>
        <Page width={width}>
          <Features width={width} />
        </Page>
        <Page width={width}>
          <AddMusic songs={songs} />
        </Page>
        <Page width={width}>
          <MakeItYours width={width} songs={songs} />
        </Page>
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Dots scrollX={scrollX} width={width} page={page} />
        <Pressable onPress={next} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.dimmed]}>
          <Text style={[type.headline, styles.primaryLabel]}>{last ? (songs ? 'Start listening' : 'Done') : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Page({ width, children }: { width: number; children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.heading}>
      <Text style={[type.caption, styles.eyebrow]}>{eyebrow}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {children ? <Text style={[type.body, styles.lead]}>{children}</Text> : null}
    </View>
  );
}

// ---- 1. Welcome

/** Three covers that fan out as the page opens, in the import tiles' colours. */
const FAN: { icon: SFSymbol; color: string; x: number; y: number; rotate: number }[] = [
  { icon: 'headphones', color: BROWSE_TILE_COLORS[6], x: -78, y: 18, rotate: -14 },
  { icon: 'waveform', color: BROWSE_TILE_COLORS[3], x: 78, y: 18, rotate: 14 },
  { icon: 'music.note', color: BROWSE_TILE_COLORS[0], x: 0, y: 0, rotate: 0 },
];

function Fan() {
  const styles = useStyles();
  const colors = useTheme();
  const spread = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(spread, { toValue: 1, delay: 150, friction: 6, tension: 40, useNativeDriver: true }).start();
  }, [spread]);
  return (
    <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {FAN.map((t) => (
        <Animated.View
          key={t.icon}
          style={[
            styles.fanTile,
            {
              backgroundColor: t.color,
              transform: [
                { translateX: spread.interpolate({ inputRange: [0, 1], outputRange: [0, t.x] }) },
                { translateY: spread.interpolate({ inputRange: [0, 1], outputRange: [0, t.y] }) },
                { rotate: spread.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${t.rotate}deg`] }) },
              ],
            },
          ]}
        >
          <SymbolView name={t.icon} size={56} tintColor={colors.onTint} />
        </Animated.View>
      ))}
    </View>
  );
}

function Welcome() {
  const styles = useStyles();
  return (
    <>
      <Fan />
      <Heading eyebrow="WELCOME TO MELODIFY" title="Your music, offline">
        Melodify plays the songs you keep on this iPhone. There is no account to make, nothing to stream and no ads.
      </Heading>
      <View style={styles.points}>
        <Point icon="wifi.slash" title="Works without a connection">
          Everything happens on the phone. Looking up lyrics is the one thing that goes online, and only when you tap it.
        </Point>
        <Point icon="hand.raised.fill" title="Nothing is tracked">
          No sign-in and no analytics. Your library, play counts and history stay here.
        </Point>
        <Point icon="square.stack.fill" title="Built after Musicolet">
          Its queues, folders, bookmarks and backups, made for iPhone.
        </Point>
      </View>
    </>
  );
}

function Point({ icon, title, children }: { icon: SFSymbol; title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.point} accessible>
      <IconTile name={icon} size={40} />
      <View style={styles.pointText}>
        <Text style={[type.headline, styles.label]}>{title}</Text>
        <Text style={[type.subhead, styles.secondary]}>{children}</Text>
      </View>
    </View>
  );
}

// ---- 2. What it does

const FEATURES: { icon: SFSymbol; title: string; subtitle: string; color: string }[] = [
  { icon: 'list.number', title: `Up to ${MAX_QUEUES} queues`, subtitle: 'Each one keeps its place', color: BROWSE_TILE_COLORS[6] },
  { icon: 'folder.fill', title: 'Folders', subtitle: 'Browse them the way you sorted them', color: BROWSE_TILE_COLORS[1] },
  { icon: 'bookmark.fill', title: 'Bookmarks', subtitle: 'Long tracks resume where you stopped', color: BROWSE_TILE_COLORS[5] },
  { icon: 'quote.bubble.fill', title: 'Synced lyrics', subtitle: 'From .lrc files and tags', color: BROWSE_TILE_COLORS[0] },
  { icon: 'slider.vertical.3', title: 'Equalizer', subtitle: 'Ten bands, speed and pitch', color: BROWSE_TILE_COLORS[8] },
  { icon: 'tag.fill', title: 'Tag editor', subtitle: 'Titles, artists and artwork', color: BROWSE_TILE_COLORS[4] },
];

function Features({ width }: { width: number }) {
  const styles = useStyles();
  const tileWidth = Math.floor((width - spacing.lg * 2 - spacing.md) / 2);
  return (
    <>
      <Heading eyebrow="WHAT IT DOES" title="More than play and pause">
        What Musicolet is loved for, and a few things more.
      </Heading>
      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View
            key={f.title}
            accessible
            accessibilityLabel={`${f.title}. ${f.subtitle}`}
            style={[styles.feature, { width: tileWidth, backgroundColor: f.color }]}
          >
            <Text numberOfLines={2} style={[type.headline, styles.featureTitle]}>{f.title}</Text>
            <Text numberOfLines={3} style={[type.footnote, styles.featureSubtitle]}>{f.subtitle}</Text>
            <View style={styles.tilted}>
              <FeatureIcon name={f.icon} />
            </View>
          </View>
        ))}
      </View>
      <Text style={[type.footnote, styles.note]}>
        And a sleep timer that fades out, A–B repeat, gapless playback, crossfade, ReplayGain, and backups Musicolet on
        Android can restore.
      </Text>
    </>
  );
}

function FeatureIcon({ name }: { name: SFSymbol }) {
  const colors = useTheme();
  return <SymbolView name={name} size={44} tintColor={colors.onTint} />;
}

// ---- 3. Add your music

function AddMusic({ songs }: { songs: number }) {
  const styles = useStyles();
  const colors = useTheme();
  const { progress, imported, scanning, busy, runImport, scan } = useLibraryJobs();
  const guest = isLiveContainerGuest();
  return (
    <>
      <Heading eyebrow="ADD YOUR MUSIC" title={songs ? `${songs.toLocaleString()} ${songs === 1 ? 'song' : 'songs'} ready` : 'Bring your music in'}>
        {songs
          ? 'They are in the library. Add more the same way, now or later from Settings › Import and scan.'
          : 'Melodify has its own music folder on this iPhone and plays what is in it. The quickest way in is the Files picker:'}
      </Heading>
      <ImportTiles disabled={busy} onImport={runImport} />
      <Text style={[type.footnote, styles.note]}>
        From On My iPhone, iCloud Drive, a USB drive or a server. A folder keeps its subfolders, covers and .lrc lyrics.
        Download an iCloud Drive folder in Files first.
      </Text>

      {imported || progress ? (
        <View style={styles.cards}>
          {imported ? <ImportCard progress={imported} /> : null}
          {progress ? <ScanCard progress={progress} /> : null}
        </View>
      ) : null}

      <View style={styles.cards}>
        {guest ? (
          <InfoCard icon="lightbulb.fill" title="Using LiveContainer?">
            The picker’s Open button does nothing until Fix File Picker is on for Melodify: hold its card in
            LiveContainer, then Settings › Fixes. Not the legacy one, which cannot open folders.
          </InfoCard>
        ) : null}
        <InfoCard icon="cable.connector" title="A whole library?">
          {guest
            ? 'Copying it over USB from a computer is faster. Melodify’s folder sits inside LiveContainer’s own; copy the music into it, then scan.'
            : 'Put it in Files › On My iPhone › Melodify, or copy it over USB from a computer, then scan the folder.'}
        </InfoCard>
        <Pressable
          disabled={busy}
          onPress={scan}
          accessibilityRole="button"
          style={({ pressed }) => [styles.outline, (pressed || busy) && styles.dimmed]}
        >
          {scanning ? (
            <ActivityIndicator color={colors.label} />
          ) : (
            <SymbolView name="arrow.clockwise" size={15} tintColor={colors.label} weight="bold" />
          )}
          <Text style={[type.subhead, styles.outlineLabel]}>{scanning ? 'Scanning…' : 'Scan the folder'}</Text>
        </Pressable>
      </View>
    </>
  );
}

// ---- 4. Make it yours

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'black', label: 'Black' },
];

function MakeItYours({ width, songs }: { width: number; songs: number }) {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const prefs = usePrefs();
  const swatchWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (THEMES.length - 1)) / THEMES.length);

  // The picker first: cancelling it leaves the pages where they were.
  const restore = async () => {
    try {
      const picked = await pickFile('backup');
      if (!picked) return;
      finishOnboarding();
      router.push({ pathname: '/settings/restore', params: { uri: picked.uri, name: picked.name } });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Heading eyebrow="MAKE IT YOURS" title="Pick a look">
        Both change as you tap. They are in Settings › Appearance, with the player layout and more.
      </Heading>

      <Text style={[type.footnote, styles.group]}>THEME</Text>
      <View style={styles.themes} accessibilityRole="radiogroup">
        {THEMES.map((t) => (
          <ThemeSwatch
            key={t.key}
            theme={t.key}
            label={t.label}
            width={swatchWidth}
            selected={prefs.theme === t.key}
            onPress={() => setPref('theme', t.key)}
          />
        ))}
      </View>

      <Text style={[type.footnote, styles.group]}>ACCENT COLOR</Text>
      <View style={styles.accents} accessibilityRole="radiogroup">
        {(Object.keys(ACCENTS) as AccentName[]).map((a) => {
          const selected = prefs.accent === a;
          return (
            <View key={a} style={styles.accentCell}>
              <Pressable
                onPress={() => setPref('accent', a)}
                accessibilityRole="radio"
                accessibilityLabel={ACCENTS[a].label}
                accessibilityState={{ selected }}
                style={[styles.accentRing, selected && { borderWidth: 2, borderColor: accentColor(a) }]}
              >
                <View style={[styles.accentDot, { backgroundColor: accentColor(a) }]}>
                  {selected ? <SymbolView name="checkmark" size={16} weight="bold" tintColor={colors.onTint} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.cards}>
        <View style={styles.restore}>
          <View style={styles.restoreHead}>
            <IconTile name="clock.arrow.circlepath" size={40} />
            <View style={styles.pointText}>
              <Text style={[type.headline, styles.label]}>Coming from Musicolet?</Text>
              <Text style={[type.subhead, styles.secondary]}>
                Restore its backup to bring back playlists, queues, favorites and play counts. A Melodify backup works too.
                {songs ? '' : ' Add your music first, so its songs can be found.'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => void restore()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.outline, pressed && styles.dimmed]}
          >
            <Text style={[type.subhead, styles.outlineLabel]}>Restore a backup</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** A tiny page in a theme's colours: a cover in the accent and two lines of text. */
function Mock({ theme }: { theme: keyof typeof THEME_SWATCHES }) {
  const styles = useStyles();
  const swatch = THEME_SWATCHES[theme];
  return (
    <View style={[styles.mock, { backgroundColor: swatch.page }]}>
      <View style={styles.mockArt} />
      <View style={[styles.mockLine, { backgroundColor: swatch.ink, width: '80%' }]} />
      <View style={[styles.mockLine, { backgroundColor: swatch.ink, width: '55%' }]} />
    </View>
  );
}

function ThemeSwatch({
  theme,
  label,
  width,
  selected,
  onPress,
}: {
  theme: ThemeName;
  label: string;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.themeChoice, { width }]}
    >
      <View style={[styles.frame, { height: Math.round(width * 1.3) }, selected && styles.frameOn]}>
        {theme === 'system' ? (
          <View style={styles.split}>
            <Mock theme="light" />
            <Mock theme="dark" />
          </View>
        ) : (
          <Mock theme={theme} />
        )}
      </View>
      <Text numberOfLines={1} style={[type.footnote, selected ? styles.themeLabelOn : styles.secondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---- Footer

/** A dot per page, and one in the accent that slides along with the swipe. */
function Dots({ scrollX, width, page }: { scrollX: Animated.Value; width: number; page: number }) {
  const styles = useStyles();
  const translateX = scrollX.interpolate({
    inputRange: [0, width * (PAGES - 1)],
    outputRange: [0, (DOT + DOT_GAP) * (PAGES - 1)],
    extrapolate: 'clamp',
  });
  return (
    <View style={styles.dots} accessible accessibilityLabel={`Page ${page + 1} of ${PAGES}`}>
      {Array.from({ length: PAGES }, (_, i) => (
        <View key={i} style={styles.dot} />
      ))}
      <Animated.View style={[styles.dot, styles.dotOn, { transform: [{ translateX }] }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  skip: { color: colors.label, fontWeight: '600' },
  dimmed: { opacity: 0.5 },
  pager: { flex: 1 },
  page: { paddingBottom: spacing.xl },
  heading: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  eyebrow: { color: colors.label, fontWeight: '700', letterSpacing: 1.2, opacity: 0.8 },
  title: { color: colors.label, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: colors.secondaryLabel },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  fan: { height: 210, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  fanTile: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  points: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pointText: { flex: 1, gap: 2 },

  features: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  feature: { height: 112, borderRadius: radius.sm, overflow: 'hidden', padding: spacing.md, gap: 2 },
  featureTitle: { color: colors.onTint, fontWeight: '800', maxWidth: '85%' },
  featureSubtitle: { color: colors.onTint, opacity: 0.85, maxWidth: '72%' },
  tilted: {
    position: 'absolute',
    right: -4,
    bottom: -6,
    transform: [{ rotate: '25deg' }],
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  cards: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.secondaryLabel,
  },
  outlineLabel: { color: colors.label, fontWeight: '700' },

  group: { color: colors.secondaryLabel, fontWeight: '600', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  themes: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  themeChoice: { alignItems: 'center', gap: spacing.sm },
  frame: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    overflow: 'hidden',
  },
  frameOn: { borderWidth: 2, borderColor: colors.tint },
  split: { flex: 1, flexDirection: 'row' },
  mock: { flex: 1, padding: spacing.sm, gap: 5 },
  mockArt: { width: '60%', aspectRatio: 1, borderRadius: 4, backgroundColor: colors.tint, marginBottom: 2 },
  mockLine: { height: 5, borderRadius: 2.5 },
  themeLabelOn: { color: colors.label, fontWeight: '700' },
  accents: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, paddingHorizontal: spacing.lg - spacing.xs },
  accentCell: { width: `${100 / 6}%`, alignItems: 'center' },
  accentRing: { width: 46, height: 46, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  accentDot: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  restore: { backgroundColor: colors.secondaryBackground, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  restoreHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: DOT_GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.fill },
  dotOn: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.tint },
  primary: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  primaryLabel: { color: colors.onTint, fontWeight: '700' },
}));
