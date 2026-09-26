import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ColorValue } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { importFolder, importSongs, isImporting, stopImport } from '@/scan/import';
import { IMPORT_DIR, importSummary } from '@/scan/import-plan';
import { BROWSE_TILE_COLORS, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import type { ImportProgress, ScanProgress } from '@/utils/events';
import { formatCount } from '@/utils/format';
import { accessIsASettingsPage, useStorageAccess } from '@/utils/storage-access';

/**
 * Import and scan's pieces: the two ways to add music as tiles (Android's access steps in their
 * place), the cards for an import or scan that is running or just finished, and a plain info card.
 */

/** The two import tiles' fills. */
const FOLDER_TILE = BROWSE_TILE_COLORS[1];
const SONGS_TILE = BROWSE_TILE_COLORS[2];

export type ImportJob = typeof importSongs;

/** Import a folder and Import songs, side by side. */
export function ImportTiles({ disabled, onImport }: { disabled: boolean; onImport: (job: ImportJob) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.tiles}>
      <ImportTile
        color={FOLDER_TILE}
        icon="folder.fill"
        title="Import a folder"
        subtitle="Subfolders, covers and lyrics too"
        disabled={disabled}
        onPress={() => onImport(importFolder)}
      />
      <ImportTile
        color={SONGS_TILE}
        icon="music.note"
        title="Import songs"
        subtitle="Pick one or many"
        disabled={disabled}
        onPress={() => onImport(importSongs)}
      />
    </View>
  );
}

/**
 * Android's tiles in place of the import ones: the music is already on the phone, so the steps
 * are letting Melodify at it, then scanning. Without access, All files (everything works) or
 * Music only (songs play; lyrics files, tag editing and deleting need All files). With it, Scan
 * the phone, and Leave folders out for the excluded folders.
 */
export function AndroidAccessTiles({ disabled, onScan }: { disabled: boolean; onScan: () => void }) {
  const styles = useStyles();
  const router = useRouter();
  const [access, request] = useStorageAccess();
  const askThenScan = async (kind: 'full' | 'read') => {
    const granted = await request(kind);
    if (granted !== 'none') onScan();
  };
  if (access === 'full') {
    return (
      <View style={styles.tiles}>
        <ImportTile
          color={FOLDER_TILE}
          icon="arrow.clockwise"
          title="Scan the phone"
          subtitle="Every folder, as it is now"
          disabled={disabled}
          onPress={onScan}
        />
        <ImportTile
          color={SONGS_TILE}
          icon="folder.badge.minus"
          title="Leave folders out"
          subtitle="Ringtones, recordings"
          disabled={false}
          onPress={() => router.push('/settings/excluded')}
        />
      </View>
    );
  }
  return (
    <View style={styles.tiles}>
      <ImportTile
        color={FOLDER_TILE}
        icon="folder.fill"
        title="Allow all files"
        subtitle="Everything works"
        disabled={disabled}
        onPress={() => void askThenScan('full')}
      />
      <ImportTile
        color={SONGS_TILE}
        icon="music.note"
        title={access === 'read' ? 'Music only: on' : 'Music only'}
        subtitle="Songs play; no editing"
        disabled={disabled || access === 'read'}
        onPress={() => void askThenScan('read')}
      />
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

export function ImportCard({ progress: p }: { progress: ImportProgress }) {
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

export function ScanCard({ progress: p }: { progress: ScanProgress }) {
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

/** Spotify's thin progress line. */
export function Meter({ value }: { value: number }) {
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

export function InfoCard({ icon, title, tint, children }: { icon: SFSymbol; title: string; tint?: ColorValue; children: ReactNode }) {
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
  dimmed: { opacity: 0.5 },
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
}));
