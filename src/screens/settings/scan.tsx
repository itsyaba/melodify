import { useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/icon-button';
import { IconTile } from '@/components/icon-tile';
import { ImportCard, ImportTiles, InfoCard, Meter, ScanCard } from '@/components/import-cards';
import { ListRow } from '@/components/list-row';
import { confirm } from '@/components/menus';
import { toast } from '@/components/toast';
import { libraryOverview, type LibraryOverview } from '@/db/tracks';
import { useLibraryJobs } from '@/hooks/use-library-jobs';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { canReadTags } from '@/scan/read-tags';
import { scanLibrary, tagCoverage, type TagCoverage } from '@/scan/scanner';
import { ACCENTS, currentTheme, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatBytes, formatCount, formatTotalTime } from '@/utils/format';
import { isLiveContainerGuest } from '@/utils/quick-actions';

const BAR = 44;
/** How far the wash reaches above the page, so pulling it down never shows its edge. */
const OVERSCROLL = 600;
/** How far down the page the wash fades out. */
const FADE = 380;

/**
 * Import and scan, as a Spotify page: the accent washes down from the top behind the library's
 * size and the Scan now pill, with a bar that turns solid and shows the title once the page
 * scrolls. Below, the two ways to add music as Browse-style tiles, what is running now, and how
 * complete the tags are. It draws its own header, the stack's being off.
 */
export function ScanScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const db = useSQLiteContext();
  const { progress, imported, scanning, busy, runImport, scan } = useLibraryJobs();
  const { data: overview } = useLibraryQuery(libraryOverview);
  const { data: coverage } = useLibraryQuery(tagCoverage);

  // The accent at the same strength in the bar and at the top of the wash, so the two meet unseen.
  const wash = `${ACCENTS[currentTheme().accent].hex}${scheme === 'dark' ? '8c' : '59'}`;
  const gradient = useMemo(
    () => ({
      experimental_backgroundImage: [
        {
          type: 'linear-gradient' as const,
          direction: 'to bottom',
          colorStops: [
            { color: wash, positions: ['0%'] },
            { color: wash, positions: [`${Math.round((OVERSCROLL / (OVERSCROLL + FADE)) * 100)}%`] },
            { color: `${wash.slice(0, 7)}00`, positions: ['100%'] },
          ],
        },
      ],
    }),
    [wash],
  );

  const scrollY = useRef(new Animated.Value(0)).current;
  const washOpacity = scrollY.interpolate({ inputRange: [0, 120], outputRange: [1, 0], extrapolate: 'clamp' });
  const titleOpacity = scrollY.interpolate({ inputRange: [90, 150], outputRange: [0, 1], extrapolate: 'clamp' });

  const rereadAll = async () => {
    if (busy) {
      toast.show('Wait for the running scan or import to finish');
      return;
    }
    const ok = await confirm(
      'Read every song’s tags again?',
      'Scans the folder, then reads the tags and artwork of every song, not only new and changed ones. It takes a while on a big library.',
      'Read again',
    );
    if (ok) void scanLibrary(db, { rereadAll: true });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + BAR }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: wash, opacity: washOpacity }]} />
        <Animated.View pointerEvents="none" style={[styles.barEdge, { opacity: titleOpacity }]} />
        <View style={styles.barSide}>
          <IconButton name="chevron.left" onPress={() => router.back()} accessibilityLabel="Back" />
        </View>
        <Animated.Text
          numberOfLines={1}
          accessibilityRole="header"
          style={[type.headline, styles.barTitle, { opacity: titleOpacity }]}
        >
          Import and scan
        </Animated.Text>
        <View style={styles.barSide} />
      </View>

      <Animated.ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View pointerEvents="none" style={[styles.wash, gradient]} />

        <Hero overview={overview} />
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={scan}
            accessibilityRole="button"
            style={({ pressed }) => [styles.scan, (pressed || busy) && styles.dimmed]}
          >
            {scanning ? (
              <ActivityIndicator color={colors.onTint} />
            ) : (
              <SymbolView name="arrow.clockwise" size={17} tintColor={colors.onTint} weight="bold" />
            )}
            <Text style={[type.headline, styles.scanLabel]}>{scanning ? 'Scanning…' : 'Scan now'}</Text>
          </Pressable>
        </View>

        {imported || progress ? (
          <View style={styles.cards}>
            {imported ? <ImportCard progress={imported} /> : null}
            {progress ? <ScanCard progress={progress} /> : null}
          </View>
        ) : null}

        <Text style={[type.title, styles.heading]}>Add music</Text>
        <ImportTiles disabled={busy} onImport={runImport} />
        <Text style={[type.footnote, styles.note]}>
          From On My iPhone, iCloud Drive, a USB drive or a server. Importing a folder again copies only what is new.
          Download an iCloud Drive folder in Files first.
        </Text>
        <View style={styles.cards}>
          {isLiveContainerGuest() ? (
            <InfoCard icon="lightbulb.fill" title="Using LiveContainer?">
              The picker’s Open button does nothing until Fix File Picker is on for Melodify: hold its card in
              LiveContainer, then Settings › Fixes. Not the legacy one, which cannot open folders.
            </InfoCard>
          ) : null}
          <InfoCard icon="cable.connector" title="Copy over USB">
            Faster for a whole library: copy music into the Melodify folder with a computer, then tap Scan now.
          </InfoCard>
        </View>

        {coverage && coverage.songs > 0 ? (
          <>
            <Text style={[type.title, styles.heading]}>Library health</Text>
            {!canReadTags() ? (
              <View style={styles.cards}>
                <InfoCard icon="exclamationmark.triangle.fill" title="No tag reader" tint={colors.destructive}>
                  This build cannot read tags, so titles come from file names. Install a newer build.
                </InfoCard>
              </View>
            ) : null}
            <Health coverage={coverage} />
            {canReadTags() ? (
              <ListRow
                title="Read all tags again"
                subtitle="Tags and artwork of every song, not only new ones"
                leading={<IconTile name="arrow.triangle.2.circlepath" size={40} />}
                onPress={() => void rereadAll()}
              />
            ) : null}
          </>
        ) : null}
      </Animated.ScrollView>
    </View>
  );
}

function Hero({ overview }: { overview: LibraryOverview | undefined }) {
  const styles = useStyles();
  const songs = overview?.songs ?? 0;
  const meta = overview
    ? songs
      ? [
          formatCount(overview.albums, 'album'),
          formatCount(overview.artists, 'artist'),
          overview.durationMs ? formatTotalTime(overview.durationMs) : '',
          overview.bytes ? formatBytes(overview.bytes) : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Import a folder or some songs below to get started.'
    : ' ';
  return (
    <View style={styles.hero}>
      <Text style={[type.caption, styles.eyebrow]}>IMPORT AND SCAN</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.count}>
        {overview ? (songs ? `${songs.toLocaleString()} ${songs === 1 ? 'song' : 'songs'}` : 'No music yet') : ' '}
      </Text>
      <Text style={[type.subhead, styles.meta]}>{meta}</Text>
    </View>
  );
}

function Health({ coverage: c }: { coverage: TagCoverage }) {
  const styles = useStyles();
  const rows: { icon: SFSymbol; title: string; missing: number; note: string }[] = [
    { icon: 'tag.fill', title: 'Tags', missing: c.untagged, note: `${c.untagged.toLocaleString()} not read yet` },
    { icon: 'clock.fill', title: 'Lengths', missing: c.noDuration, note: `${c.noDuration.toLocaleString()} unknown` },
    { icon: 'photo.fill', title: 'Artwork', missing: c.noArt, note: `${c.noArt.toLocaleString()} without` },
  ];
  return (
    <View style={styles.health}>
      {rows.map((r) => (
        <HealthRow key={r.title} icon={r.icon} title={r.title} have={c.songs - r.missing} total={c.songs} note={r.note} />
      ))}
    </View>
  );
}

function HealthRow({ icon, title, have, total, note }: { icon: SFSymbol; title: string; have: number; total: number; note: string }) {
  const styles = useStyles();
  const colors = useTheme();
  const complete = have >= total;
  return (
    <View style={styles.healthRow} accessible accessibilityLabel={`${title}: ${have} of ${total}`}>
      <IconTile name={icon} size={40} />
      <View style={styles.healthText}>
        <View style={styles.healthLine}>
          <Text style={[type.body, styles.cardTitle]}>{title}</Text>
          {complete ? (
            <View style={styles.healthDone}>
              <SymbolView name="checkmark.circle.fill" size={15} tintColor={colors.tint} />
              <Text style={[type.footnote, styles.secondary]}>Complete</Text>
            </View>
          ) : (
            <Text style={[type.footnote, styles.secondary]}>{note}</Text>
          )}
        </View>
        <Meter value={total ? have / total : 0} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, backgroundColor: colors.background, zIndex: 1 },
  barEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  barSide: { width: BAR, alignItems: 'center' },
  barTitle: { flex: 1, textAlign: 'center', color: colors.label },
  content: { paddingBottom: spacing.xxl },
  wash: { position: 'absolute', left: 0, right: 0, top: -OVERSCROLL, height: OVERSCROLL + FADE },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  eyebrow: { color: colors.label, fontWeight: '700', letterSpacing: 1.2, opacity: 0.8 },
  count: { color: colors.label, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  meta: { color: colors.secondaryLabel, fontWeight: '600' },
  actions: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
  },
  scanLabel: { color: colors.onTint, fontWeight: '700' },
  dimmed: { opacity: 0.5 },
  heading: { color: colors.label, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cards: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  cardTitle: { color: colors.label, fontWeight: '600' },
  secondary: { color: colors.secondaryLabel },
  health: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  healthText: { flex: 1, gap: spacing.sm },
  healthLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  healthDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
