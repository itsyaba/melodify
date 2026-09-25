import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { artSource } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { confirm } from '@/components/menus';
import { Note, Section } from '@/components/settings-rows';
import { toast } from '@/components/toast';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { canEditTags, editTags, readAllTags, setArtwork } from '@/tags';
import { commonFields, validate, type TagEdit, type TagField } from '@/tags/fields';
import { artSize, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatCount } from '@/utils/format';

const LABELS: Record<TagField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  genre: 'Genre',
  composer: 'Composer',
  year: 'Year',
  track: 'Track',
  disc: 'Disc',
  comment: 'Comment',
};
const SINGLE: TagField[] = ['title', 'artist', 'album', 'albumArtist', 'genre', 'composer', 'year', 'track', 'disc', 'comment'];
/** Several songs at once: the album-wide fields. Titles and track numbers are each song's own. */
const BATCH: TagField[] = ['artist', 'album', 'albumArtist', 'genre', 'composer', 'year', 'disc'];
const NUMERIC = new Set<TagField>(['year', 'track', 'disc']);

type ArtChange = { kind: 'set'; uri: string } | { kind: 'remove' } | null;

/**
 * Edits the tags of one song, or the shared fields of several (an album, a selection). Only the
 * fields that were changed are written; with several songs, a field they disagree on shows as
 * "different values" and is left alone unless it is typed over. Artwork changes wait for Save too.
 */
export function TagEditorScreen({ ids }: { ids: number[] }) {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const key = ids.join(',');
  const { data: tracks } = useLibraryQuery(
    (d) => d.getAllAsync<Track>('SELECT * FROM tracks WHERE id IN (SELECT value FROM json_each(?)) ORDER BY disc_no, track_no, title', JSON.stringify(ids)),
    [key],
  );
  const [edits, setEdits] = useState<TagEdit>({});
  const [comment, setComment] = useState<string | null>(null);
  const [art, setArt] = useState<ArtChange>(null);
  const [saving, setSaving] = useState(false);
  const common = useMemo(() => (tracks?.length ? commonFields(tracks) : null), [tracks]);
  const single = ids.length === 1;
  const fields = single ? SINGLE : BATCH;

  // The comment is not in the library, so a single song's is read from the file.
  useEffect(() => {
    const track = tracks?.[0];
    if (!single || !track || !canEditTags()) return;
    let cancelled = false;
    void readAllTags(track)
      .then((all) => {
        const value = all?.COMMENT;
        if (!cancelled) setComment(Array.isArray(value) ? value.join('\n') : '');
      })
      .catch(() => !cancelled && setComment(''));
    return () => {
      cancelled = true;
    };
  }, [single, tracks]);

  const save = useRef<() => Promise<void>>(async () => undefined);
  save.current = async () => {
    if (!tracks?.length || saving) return;
    const problem = validate(edits);
    if (problem) {
      toast.show(problem);
      return;
    }
    if (Object.keys(edits).length === 0 && !art) {
      router.back();
      return;
    }
    setSaving(true);
    let failed = 0;
    let error: string | undefined;
    const tally = (r: { failed: number; error?: string }) => {
      failed = Math.max(failed, r.failed);
      error ??= r.error;
    };
    tally(await editTags(db, tracks, edits));
    if (art) tally(await setArtwork(db, tracks, art.kind === 'set' ? art.uri : null));
    setSaving(false);
    if (failed) {
      toast.show(`${formatCount(failed, 'song')} could not be saved: ${error ?? 'unknown error'}`);
      return;
    }
    toast.show(single ? 'Saved' : `Saved ${formatCount(tracks.length, 'song')}`);
    router.back();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={() => router.back()} hitSlop={spacing.sm} accessibilityRole="button">
          <Text style={[type.body, { color: colors.tint }]}>Cancel</Text>
        </Pressable>
      ),
      headerRight: () =>
        saving ? (
          <ActivityIndicator />
        ) : (
          <Pressable onPress={() => void save.current()} hitSlop={spacing.sm} accessibilityRole="button">
            <Text style={[type.headline, { color: colors.tint }]}>Save</Text>
          </Pressable>
        ),
    });
  }, [navigation, router, colors, saving]);

  if (!canEditTags()) {
    return (
      <EmptyState
        title="This build cannot write tags"
        body="Tag editing arrived in melodify-audio 0.8.0. Install a newer build of the app, then try again."
      />
    );
  }
  if (!tracks || !common) return null;
  if (tracks.length === 0) return <EmptyState title="Song not found" body="It may have been deleted or rescanned away." />;

  const pickImage = async () => {
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['image/*'] });
      if (!picked.canceled) setArt({ kind: 'set', uri: picked.result.uri });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  const currentArt = tracks.find((t) => t.art_key)?.art_key ?? null;
  const preview = art?.kind === 'set' ? { uri: art.uri } : artSource(art?.kind === 'remove' ? null : currentArt);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.header}>
        <Image source={preview} style={styles.art} />
        <Text style={[type.footnote, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          {single ? tracks[0].path : formatCount(tracks.length, 'song')}
        </Text>
      </View>

      <Section title={single ? 'Tags' : 'Shared tags'} footer={single ? undefined : 'Fields showing “Different values” are left as they are unless you type over them. Leave a field empty to clear it.'}>
        {fields.map((field) => {
          const original = field === 'comment' ? comment : common[field as Exclude<TagField, 'comment'>];
          const value = edits[field] ?? original ?? '';
          return (
            <View key={field} style={styles.row}>
              <Text style={[type.subhead, styles.label]}>{LABELS[field]}</Text>
              <TextInput
                value={value}
                onChangeText={(text) => setEdits((e) => ({ ...e, [field]: text }))}
                placeholder={original === null && field !== 'comment' ? 'Different values' : field === 'comment' && comment === null ? 'Reading…' : ''}
                placeholderTextColor={colors.tertiaryLabel}
                editable={!(field === 'comment' && comment === null)}
                style={[type.body, styles.input]}
                keyboardType={NUMERIC.has(field) ? 'numbers-and-punctuation' : 'default'}
                autoCapitalize={NUMERIC.has(field) ? 'none' : 'words'}
                autoCorrect={false}
                multiline={field === 'comment'}
                returnKeyType="done"
                accessibilityLabel={LABELS[field]}
              />
            </View>
          );
        })}
      </Section>

      <Section title="Artwork" footer="The picture is written into each song file. Removing it shows the folder’s cover image, if it has one.">
        <ListRow title="Choose an image…" tinted trailing={null} onPress={() => void pickImage()} />
        <ListRow
          title="Remove artwork"
          tinted
          trailing={null}
          onPress={async () => {
            if (await confirm('Remove the artwork?', single ? undefined : `From ${formatCount(tracks.length, 'song')}.`, 'Remove')) {
              setArt({ kind: 'remove' });
            }
          }}
        />
        {art ? <Note>{art.kind === 'set' ? 'New artwork is saved with the tags.' : 'The artwork is removed when you save.'}</Note> : null}
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  art: { width: artSize.card, height: artSize.card, borderRadius: radius.lg, backgroundColor: colors.fill },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  label: { width: 100, color: colors.secondaryLabel },
  input: { flex: 1, color: colors.label, paddingVertical: spacing.sm },
}));
