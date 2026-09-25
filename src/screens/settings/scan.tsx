import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, useColorScheme, View, type ColorValue } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/icon-button';
import { IconTile } from '@/components/icon-tile';
import { ListRow } from '@/components/list-row';
import { confirm } from '@/components/menus';
import { toast } from '@/components/toast';
import { libraryOverview, type LibraryOverview } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { importFolder, importSongs, isImporting, lastImport, stopImport } from '@/scan/import';
import { IMPORT_DIR, importSummary } from '@/scan/import-plan';
import { canReadTags } from '@/scan/read-tags';
import { runningScan, scanLibrary, tagCoverage, type TagCoverage } from '@/scan/scanner';
import { ACCENTS, BROWSE_TILE_COLORS, currentTheme, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { libraryEvents, type ImportProgress, type ScanProgress } from '@/utils/events';
import { formatBytes, formatCount, formatTotalTime } from '@/utils/format';
import { isLiveContainerGuest } from '@/utils/quick-actions';

const BAR = 44;
/** How far the wash reaches above the page, so pulling it down never shows its edge. */
const OVERSCROLL = 600;
/** How far down the page the wash fades out. */
const FADE = 380;
/** Browse-tile fills, so the two import tiles look like Home's. */
const FOLDER_TILE = BROWSE_TILE_COLORS[1];
const SONGS_TILE = BROWSE_TILE_COLORS[2];

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
  const [progress, setProgress] = useState<ScanProgress | null>(runningScan);
  const [imported, setImported] = useState<ImportProgress | null>(lastImport);
  const scanning = progress != null && progress.phase !== 'done' && progress.phase !== 'error';
  const importing = isImporting(imported);
  const busy = scanning || importing;

  useEffect(() => libraryEvents.on('scanProgress', setProgress), []);
  useEffect(() => libraryEvents.on('importProgress', setImported), []);
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

  // The toast comes up even when the screen was left while the import ran.
  const runImport = async (job: typeof importSongs) => {
    try {
      const result = await job(db);
      if (result) toast.show(importSummary(result));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
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
            onPress={() => void scanLibrary(db)}
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
        <View style={styles.tiles}>
          <ImportTile
            color={FOLDER_TILE}
            icon="folder.fill"
            title="Import a folder"
            subtitle="Subfolders, covers and lyrics too"
            disabled={busy}
            onPress={() => void runImport(importFolder)}
          />
          <ImportTile
            color={SONGS_TILE}
            icon="music.note"
            title="Import songs"
            subtitle="Pick one or many"
            disabled={busy}
            onPress={() => void runImport(importSongs)}
          />
        </View>
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

function ImportTile({
  color,
  icon,
  title,
  subtitle,
  disabled,
  onPress,
}: {
  color: string;
  icon: SFSymbol;
  title: string;
  subtitle: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => [styles.tile, { backgroundColor: color }, (pressed || disabled) && styles.dimmed]}
    >
      <Text numberOfLines={2} style={[type.headline, styles.tileTitle]}>{title}</Text>
      <Text numberOfLines={2} style={[type.footnote, styles.tileSubtitle]}>{subtitle}</Text>
      <View style={styles.tilted}>
        <SymbolView name={icon} size={56} tintColor={colors.onTint} />
      </View>
    </Pressable>
  );
}

/** A card for something running or just finished: a coloured icon, what it is, then details. */
function StatusCard({
  icon,
  tint,
  title,
  subtitle,
  live,
  value,
  children,
}: {
  icon: SFSymbol;
  tint?: ColorValue;
  title: string;
  subtitle?: string;
  live: boolean;
  /** 0 to 1; null while there is no total to measure against. */
  value?: number | null;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.badge, { backgroundColor: tint ?? colors.tint }]}>
          <SymbolView name={icon} size={20} tintColor={colors.onTint} weight="semibold" />
        </View>
        <View style={styles.cardText}>
          <Text numberOfLines={2} style={[type.headline, styles.cardTitle]}>{title}</Text>
          {subtitle ? <Text numberOfLines={2} style={[type.footnote, styles.secondary]}>{subtitle}</Text> : null}
        </View>
        {live && value == null ? <ActivityIndicator color={colors.secondaryLabel} /> : null}
      </View>
      {live && value != null ? <Meter value={value} /> : null}
      {children}
    </View>
  );
}

function ImportCard({ progress: p }: { progress: ImportProgress }) {
  const styles = useStyles();
  const colors = useTheme();
  const what = p.folder === IMPORT_DIR ? 'songs' : p.folder;
  const cloudHint = p.notDownloaded ? (
    <Text style={[type.footnote, styles.secondary]}>Download the folder in the Files app, then import it again to add the rest.</Text>
  ) : null;

  if (!isImporting(p)) {
    const summary = importSummary(p);
    const bad = p.phase === 'error' || (p.failed > 0 && p.copied === 0);
    return (
      <StatusCard
        icon={bad ? 'exclamationmark.triangle.fill' : 'checkmark'}
        tint={bad ? colors.destructive : undefined}
        title={summary}
        subtitle={p.folder === IMPORT_DIR || bad ? undefined : `Into ${p.folder}`}
        live={false}
      >
        {p.message && p.message !== summary ? <Text style={[type.footnote, { color: colors.destructive }]}>{p.message}</Text> : null}
        {cloudHint}
      </StatusCard>
    );
  }

  const pills = [
    p.skipped ? `${p.skipped} already imported` : '',
    p.notDownloaded ? `${p.notDownloaded} not downloaded` : '',
    p.unsupported ? `${p.unsupported} not playable` : '',
    p.failed ? `${p.failed} failed` : '',
  ].filter(Boolean);
  return (
    <StatusCard
      icon={p.phase === 'finding' ? 'magnifyingglass' : 'square.and.arrow.down'}
      title={p.phase === 'finding' ? `Looking through ${what}` : `Importing ${what}`}
      subtitle={p.phase === 'finding' ? 'Finding songs…' : `${p.copied.toLocaleString()} of ${formatCount(p.total, 'song')}`}
      live
      value={p.phase === 'copying' && p.total ? p.copied / p.total : null}
    >
      {p.current ? <Text numberOfLines={1} style={[type.footnote, styles.secondary]}>{p.current}</Text> : null}
      {pills.length ? <Pills items={pills} /> : null}
      {p.message ? <Text style={[type.footnote, { color: colors.destructive }]}>{p.message}</Text> : null}
      {cloudHint}
      {p.phase === 'copying' ? (
        <Pressable onPress={stopImport} accessibilityRole="button" style={({ pressed }) => [styles.outline, pressed && styles.dimmed]}>
          <Text style={[type.subhead, styles.outlineLabel]}>Stop</Text>
        </Pressable>
      ) : null}
    </StatusCard>
  );
}

function scanChanges(p: ScanProgress): string {
  return [
    p.added ? `${p.added.toLocaleString()} added` : '',
    p.updated ? `${p.updated.toLocaleString()} updated` : '',
    p.removed ? `${p.removed.toLocaleString()} removed` : '',
    p.tagged ? `tags read for ${p.tagged.toLocaleString()}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function ScanCard({ progress: p }: { progress: ScanProgress }) {
  const colors = useTheme();
  const styles = useStyles();
  const details = (
    <>
      {p.tagFailed > 0 ? (
        <Text style={[type.footnote, styles.secondary]}>{formatCount(p.tagFailed, 'song')} could not be read</Text>
      ) : null}
      {p.tagError ? <Text numberOfLines={3} style={[type.caption, styles.secondary]}>{p.tagError}</Text> : null}
    </>
  );
  switch (p.phase) {
    case 'walking':
      return <StatusCard icon="magnifyingglass" title="Looking for music" subtitle={`${formatCount(p.seen, 'file')} found`} live />;
    case 'indexing':
      return <StatusCard icon="list.bullet" title="Updating the library" subtitle={scanChanges(p) || formatCount(p.seen, 'file')} live />;
    case 'tagging':
      return (
        <StatusCard
          icon="tag.fill"
          title="Reading tags and artwork"
          subtitle={p.toTag ? `${p.tagged.toLocaleString()} of ${formatCount(p.toTag, 'song')}` : formatCount(p.tagged, 'song')}
          live
          value={p.toTag ? p.tagged / p.toTag : null}
        >
          {details}
        </StatusCard>
      );
    case 'done':
      return (
        <StatusCard icon="checkmark" title="Library up to date" subtitle={scanChanges(p) || 'Nothing new since the last scan'} live={false}>
          {details}
        </StatusCard>
      );
    case 'error':
      return (
        <StatusCard icon="exclamationmark.triangle.fill" tint={colors.destructive} title="The scan stopped" subtitle={p.message} live={false} />
      );
  }
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

/** Spotify's thin progress line. */
function Meter({ value }: { value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10}%` }]} />
    </View>
  );
}

function Pills({ items }: { items: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.pills}>
      {items.map((text) => (
        <View key={text} style={styles.pill}>
          <Text style={[type.caption, styles.pillLabel]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoCard({ icon, title, tint, children }: { icon: SFSymbol; title: string; tint?: ColorValue; children: ReactNode }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={[styles.card, styles.info]}>
      <SymbolView name={icon} size={20} tintColor={tint ?? colors.tint} />
      <View style={styles.cardText}>
        <Text style={[type.subhead, styles.cardTitle, { fontWeight: '700' }]}>{title}</Text>
        <Text style={[type.footnote, styles.secondary]}>{children}</Text>
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
  tiles: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  tile: { flex: 1, height: 120, borderRadius: radius.sm, overflow: 'hidden', padding: spacing.md, gap: 2 },
  tileTitle: { color: colors.onTint, fontWeight: '800', maxWidth: '80%' },
  tileSubtitle: { color: colors.onTint, opacity: 0.85, maxWidth: '70%' },
  tilted: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    transform: [{ rotate: '25deg' }],
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cards: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  card: { backgroundColor: colors.secondaryBackground, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.label, fontWeight: '600' },
  secondary: { color: colors.secondaryLabel },
  info: { flexDirection: 'row', alignItems: 'flex-start' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.tint },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.fill },
  pillLabel: { color: colors.label, fontWeight: '600' },
  outline: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.secondaryLabel,
  },
  outlineLabel: { color: colors.label, fontWeight: '700' },
  health: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  healthText: { flex: 1, gap: spacing.sm },
  healthLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  healthDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
