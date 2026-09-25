import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { Artwork } from '@/components/artwork';
import { Chips } from '@/components/chips';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListToolbar } from '@/components/list-toolbar';
import { confirm, promptText, showMenu, type MenuItem } from '@/components/menus';
import { ReorderableList } from '@/components/reorderable-list';
import { useSelectionHeader } from '@/components/selection-header';
import { toast } from '@/components/toast';
import { albumHref, choosePlaylist, chooseQueue, groupHref, newPlaylistWith } from '@/components/track-actions';
import { TrackRow } from '@/components/track-row';
import type { Track } from '@/db/types';
import { useSelection } from '@/hooks/use-selection';
import { queue, queueSnapshot, useQueue, useQueues, useUndoLabel, type QueueInfo, type RepeatMode } from '@/player/queue-store';
import { artSize, makeStyles, spacing, type, useTheme } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const REPEAT_ICON = { off: 'repeat', all: 'repeat', one: 'repeat.1' } as const;
const REPEAT_LABEL: Record<RepeatMode, string> = { off: 'Repeat off', all: 'Repeat queue', one: 'Repeat song' };

function undoToast(text: string) {
  toast.show(text, { label: 'Undo', onPress: () => void queue.undo() });
}

/**
 * The queues, one tab each. The tab being looked at need not be the one playing: queues can be
 * built and rearranged without interrupting playback, and tapping a song in another queue is
 * what switches to it.
 */
export function QueueScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  // Deliberately not useQueue(): that changes four times a second while playing, and this
  // screen renders a whole list. The one part that shows the position has its own component.
  const { queues, activeId } = useQueues();
  const undoLabel = useUndoLabel();
  const [viewedId, setViewedId] = useState(activeId);

  // Follow the playing queue when it changes from elsewhere, and never show a deleted one.
  useEffect(() => setViewedId(activeId), [activeId]);
  const viewed: QueueInfo = queues.find((q) => q.id === viewedId) ?? queues.find((q) => q.id === activeId) ?? queues[0];
  const isActive = viewed.id === activeId;
  const tracks = viewed.tracks;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);

  const selection = useSelection(tracks);

  const tabMenu = (q: QueueInfo) => {
    const at = queues.findIndex((x) => x.id === q.id);
    showMenu({
      title: q.name,
      message: formatCount(q.tracks.length, 'song'),
      items: [
        { label: 'Play this queue', hidden: q.id === activeId || q.tracks.length === 0, onPress: () => void queue.switchTo(q.id) },
        { label: 'Shuffle', hidden: q.tracks.length < 2, onPress: () => void queue.shuffle(q.id).then(() => undoToast('Shuffled')) },
        {
          label: 'Shuffle by album',
          hidden: q.tracks.length < 2,
          onPress: () => void queue.shuffleByAlbum(q.id).then(() => undoToast('Shuffled by album')),
        },
        {
          label: 'Remove duplicates',
          hidden: q.tracks.length < 2,
          onPress: async () => {
            const before = q.tracks.length;
            await queue.removeDuplicates(q.id);
            const removed = before - (queueSnapshot().queues.find((x) => x.id === q.id)?.tracks.length ?? before);
            if (removed > 0) undoToast(`Removed ${formatCount(removed, 'duplicate')}`);
            else toast.show('No duplicates in this queue');
          },
        },
        { label: 'Save as playlist…', hidden: q.tracks.length === 0, onPress: () => void newPlaylistWith(db, q.tracks, q.name) },
        {
          label: 'Rename…',
          onPress: async () => {
            const name = await promptText('Rename queue', { defaultValue: q.name, ok: 'Rename' });
            if (name) queue.renameQueue(q.id, name);
          },
        },
        { label: 'Move tab left', hidden: at <= 0, onPress: () => queue.moveQueue(q.id, -1) },
        { label: 'Move tab right', hidden: at < 0 || at >= queues.length - 1, onPress: () => queue.moveQueue(q.id, 1) },
        {
          label: 'Clear queue',
          destructive: true,
          hidden: q.tracks.length === 0,
          onPress: () => void queue.clear(q.id).then(() => undoToast(`Cleared ${q.name}`)),
        },
        {
          label: 'Delete queue',
          destructive: true,
          hidden: queues.length <= 1,
          onPress: async () => {
            const ok = q.tracks.length === 0 || (await confirm(`Delete “${q.name}”?`, 'Its songs stay in your library.', 'Delete'));
            if (ok) await queue.deleteQueue(q.id);
          },
        },
      ],
    });
  };

  const newQueue = async () => {
    const id = await queue.createQueue();
    if (id === null) toast.show('That is the most queues there can be');
    else setViewedId(id);
  };

  useSelectionHeader({
    selection,
    count: tracks.length,
    onMenu: () =>
      showMenu({
        items: [
          { label: undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo', hidden: !undoLabel, onPress: () => void queue.undo() },
          { label: 'New queue', onPress: () => void newQueue() },
          { label: `${viewed.name} options…`, onPress: () => tabMenu(viewed) },
        ],
      }),
    onActions: () => {
      const indexes = selection.indexes();
      const picked = indexes.map((i) => tracks[i]);
      showMenu({
        title: `${formatCount(picked.length, 'song')} selected`,
        items: [
          {
            label: 'Play next',
            hidden: !isActive && viewed.currentIndex < 0,
            onPress: () => void queue.moveNext(indexes, viewed.id).then(() => undoToast(`Moved ${formatCount(indexes.length, 'song')}`)),
          },
          { label: 'Add to another queue…', onPress: () => chooseQueue(picked) },
          { label: 'Add to playlist…', onPress: () => void choosePlaylist(db, picked) },
          { label: 'Save as playlist…', onPress: () => void newPlaylistWith(db, picked) },
          {
            label: 'Remove from queue',
            destructive: true,
            onPress: () => void queue.remove(indexes, viewed.id).then(() => undoToast(`Removed ${formatCount(indexes.length, 'song')}`)),
          },
        ],
      });
    },
  });

  const rowMenu = (track: Track, index: number) => {
    const items: MenuItem[] = [
      {
        label: 'Play next',
        icon: 'text.line.first.and.arrowtriangle.forward',
        hidden: index === viewed.currentIndex || index === viewed.currentIndex + 1,
        onPress: () => void queue.moveNext([index], viewed.id),
      },
      { label: 'Move to top', icon: 'arrow.up.to.line', hidden: index === 0, onPress: () => void queue.move(index, 0, viewed.id) },
      { label: 'Move to bottom', icon: 'arrow.down.to.line', hidden: index === tracks.length - 1, onPress: () => void queue.move(index, tracks.length - 1, viewed.id) },
      { label: 'Add to another queue…', icon: 'rectangle.stack', onPress: () => chooseQueue([track]) },
      { label: 'Add to playlist…', icon: 'plus.circle', onPress: () => void choosePlaylist(db, [track]) },
      { label: 'Go to album', icon: 'opticaldisc', hidden: !track.album, onPress: () => router.push(albumHref(track.album!, track.album_artist ?? track.artist)) },
      { label: 'Go to artist', icon: 'person', hidden: !track.artist, onPress: () => router.push(groupHref('artist', track.artist!)) },
      { label: 'Select', icon: 'checkmark.circle', onPress: () => selection.start(index) },
      {
        label: 'Remove from queue',
        icon: 'minus.circle',
        destructive: true,
        onPress: () => void queue.remove([index], viewed.id).then(() => undoToast(`Removed “${track.title}”`)),
      },
    ];
    showMenu({ title: track.title, message: [track.artist, track.album].filter(Boolean).join(' • ') || undefined, artKey: track.art_key, items });
  };

  const tabs = queues.map((q) => ({
    key: q.id,
    label: `${q.id === activeId ? '▶︎ ' : ''}${q.name} · ${q.tracks.length}`,
  }));

  const header = (
    <View>
      <Chips
        options={tabs}
        value={viewed.id}
        onChange={setViewedId}
        onLongPress={(id) => {
          const q = queues.find((x) => x.id === id);
          if (q) tabMenu(q);
        }}
        action={{ label: '+', onPress: () => void newQueue(), accessibilityLabel: 'New queue' }}
      />
      {isActive ? <NowPlaying /> : null}
      {!isActive && viewed.tracks.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.resume, pressed && styles.pressed]}
          onPress={() => void queue.switchTo(viewed.id)}
          accessibilityRole="button"
        >
          <SymbolView name="play.circle.fill" size={28} tintColor={colors.tint} />
          <Text style={[type.body, { color: colors.tint }]}>
            Play {viewed.name} from {viewed.tracks[viewed.currentIndex]?.title ?? 'the start'}
          </Text>
        </Pressable>
      ) : null}
      {tracks.length ? (
        <View style={styles.toolbar}>
          <View style={{ flex: 1 }}>
            <ListToolbar summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`} />
          </View>
          <IconButton
            name={REPEAT_ICON[viewed.repeat]}
            size={18}
            color={viewed.repeat === 'off' ? colors.secondaryLabel : colors.tint}
            onPress={() => {
              queue.cycleRepeat(viewed.id);
              const next: RepeatMode = viewed.repeat === 'off' ? 'all' : viewed.repeat === 'all' ? 'one' : 'off';
              toast.show(REPEAT_LABEL[next]);
            }}
            accessibilityLabel={`${REPEAT_LABEL[viewed.repeat]}. Change repeat mode`}
          />
          <IconButton
            name="shuffle"
            size={18}
            color={colors.tint}
            disabled={tracks.length < 2}
            onPress={() => void queue.shuffle(viewed.id).then(() => undoToast('Shuffled'))}
            accessibilityLabel="Shuffle this queue"
          />
          <View style={{ width: spacing.lg }} />
        </View>
      ) : null}
    </View>
  );

  const extraData = useMemo(() => [selection, viewed.currentIndex, isActive], [selection, viewed.currentIndex, isActive]);

  return (
    <View style={styles.root}>
      <ReorderableList
        data={tracks}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        extraData={extraData}
        header={header}
        empty={
          <EmptyState
            title="Queue is empty"
            body="Tap any song to start playing, or long-press one and choose Add to queue."
          />
        }
        onMove={(from, to) => void queue.move(from, to, viewed.id)}
        onSwipeRemove={
          selection.active
            ? undefined
            : (index) => {
                const title = tracks[index]?.title ?? 'song';
                void queue.remove([index], viewed.id).then(() => undoToast(`Removed “${title}”`));
              }
        }
        renderItem={({ item, index, handle, lifted }) => {
          const checked = selection.selected.has(index);
          const isCurrent = index === viewed.currentIndex;
          return (
            <View style={[isCurrent && !lifted && styles.current]}>
              <TrackRow
                track={item}
                active={isCurrent && isActive}
                trailing={
                  selection.active ? (
                    <View style={styles.check}>
                      <SymbolView
                        name={checked ? 'checkmark.circle.fill' : 'circle'}
                        size={22}
                        tintColor={checked ? colors.tint : colors.tertiaryLabel}
                      />
                    </View>
                  ) : (
                    <View style={styles.trailing}>
                      <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>{formatDuration(item.duration_ms)}</Text>
                      {handle}
                    </View>
                  )
                }
                onPress={() => {
                  if (selection.active) selection.toggle(index);
                  else if (isActive) void queue.playAt(index);
                  else void queue.playQueueAt(viewed.id, index);
                }}
                onLongPress={() => (selection.active ? selection.toggle(index) : rowMenu(item, index))}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

/**
 * The playing track and its position. The way into the player on an iOS too old for the tab bar
 * accessory, too.
 */
function NowPlaying() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const { tracks, currentIndex, state, positionMs, durationMs } = useQueue();
  const current = tracks[currentIndex];
  if (!current) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.now, pressed && styles.pressed]}
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel="Open the player"
    >
      <Artwork artKey={current.art_key} size={artSize.row} />
      <View style={styles.nowText}>
        <Text numberOfLines={1} style={[type.headline, { color: colors.label }]}>{current.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>
          {state} · {formatDuration(positionMs)} / {formatDuration(durationMs)}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  nowText: { flex: 1, gap: 2 },
  resume: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.fill },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  current: { backgroundColor: colors.secondaryBackground },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  check: { width: 28, alignItems: 'flex-end' },
}));
