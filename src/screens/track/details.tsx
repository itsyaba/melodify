import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { getTrack } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { canEditTags, readAllTags } from '@/tags';
import { artSize, makeStyles, spacing, type, useTheme } from '@/theme';
import { formatBytes, formatDate, formatDuration } from '@/utils/format';

/** Everything known about one file: its tags, the file itself, and how it has been played. */
export function TrackDetailsScreen({ id }: { id: number }) {
  const styles = useStyles();
  const colors = useTheme();
  const { data: track, loading } = useLibraryQuery((db) => getTrack(db, id), [id]);
  const { data: bookmarks } = useLibraryQuery(
    (db) => db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM bookmarks WHERE track_id = ?', id).then((r) => r?.n ?? 0),
    [id],
  );
  // Everything the file carries, read by TagLib; builds before 0.8.0 do not have it.
  const [inFile, setInFile] = useState<[string, string][] | null>(null);
  useEffect(() => {
    if (!track || !canEditTags()) return;
    let cancelled = false;
    void readAllTags(track)
      .then((all) => {
        if (cancelled || !all) return;
        const rows = Object.entries(all).map(([key, value]): [string, string] =>
          key === '_pictures' ? ['Embedded pictures', String(value)] : [key, Array.isArray(value) ? value.join('\n') : String(value)],
        );
        setInFile(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [track]);

  if (!track) return loading ? null : <EmptyState title="Song not found" body="It may have been deleted or rescanned away." />;

  const number = (n: number | null, of?: string) => (n == null ? null : of ? `${n} ${of}` : String(n));
  const sections: { title: string; rows: [string, string | null][] }[] = [
    {
      title: 'Tags',
      rows: [
        ['Title', track.title],
        ['Artist', track.artist],
        ['Album', track.album],
        ['Album artist', track.album_artist],
        ['Genre', track.genre],
        ['Composer', track.composer],
        ['Year', number(track.year)],
        ['Track', number(track.track_no)],
        ['Disc', number(track.disc_no)],
        ['Tags read', track.tagged ? 'From the file' : 'Guessed from the file name'],
      ],
    },
    {
      title: 'File',
      rows: [
        ['Path', track.path],
        ['Format', track.ext.toUpperCase()],
        ['Size', formatBytes(track.size)],
        ['Duration', formatDuration(track.duration_ms)],
        ['Bitrate', track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null],
        ['Sample rate', track.sample_rate ? `${(track.sample_rate / 1000).toFixed(1)} kHz` : null],
        ['Modified', formatDate(track.mtime)],
        ['Lyrics file', track.lyrics_path],
        ['Artwork', track.art_key ?? 'Default cover'],
      ],
    },
    {
      title: 'Listening',
      rows: [
        ['Plays', String(track.play_count)],
        ['Last played', track.last_played_at ? formatDate(track.last_played_at) : 'Never'],
        ['Added', formatDate(track.added_at)],
        ['Favorite', track.favorite ? 'Yes' : 'No'],
        ['Hidden', track.hidden ? 'Yes' : 'No'],
        ['Resumes at', track.resume_ms ? formatDuration(track.resume_ms) : null],
        ['Bookmarks', bookmarks ? String(bookmarks) : null],
      ],
    },
    ...(inFile?.length ? [{ title: 'Every tag in the file', rows: inFile }] : []),
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Artwork artKey={track.art_key} size={artSize.card} rounded="lg" />
        <Text style={[type.title, { color: colors.label, textAlign: 'center' }]}>{track.title}</Text>
      </View>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[type.footnote, styles.sectionTitle]}>{section.title.toUpperCase()}</Text>
          {section.rows
            .filter((row): row is [string, string] => row[1] != null && row[1] !== '')
            .map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={[type.subhead, styles.label]}>{label}</Text>
                <Text selectable style={[type.subhead, styles.value]}>{value}</Text>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  section: { paddingTop: spacing.lg },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  label: { width: 110, color: colors.secondaryLabel },
  value: { flex: 1, color: colors.label },
}));
