import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyState } from '@/components/empty-state';
import { showMenu } from '@/components/menus';
import { toast } from '@/components/toast';
import { getTrack } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { loadRawLyrics } from '@/lyrics/load';
import { formatStamp } from '@/lyrics/lrc';
import { queueSnapshot } from '@/player/queue-store';
import { canEditTags, lrcPathFor, saveLyrics, type LyricsTarget } from '@/tags';
import { makeStyles, spacing, type, useTheme } from '@/theme';

/**
 * Types or pastes lyrics, and saves them into the song's tags or a `.lrc` file beside it. While
 * the song is playing, "Stamp line" puts the current time at the start of the line the cursor is
 * on, which is how plain lyrics become synced ones, a line at a time.
 */
export function LyricsEditorScreen({ id }: { id: number }) {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const { data: track, loading } = useLibraryQuery((d) => getTrack(d, id), [id]);
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<'lrc' | 'embedded' | null>(null);
  const [saving, setSaving] = useState(false);
  const selection = useRef({ start: 0, end: 0 });

  useEffect(() => {
    if (!track || text !== null) return;
    let cancelled = false;
    void loadRawLyrics(track).then((found) => {
      if (cancelled) return;
      setText(found?.text ?? '');
      setSource(found?.source ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [track, text]);

  const write = async (target: LyricsTarget) => {
    if (!track || text === null) return;
    setSaving(true);
    const result = await saveLyrics(db, track, text, target);
    setSaving(false);
    if (result.failed) {
      toast.show(`Could not save the lyrics: ${result.error ?? 'unknown error'}`);
      return;
    }
    toast.show(text.trim() ? (target === 'lrc' ? `Saved ${lrcPathFor(track).split('/').pop()}` : 'Saved in the song') : 'Lyrics removed');
    router.back();
  };

  const save = useRef<() => void>(() => undefined);
  save.current = () => {
    if (!track) return;
    // Lyrics that came from a .lrc go back there; otherwise the user picks.
    if (source === 'lrc' || !canEditTags()) {
      void write('lrc');
      return;
    }
    showMenu({
      title: 'Save the lyrics',
      items: [
        { label: 'In the song’s tags', onPress: () => void write('tag') },
        { label: 'As a .lrc file beside the song', onPress: () => void write('lrc') },
      ],
    });
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
          <Pressable onPress={() => save.current()} hitSlop={spacing.sm} accessibilityRole="button">
            <Text style={[type.headline, { color: colors.tint }]}>Save</Text>
          </Pressable>
        ),
    });
  }, [navigation, router, colors, saving]);

  if (!track) return loading ? null : <EmptyState title="Song not found" />;
  if (text === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  const snapshot = queueSnapshot();
  const playingThis = snapshot.tracks[snapshot.currentIndex]?.id === track.id;

  /** Puts `[mm:ss.xx]` at the start of the cursor's line, replacing a stamp already there. */
  const stampLine = () => {
    const at = queueSnapshot().positionMs;
    const cursor = selection.current.start;
    const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    const lineEnd = text.indexOf('\n', lineStart);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).replace(/^(\[\d+:\d+(?:[.:]\d+)?\])+/, '');
    const stamped = `[${formatStamp(at)}]${line}`;
    const next = text.slice(0, lineStart) + stamped + (lineEnd === -1 ? '' : text.slice(lineEnd));
    setText(next);
    // On to the next line, so tapping along with the song stamps one line after another.
    const nextLine = lineEnd === -1 ? next.length : lineStart + stamped.length + 1;
    selection.current = { start: nextLine, end: nextLine };
  };

  return (
    <View style={styles.root}>
      <Text style={[type.footnote, styles.note]}>
        {source === 'lrc'
          ? `From ${track.lyrics_path}`
          : source === 'embedded'
            ? 'From the song’s tags'
            : 'No lyrics yet. Type or paste them; save an empty page to remove them.'}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onSelectionChange={(e) => {
          selection.current = e.nativeEvent.selection;
        }}
        multiline
        autoCorrect={false}
        autoCapitalize="sentences"
        scrollEnabled
        textAlignVertical="top"
        style={[type.body, styles.editor]}
        placeholder="Lyrics"
        placeholderTextColor={colors.tertiaryLabel}
        accessibilityLabel="Lyrics"
      />
      {playingThis ? (
        <Pressable onPress={stampLine} style={({ pressed }) => [styles.stamp, pressed && { opacity: 0.6 }]} accessibilityRole="button">
          <Text style={[type.headline, { color: colors.onTint }]}>Stamp line at the current time</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  note: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  editor: { flex: 1, color: colors.label, padding: spacing.lg },
  stamp: { backgroundColor: colors.tint, margin: spacing.lg, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
}));
