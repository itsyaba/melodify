import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Artwork } from '@/components/artwork';
import { Chips } from '@/components/chips';
import { listBookmarks, type BookmarkWithTrack } from '@/db/bookmarks';
import type { Track } from '@/db/types';
import { activeLine } from '@/lyrics/lrc';
import { loadLyrics, type LoadedLyrics } from '@/lyrics/load';
import { queue, type QueueInfo } from '@/player/queue-store';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { libraryEvents } from '@/utils/events';
import { formatBytes, formatCount, formatDate, formatDuration } from '@/utils/format';

/**
 * What scrolls up under the controls, Spotify's cards: lyrics, the queue, bookmarks, and the
 * song's own details, all from the files and the library, never from the internet. Each is
 * memoised on its own inputs so the four-times-a-second position ticks pass them by; only the
 * lyrics card follows the position, to show the line being sung.
 */

const LYRIC_LINES = 4;
const UP_NEXT = 5;

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void; accessibilityLabel: string };
  children: ReactNode;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: colors.label, fontWeight: '700' }]}>{title}</Text>
          {subtitle ? <Text style={[type.footnote, styles.muted]}>{subtitle}</Text> : null}
        </View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={spacing.sm}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={[type.caption, { color: colors.label, fontWeight: '700', letterSpacing: 0.5 }]}>
              {action.label.toUpperCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A few lines from where the song is, large and bold; tapping shows the full lyrics up top. */
export function LyricsCard({
  track,
  positionMs,
  showing,
  onToggle,
  onEdit,
}: {
  track: Track;
  positionMs: number;
  showing: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const [lyrics, setLyrics] = useState<LoadedLyrics | null | undefined>(undefined);
  const latest = useRef(track);
  latest.current = track;

  // By id and lyrics file rather than the whole row: hearting the song replaces the row, and
  // reloading then would blank the card for a moment and jolt everything under it.
  useEffect(() => {
    let cancelled = false;
    setLyrics(undefined);
    void loadLyrics(latest.current).then((l) => {
      if (!cancelled) setLyrics(l);
    });
    return () => {
      cancelled = true;
    };
  }, [track.id, track.lyrics_path]);

  if (lyrics === undefined) return null;
  if (lyrics === null) {
    return (
      <Card title="Lyrics" action={{ label: 'Add', onPress: onEdit, accessibilityLabel: 'Add lyrics' }}>
        <Text style={[type.subhead, styles.muted]}>
          None for this song. Put a .lrc file with the same name next to it, embed them in its tags, or write them here.
        </Text>
      </Card>
    );
  }
  const current = lyrics.synced ? activeLine(lyrics.lines, positionMs) : -1;
  const from = Math.max(0, current);
  const lines = lyrics.synced
    ? lyrics.lines.slice(from, from + LYRIC_LINES)
    : lyrics.lines.filter((l) => l.text.trim()).slice(0, LYRIC_LINES);
  return (
    <Card
      title="Lyrics"
      subtitle={lyrics.synced ? 'Synced' : undefined}
      action={{ label: showing ? 'Hide' : 'Show', onPress: onToggle, accessibilityLabel: showing ? 'Hide lyrics' : 'Show lyrics' }}
    >
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={showing ? 'Hide lyrics' : 'Show lyrics'}>
        {lines.map((line, i) => (
          <Text
            key={`${from + i}`}
            numberOfLines={2}
            style={[styles.lyric, { color: lyrics.synced && current >= 0 && i === 0 ? colors.label : colors.secondaryLabel }]}
          >
            {line.text.trim() || '♪'}
          </Text>
        ))}
      </Pressable>
    </Card>
  );
}

/** The next few songs, and the other queues to switch to: Musicolet's queues, Spotify's card. */
export const UpNextCard = memo(function UpNextCard({
  queues,
  activeId,
  tracks,
  currentIndex,
  onOpen,
}: {
  queues: QueueInfo[];
  activeId: number;
  tracks: Track[];
  currentIndex: number;
  onOpen: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const upcoming = tracks.slice(currentIndex + 1);
  const left = upcoming.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const name = queues.find((q) => q.id === activeId)?.name ?? 'the queue';
  return (
    <Card
      title={`Next in ${name}`}
      subtitle={upcoming.length ? `${formatCount(upcoming.length, 'song')} · ${formatDuration(left)}` : 'Nothing after this song'}
      action={{ label: 'Open', onPress: onOpen, accessibilityLabel: 'Open the queue' }}
    >
      {queues.length > 1 ? (
        <View style={styles.chips}>
          <Chips options={queues.map((q) => ({ key: q.id, label: q.name }))} value={activeId} onChange={(id) => void queue.switchTo(id)} />
        </View>
      ) : null}
      {upcoming.slice(0, UP_NEXT).map((t, i) => (
        <Pressable
          key={`${t.id}:${currentIndex + 1 + i}`}
          onPress={() => void queue.playAt(currentIndex + 1 + i)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityHint="Plays this song now"
        >
          <Artwork artKey={t.art_key} size={44} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[type.subhead, { color: colors.label }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[type.footnote, styles.muted]}>{t.artist ?? t.folder}</Text>
          </View>
          <Text style={[type.footnote, styles.muted, styles.digits]}>{formatDuration(t.duration_ms)}</Text>
        </Pressable>
      ))}
    </Card>
  );
});

/** This song's bookmarks, in the order they come in it. Hidden while there are none. */
export const BookmarksCard = memo(function BookmarksCard({ trackId, onSeek }: { trackId: number; onSeek: (ms: number) => void }) {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const [marks, setMarks] = useState<BookmarkWithTrack[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listBookmarks(db, trackId).then((m) => {
        if (!cancelled) setMarks(m.slice().sort((a, b) => a.position_ms - b.position_ms));
      });
    };
    load();
    const off = libraryEvents.on('changed', load);
    return () => {
      cancelled = true;
      off();
    };
  }, [db, trackId]);

  if (marks.length === 0) return null;
  return (
    <Card title="Bookmarks" subtitle={formatCount(marks.length, 'bookmark')}>
      {marks.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => onSeek(b.position_ms)}
          style={({ pressed }) => [styles.mark, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Play from ${formatDuration(b.position_ms)}${b.label ? `, ${b.label}` : ''}`}
        >
          <Text style={[type.subhead, styles.digits, { color: colors.tint, fontWeight: '600' }]}>{formatDuration(b.position_ms)}</Text>
          <Text numberOfLines={1} style={[type.subhead, { color: b.label ? colors.label : colors.secondaryLabel, flex: 1 }]}>
            {b.label ?? 'Bookmark'}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
});

/** Spotify's credits, from the tags and the file: who, what, and how often it was played. */
export const AboutCard = memo(function AboutCard({
  track,
  onAlbum,
  onArtist,
  onDetails,
}: {
  track: Track;
  onAlbum: () => void;
  onArtist: () => void;
  onDetails: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const format = [
    track.ext.toUpperCase(),
    track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null,
    track.sample_rate ? `${(track.sample_rate / 1000).toFixed(1)} kHz` : null,
    formatBytes(track.size),
  ].filter(Boolean).join(' · ');
  const played = track.play_count
    ? `${formatCount(track.play_count, 'time')}${track.skip_count ? `, skipped ${formatCount(track.skip_count, 'time')}` : ''}`
    : 'Not yet';
  const rows: { label: string; value: string | null; onPress?: () => void }[] = [
    { label: 'Artist', value: track.artist, onPress: onArtist },
    { label: 'Album', value: track.album, onPress: onAlbum },
    { label: 'Album artist', value: track.album_artist && track.album_artist !== track.artist ? track.album_artist : null },
    { label: 'Composer', value: track.composer },
    { label: 'Genre', value: track.genre },
    { label: 'Year', value: track.year ? String(track.year) : null },
    { label: 'Track', value: track.track_no ? `${track.track_no}${track.disc_no ? `, disc ${track.disc_no}` : ''}` : null },
    { label: 'File', value: format },
    { label: 'Played', value: played },
    { label: 'Last played', value: track.last_played_at ? formatDate(track.last_played_at) : null },
    { label: 'Folder', value: track.folder || null },
  ];
  return (
    <Card title="About this song" action={{ label: 'Details', onPress: onDetails, accessibilityLabel: 'Song details' }}>
      {rows
        .filter((r) => r.value)
        .map((r) => (
          <Pressable
            key={r.label}
            onPress={r.onPress}
            disabled={!r.onPress}
            style={({ pressed }) => [styles.fact, pressed && styles.pressed]}
            accessibilityRole={r.onPress ? 'link' : 'text'}
          >
            <Text style={[type.footnote, styles.muted, styles.factLabel]}>{r.label}</Text>
            <Text numberOfLines={2} style={[type.subhead, { flex: 1, color: colors.label, fontWeight: r.onPress ? '600' : '400' }]}>
              {r.value}
            </Text>
          </Pressable>
        ))}
    </Card>
  );
});

const useStyles = makeStyles((colors) => ({
  // Translucent, so the colour behind the player shows through, as Spotify's cards do.
  card: { backgroundColor: colors.fill, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  button: { backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pressed: { opacity: 0.5 },
  muted: { color: colors.secondaryLabel },
  digits: { fontVariant: ['tabular-nums'] },
  lyric: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  // The chips pad themselves; this lines them up with the card's own padding.
  chips: { marginHorizontal: -spacing.lg, marginVertical: -spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  factLabel: { width: 92 },
}));
