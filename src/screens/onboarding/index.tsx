import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickFile } from '@/backup';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { toast } from '@/components/toast';
import { MAX_QUEUES } from '@/db/queues';
import { libraryOverview, type LibraryOverview } from '@/db/tracks';
import { useLibraryJobs } from '@/hooks/use-library-jobs';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { setPref, usePrefs } from '@/prefs';
import { IMPORT_DIR } from '@/scan/import-plan';
import { importFolder, importSongs, isImporting } from '@/scan/import';
import { ACCENTS, availableAccents, currentTheme, ONBOARDING, spacing, useTheme } from '@/theme';
import type { ImportProgress, ScanProgress } from '@/utils/events';
import { formatCount } from '@/utils/format';
import { isLiveContainerGuest } from '@/utils/quick-actions';
import { useStorageAccess } from '@/utils/storage-access';
import {
  ART_H,
  ART_W,
  FeaturesArt,
  LockScreenArt,
  PlayerArt,
  ThemesArt,
  useReduceMotion,
  VALLEY,
  type Status,
} from './art';
import { face } from './fonts';
import { finishOnboarding, isOnboardingOpen, subscribeOnboarding } from './state';

const PAGES = 4;
const DOT = 6;
const DOT_GAP = 7;
const android = Platform.OS === 'android';

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
    const fade = Animated.timing(opacity, { toValue: open ? 1 : 0, duration: 300, useNativeDriver: true });
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

/** The accent as #rrggbb, its bright variant: the pages are always dark. */
function useAccentHex(): string {
  useTheme(); // Re-render when the accent changes.
  return ACCENTS[currentTheme().accent].dark;
}

/**
 * A photo with the name on it, then four dark pages, each a picture, a title and a line, swiped
 * or stepped through with the button: what Melodify is, what it does, adding music (the real
 * import, with its progress on the picture), and the theme and accent, which apply as tapped.
 * Skip, or the last page's button, closes them for good.
 */
function Onboarding() {
  const { width } = useWindowDimensions();
  const [intro, setIntro] = useState(true);
  const introOpacity = useRef(new Animated.Value(1)).current;
  const pager = useRef<ScrollView>(null);
  const pageRef = useRef(0);
  const introRef = useRef(true);

  const showIntro = (show: boolean) => {
    introRef.current = show;
    if (show) setIntro(true);
    Animated.timing(introOpacity, { toValue: show ? 1 : 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(
      ({ finished }) => finished && !show && setIntro(false),
    );
  };

  // Android's back steps back a page, then to the photo, then closes the pages, rather than
  // reaching the app underneath.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (introRef.current) finishOnboarding();
      else if (pageRef.current === 0) showIntro(true);
      else pager.current?.scrollTo({ x: (pageRef.current - 1) * width, animated: true });
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Pages pager={pager} pageRef={pageRef} />
      {intro ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: introOpacity }]} pointerEvents={introRef.current ? 'auto' : 'none'}>
          <Intro onStart={() => showIntro(false)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

// ---- The photo

function Intro({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const still = useReduceMotion();
  const zoom = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The photo settles in slowly as the name rises into place.
    Animated.parallel([
      Animated.timing(zoom, { toValue: 1, duration: still ? 0 : 7000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: still ? 0 : 1100, delay: still ? 0 : 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [zoom, rise, still]);

  return (
    <View style={styles.intro}>
      <Animated.Image
        source={VALLEY}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        // Sized outright: stretched by its edges alone, Android draws it at the file's own size.
        style={[styles.photo, { width, height, transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1] }) }] }]}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.introShade]} />
      <Animated.View
        style={[
          styles.brand,
          { top: height * 0.26, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.wordmark, face('semibold')]}>Melodify</Text>
        <Text style={[styles.tagline, face('regular')]}>Your music, offline.</Text>
      </Animated.View>
      <View style={[styles.introFoot, { paddingBottom: insets.bottom + spacing.lg }]}>
        <PillButton label="Get started" onPress={onStart} />
      </View>
    </View>
  );
}

// ---- The pages

function Pages({ pager, pageRef }: { pager: RefObject<ScrollView | null>; pageRef: RefObject<number> }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hex = useAccentHex();
  const still = useReduceMotion();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const { data: overview } = useLibraryQuery(libraryOverview);
  const last = page === PAGES - 1;

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
    [scrollX, width, pageRef],
  );

  // A rotation changes the width; keep the same page in view.
  useEffect(() => {
    pager.current?.scrollTo({ x: pageRef.current * width, animated: false });
  }, [pager, pageRef, width]);

  const next = () => {
    if (last) finishOnboarding();
    else pager.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  // The picture lags behind its page and fades, so it seems to sit further back than the words.
  const depth = useMemo(
    () =>
      Array.from({ length: PAGES }, (_, i) => {
        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
        return {
          opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0] }),
          transform: [{ translateX: scrollX.interpolate({ inputRange, outputRange: [-width * 0.35, 0, width * 0.35] }) }],
        };
      }),
    [scrollX, width],
  );
  const pageStyle = [styles.page, { width, paddingTop: insets.top + 56 }];

  return (
    <View style={styles.root}>
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
        <View style={pageStyle}>
          <WhatItIs hex={hex} depth={depth[0]} />
        </View>
        <View style={pageStyle}>
          <WhatItDoes hex={hex} still={still} depth={depth[1]} />
        </View>
        <View style={pageStyle}>
          <AddMusic hex={hex} overview={overview} depth={depth[2]} />
        </View>
        <View style={pageStyle}>
          <MakeItYours hex={hex} songs={overview?.songs ?? 0} depth={depth[3]} />
        </View>
      </Animated.ScrollView>

      {!last ? (
        <Pressable
          onPress={finishOnboarding}
          hitSlop={spacing.md}
          accessibilityRole="button"
          accessibilityHint="Closes the welcome pages. Settings opens them again."
          style={({ pressed }) => [styles.skip, { top: insets.top + spacing.sm }, pressed && styles.pressed]}
        >
          <Text style={[styles.skipLabel, face('medium')]}>Skip</Text>
        </Pressable>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Dots scrollX={scrollX} width={width} page={page} hex={hex} />
        {last ? (
          <PillButton label="Start Melodify" hex={hex} onPress={next} />
        ) : (
          <PillButton label="Continue" onPress={next} />
        )}
      </View>
    </View>
  );
}

type Depth = Animated.WithAnimatedValue<StyleProp<ViewStyle>>;

/**
 * A page's picture, scaled to fit the room above its words, then the words. Children go under
 * the line: the page's own buttons and links. A picture is hidden from screen readers unless it
 * can be tapped, as the themes can.
 */
function Page({
  art,
  depth,
  title,
  line,
  interactive = false,
  children,
}: {
  art: ReactNode;
  depth: Depth;
  title: string;
  line: string;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const scale = room ? Math.min(1.15, room.width / ART_W, room.height / ART_H) : 1;
  return (
    <>
      <Animated.View
        style={[styles.room, depth]}
        accessibilityElementsHidden={!interactive}
        importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
        onLayout={(e) => setRoom(e.nativeEvent.layout)}
      >
        {room ? <View style={{ width: ART_W, height: ART_H, transform: [{ scale }] }}>{art}</View> : null}
      </Animated.View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, face('medium')]}>{title}</Text>
        <Text style={[styles.line, face('regular')]}>{line}</Text>
        {children}
      </View>
    </>
  );
}

function WhatItIs({ hex, depth }: { hex: string; depth: Depth }) {
  return (
    <Page
      depth={depth}
      art={<PlayerArt hex={hex} />}
      title="Melodify"
      line={`Plays the songs on your ${android ? 'phone' : 'iPhone'}. No account, no streaming, no ads.`}
    />
  );
}

function WhatItDoes({ hex, still, depth }: { hex: string; still: boolean; depth: Depth }) {
  return (
    <Page
      depth={depth}
      art={<FeaturesArt hex={hex} still={still} />}
      title="Built like Musicolet"
      line={`Up to ${MAX_QUEUES} queues, folders, bookmarks, synced lyrics, an equalizer and a tag editor.`}
    />
  );
}

// ---- Adding music

/** What the lock screen's notification says: the import or scan running, or the library. */
function statusOf(overview: LibraryOverview | undefined, imported: ImportProgress | null, progress: ScanProgress | null): Status {
  if (imported && isImporting(imported)) {
    const what = imported.folder === IMPORT_DIR ? 'your songs' : imported.folder;
    return imported.phase === 'finding'
      ? { title: `Looking through ${what}`, body: 'Finding songs…', value: null }
      : {
          title: `Importing ${what}`,
          body: `${imported.copied.toLocaleString()} of ${formatCount(imported.total, 'song')}`,
          value: imported.total ? imported.copied / imported.total : null,
        };
  }
  switch (progress?.phase) {
    case 'walking':
      return { title: 'Looking for music', body: `${formatCount(progress.seen, 'file')} found`, value: null };
    case 'indexing':
      return { title: 'Updating the library', body: formatCount(progress.seen, 'file'), value: null };
    case 'tagging':
      return {
        title: 'Reading tags and artwork',
        body: progress.toTag ? `${progress.tagged.toLocaleString()} of ${formatCount(progress.toTag, 'song')}` : formatCount(progress.tagged, 'song'),
        value: progress.toTag ? progress.tagged / progress.toTag : null,
      };
    case 'error':
      return { title: 'The scan stopped', body: progress.message ?? 'Try scanning again.', value: null };
  }
  if (imported?.phase === 'error') return { title: 'The import stopped', body: imported.message ?? 'Try importing again.', value: null };
  const songs = overview?.songs ?? 0;
  if (songs) {
    return {
      title: `${formatCount(songs, 'song')} ready to play`,
      body: [formatCount(overview?.albums ?? 0, 'album'), formatCount(overview?.artists ?? 0, 'artist')].join(' · '),
      value: null,
    };
  }
  return {
    title: 'No music yet',
    body: android ? 'Allow access below, and Melodify finds your songs.' : 'Import a folder or a few songs below to get started.',
    value: null,
  };
}

function AddMusic({ hex, overview, depth }: { hex: string; overview: LibraryOverview | undefined; depth: Depth }) {
  const { progress, imported, scanning, busy, runImport, scan } = useLibraryJobs();
  const status = statusOf(overview, imported, progress);
  return (
    <Page
      depth={depth}
      art={<LockScreenArt hex={hex} status={status} />}
      title="Add your music"
      line={
        android
          ? 'Melodify plays the music already on this phone. Give it access, and it finds your songs.'
          : 'Copy songs in from Files, iCloud Drive or a USB drive. Folders keep their covers and lyrics.'
      }
    >
      {android ? (
        <AndroidAccess busy={busy} scanning={scanning} onScan={scan} />
      ) : (
        <>
          <View style={styles.actions}>
            <GlassButton icon="folder.fill" label="Import folder" disabled={busy} onPress={() => runImport(importFolder)} />
            <GlassButton icon="music.note" label="Import songs" disabled={busy} onPress={() => runImport(importSongs)} />
          </View>
          <Link disabled={busy} onPress={scan} lead="Copied over USB?" label={scanning ? 'Scanning…' : 'Scan the folder'} hex={hex} />
          {isLiveContainerGuest() ? (
            <Text style={[styles.hint, face('regular')]}>
              In LiveContainer, turn on Fix File Picker for Melodify first, or the picker’s Open does nothing.
            </Text>
          ) : null}
        </>
      )}
    </Page>
  );
}

/**
 * Android's steps in place of the import: the music is already on the phone, so it is letting
 * Melodify at it, then scanning. All files makes everything work; Music only plays songs, but
 * lyrics files, tag editing and deleting need All files.
 */
function AndroidAccess({ busy, scanning, onScan }: { busy: boolean; scanning: boolean; onScan: () => void }) {
  const [access, request] = useStorageAccess();
  const askThenScan = async (kind: 'full' | 'read') => {
    if ((await request(kind)) !== 'none') onScan();
  };
  if (access === 'full') {
    return (
      <View style={styles.actions}>
        <GlassButton icon="arrow.clockwise" label={scanning ? 'Scanning…' : 'Scan the phone'} disabled={busy} onPress={onScan} />
      </View>
    );
  }
  return (
    <>
      <View style={styles.actions}>
        <GlassButton icon="folder.fill" label="Allow all files" disabled={busy} onPress={() => void askThenScan('full')} />
        <GlassButton
          icon="music.note"
          label={access === 'read' ? 'Music only: on' : 'Music only'}
          disabled={busy || access === 'read'}
          onPress={() => void askThenScan('read')}
        />
      </View>
      <Text style={[styles.hint, face('regular')]}>All files also lets Melodify save lyrics, edit tags and keep backups.</Text>
    </>
  );
}

// ---- Theme and accent

function MakeItYours({ hex, songs, depth }: { hex: string; songs: number; depth: Depth }) {
  const router = useRouter();
  const prefs = usePrefs();

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
    <Page
      depth={depth}
      interactive
      art={<ThemesArt hex={hex} theme={prefs.theme} onPick={(t) => setPref('theme', t)} />}
      title="Make it yours"
      line="Pick a theme and an accent. Change them any time in Settings."
    >
      <View style={styles.accents} accessibilityRole="radiogroup">
        {availableAccents().map((a) => {
          const selected = prefs.accent === a;
          return (
            <Pressable
              key={a}
              onPress={() => setPref('accent', a)}
              hitSlop={4}
              accessibilityRole="radio"
              accessibilityLabel={ACCENTS[a].label}
              accessibilityState={{ selected }}
              style={[styles.accentRing, selected && styles.accentRingOn]}
            >
              <View style={[styles.accentDot, { backgroundColor: ACCENTS[a].dark }]} />
            </Pressable>
          );
        })}
      </View>
      <Link
        onPress={() => void restore()}
        lead="Coming from Musicolet?"
        label="Restore a backup"
        hex={hex}
        hint={songs ? undefined : 'Add your music first, so its songs can be found.'}
      />
    </Page>
  );
}

// ---- Controls

function PillButton({ label, onPress, hex }: { label: string; onPress: () => void; hex?: string }) {
  // With a hex it is the last page's: the accent, lit from one side.
  const lit = hex
    ? {
        backgroundColor: hex,
        experimental_backgroundImage: [
          {
            type: 'linear-gradient' as const,
            direction: 'to right',
            colorStops: [
              { color: `${hex}00`, positions: ['0%'] },
              { color: ONBOARDING.highlight, positions: ['100%'] },
            ],
          },
        ],
        boxShadow: `0px 8px 28px ${hex}66`,
      }
    : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.pill, lit, pressed && styles.pressed]}>
      <Text style={[styles.pillLabel, face('medium'), hex ? { color: ONBOARDING.ink } : null]}>{label}</Text>
    </Pressable>
  );
}

function GlassButton({ icon, label, disabled, onPress }: { icon: SFSymbol; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.glass, (pressed || disabled) && styles.pressed]}
    >
      <SymbolView name={icon} size={17} tintColor={ONBOARDING.ink} />
      <Text numberOfLines={1} style={[styles.glassLabel, face('medium')]}>{label}</Text>
    </Pressable>
  );
}

function Link({
  lead,
  label,
  hint,
  hex,
  disabled,
  onPress,
}: {
  lead: string;
  label: string;
  hint?: string;
  hex: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lead} ${label}`}
      accessibilityHint={hint}
      hitSlop={spacing.sm}
      style={({ pressed }) => [styles.link, (pressed || disabled) && styles.pressed]}
    >
      <Text style={[styles.linkText, face('regular')]}>
        {lead} <Text style={[face('medium'), { color: hex }]}>{label}</Text>
      </Text>
      {hint ? <Text style={[styles.hint, face('regular')]}>{hint}</Text> : null}
    </Pressable>
  );
}

/** A dot per page, and one in the accent that slides along with the swipe. */
function Dots({ scrollX, width, page, hex }: { scrollX: Animated.Value; width: number; page: number; hex: string }) {
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
      <Animated.View style={[styles.dot, styles.dotOn, { backgroundColor: hex, transform: [{ translateX }] }]} />
    </View>
  );
}

// Every colour here is an ONBOARDING token, the same in every theme, so a plain sheet is right.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ONBOARDING.background },
  pressed: { opacity: 0.55 },

  intro: { flex: 1, backgroundColor: ONBOARDING.background, overflow: 'hidden' },
  photo: { position: 'absolute', left: 0, top: 0 },
  introShade: {
    experimental_backgroundImage: [
      {
        type: 'linear-gradient',
        direction: 'to bottom',
        colorStops: [
          { color: ONBOARDING.photoShade, positions: ['0%'] },
          { color: ONBOARDING.clear, positions: ['48%'] },
          { color: ONBOARDING.clear, positions: ['66%'] },
          { color: ONBOARDING.photoShade, positions: ['100%'] },
        ],
      },
    ],
  },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: spacing.xs },
  wordmark: {
    color: ONBOARDING.ink,
    fontSize: 58,
    lineHeight: 66,
    letterSpacing: -1.2,
    textShadowColor: ONBOARDING.photoShade,
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 2 },
  },
  tagline: {
    color: ONBOARDING.ink,
    opacity: 0.85,
    fontSize: 17,
    textShadowColor: ONBOARDING.photoShade,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 1 },
  },
  introFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg },

  pager: { flex: 1 },
  page: { flex: 1, paddingHorizontal: spacing.lg },
  room: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xl + 6, gap: spacing.sm },
  title: { color: ONBOARDING.ink, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, textAlign: 'center' },
  line: { color: ONBOARDING.muted, fontSize: 16, lineHeight: 22, textAlign: 'center', maxWidth: 330 },
  hint: { color: ONBOARDING.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320, opacity: 0.85 },

  actions: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.md },
  glass: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 999,
    backgroundColor: ONBOARDING.glass,
    borderWidth: 1,
    borderColor: ONBOARDING.glassEdge,
  },
  glassLabel: { color: ONBOARDING.ink, fontSize: 15 },
  link: { alignItems: 'center', gap: 2, marginTop: spacing.xs },
  linkText: { color: ONBOARDING.muted, fontSize: 14, textAlign: 'center' },

  // One row, even with Android's thirteenth (the wallpaper's) on a narrow phone.
  accents: { flexDirection: 'row', justifyContent: 'center', gap: 3, marginTop: spacing.md },
  accentRing: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accentRingOn: { borderWidth: 2, borderColor: ONBOARDING.ink },
  accentDot: { width: 16, height: 16, borderRadius: 8 },

  skip: {
    position: 'absolute',
    right: spacing.lg,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: ONBOARDING.glass,
    borderWidth: 1,
    borderColor: ONBOARDING.glassEdge,
  },
  skipLabel: { color: ONBOARDING.ink, fontSize: 13 },

  footer: { paddingHorizontal: spacing.lg, gap: spacing.xl + 4, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: DOT_GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: ONBOARDING.faint },
  dotOn: { position: 'absolute', left: 0, top: 0 },
  pill: {
    alignSelf: 'stretch',
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING.button,
  },
  pillLabel: { color: ONBOARDING.buttonInk, fontSize: 17 },
});

