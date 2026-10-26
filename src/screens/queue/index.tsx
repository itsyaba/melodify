import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View, type FlatList } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from '@/components/symbol';
import { Artwork } from '@/components/artwork';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListToolbar } from '@/components/list-toolbar';
import { confirm, promptText, showMenu, type MenuItem } from '@/components/menus';
import { ReorderableList } from '@/components/reorderable-list';
import { SelectionHeader } from '@/components/selection-header';
import { TabScreen } from '@/components/tab-screen';
import { toast } from '@/components/toast';
import { albumHref, choosePlaylist, chooseQueue, groupHref, newPlaylistWith } from '@/components/track-actions';
import type { Track } from '@/db/types';
import { useDensity } from '@/hooks/use-density';
import { useSelection } from '@/hooks/use-selection';
import { queue, queueSnapshot, useQueue, useQueues, useUndoLabel, type QueueInfo, type RepeatMode } from '@/player/queue-store';
import { artSize, makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const REPEAT_ICON = { off: 'repeat', all: 'repeat', one: 'repeat.1' } as const;
const REPEAT_LABEL: Record<RepeatMode, string> = { off: 'Repeat off', all: 'Repeat queue', one: 'Repeat song' };

function undoToast(text: string) {
  toast.show(text, { label: 'Undo', onPress: () => void queue.undo() });
}

/**
 * The queues, one tab each. The tab being looked at need not be the one playing: queues can be
 * built and rearranged without interrupting playback, and tapping a song in another queue is
 * what switches to it. The Queue tab draws its own header with the tabs pinned in it; as a
 * `sheet` over the player it sits under the stack's header, the tabs scrolling with the list.
 */
export function QueueScreen({ sheet = false }: { sheet?: boolean }) {
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
  // The Queue tab stays mounted behind the others: while it is out of sight it keeps the list it
  // last drew, so shuffling a big library from elsewhere does not rebuild thousands of rows here.
  const focused = useIsFocused();
  const drawn = useRef(viewed.tracks);
  if (focused) drawn.current = viewed.tracks;
  const tracks = focused ? viewed.tracks : drawn.current;
  // Keyed by song and by which repeat of it this is, not by position, so a move or a removal only
  // re-renders the rows it touched.
  const keys = useMemo(() => {
    const seen = new Map<number, number>();
    return tracks.map((t) => {
      const n = seen.get(t.id) ?? 0;
      seen.set(t.id, n + 1);
      return `${t.id}:${n}`;
    });
  }, [tracks]);
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);

  const selection = useSelection(tracks);

  // Musicolet's queue opens where it is playing, and its crosshair comes back to it.
  const listRef = useRef<FlatList<Track>>(null);
  const jumpToCurrent = useCallback(
    (animated: boolean) => {
      const index = viewed.currentIndex;
      if (index < 0 || index >= viewed.tracks.length) return;
      listRef.current?.scrollToIndex({ index, animated, viewPosition: 0.35 });
    },
    [viewed.currentIndex, viewed.tracks.length],
  );
  // On the queue being looked at, not on its position: a song ending must not drag the list.
  const landedOn = useRef<number | null>(null);
  useEffect(() => {
    if (landedOn.current === viewed.id) return;
    landedOn.current = viewed.id;
    // Twice: the first jump is before FlatList has measured rows that far down, so it lands by
    // arithmetic; the second, once they are mounted, puts the song exactly a third down.
    const first = setTimeout(() => jumpToCurrent(false), 50);
    const settle = setTimeout(() => jumpToCurrent(false), 400);
    return () => {
      clearTimeout(first);
      clearTimeout(settle);
    };
  }, [viewed.id, jumpToCurrent]);

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

  // An element rather than the hook: in the tab, the TabScreen it hands its buttons to is below here.
  const selectionHeader = (
    <SelectionHeader
      selection={selection}
      count={tracks.length}
      onMenu={() =>
        showMenu({
          items: [
            { label: undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo', hidden: !undoLabel, onPress: () => void queue.undo() },
            { label: 'New queue', onPress: () => void newQueue() },
            { label: `${viewed.name} options…`, onPress: () => tabMenu(viewed) },
          ],
        })
      }
      onActions={() => {
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
      }}
    />
  );

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

  // One queue is shown; the rest are a tap away. A row of tabs could not hold twenty names, and
  // the one being looked at scrolled out of sight among them.
  const pickQueue = () =>
    showMenu({
      title: 'Queues',
      items: [
        ...queues.map((q) => ({
          label: `${q.name} · ${formatCount(q.tracks.length, 'song')}`,
          icon: (q.id === activeId ? 'play.fill' : 'rectangle.stack') as MenuItem['icon'],
          selected: q.id === viewed.id,
          onPress: () => setViewedId(q.id),
        })),
        { label: 'New queue', icon: 'plus', onPress: () => void newQueue() },
        { label: `${viewed.name} options…`, icon: 'ellipsis', onPress: () => tabMenu(viewed) },
      ],
    });

  const picker = (
    <View style={styles.pickerRow}>
      <Pressable
        onPress={pickQueue}
        onLongPress={() => tabMenu(viewed)}
        style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${viewed.name}, ${formatCount(viewed.tracks.length, 'song')}${isActive ? ', playing' : ''}`}
        accessibilityHint="Switch to another queue"
      >
        {isActive ? <SymbolView name="play.fill" size={11} tintColor={colors.tint} /> : null}
        <Text numberOfLines={1} style={[type.headline, { color: colors.label }]}>{viewed.name}</Text>
        <Text style={[type.footnote, { color: colors.secondaryLabel }]}>{formatCount(viewed.tracks.length, 'song')}</Text>
        <SymbolView name="chevron.down" size={12} tintColor={colors.secondaryLabel} />
      </Pressable>
    </View>
  );

  const header = (
    <View>
      {sheet ? picker : null}
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
            <ListToolbar
              summary={
                viewed.currentIndex >= 0
                  ? `${viewed.currentIndex + 1} / ${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`
                  : `${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`
              }
            />
          </View>
          <IconButton
            name="scope"
            size={18}
            color={colors.secondaryLabel}
            disabled={viewed.currentIndex < 0}
            onPress={() => jumpToCurrent(true)}
            accessibilityLabel="Scroll to the playing song"
          />
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

  const list = (
    <ReorderableList
      listRef={listRef}
      data={tracks}
      keyExtractor={(_t, i) => keys[i]}
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
      renderItem={({ item, index, handle, lifted }) => (
        <QueueRow
          track={item}
          index={index}
          current={index === viewed.currentIndex && !lifted}
          playing={index === viewed.currentIndex && isActive}
          checked={selection.active ? selection.selected.has(index) : undefined}
          handle={handle}
          onPress={() => {
            if (selection.active) selection.toggle(index);
            else if (isActive) void queue.playAt(index);
            else void queue.playQueueAt(viewed.id, index);
          }}
          onLongPress={() => (selection.active ? selection.toggle(index) : rowMenu(item, index))}
        />
      )}
    />
  );

  // The header element goes after the list: it renders nothing, and nothing may come before the list.
  return sheet ? (
    <View style={styles.root}>
      {list}
      {selectionHeader}
    </View>
  ) : (
    <TabScreen title="Queue" below={picker}>
      {list}
      {selectionHeader}
    </TabScreen>
  );
}

/**
 * A row as Musicolet draws one in a queue: the song's place in the queue where other lists put
 * album art, the title over artist and album, then the length and the drag handle. Dropping the
 * art keeps the rows short, so a queue of hundreds reads as a list of numbers rather than a wall
 * of covers. The playing song takes the accent, with a bar down its side and a waveform for its
 * number.
 */
function QueueRow({
  track,
  index,
  current,
  playing,
  checked,
  handle,
  onPress,
  onLongPress,
}: {
  track: Track;
  index: number;
  current: boolean;
  playing: boolean;
  /** Undefined outside multi-select; the check replaces the length and the handle inside it. */
  checked?: boolean;
  handle: ReactElement;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const density = useDensity();
  const subtitle = [track.artist, track.album].filter(Boolean).join(' · ') || track.folder || 'Unknown';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: density.paddingVertical, minHeight: density.minHeight },
        current && styles.currentRow,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={playing ? { selected: true } : undefined}
      accessibilityLabel={`${index + 1}. ${track.title}, ${subtitle}`}
    >
      <View style={styles.index}>
        {current ? (
          <SymbolView name="waveform" size={16} tintColor={colors.tint} />
        ) : (
          <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[type.body, { color: current ? colors.tint : colors.label }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      </View>
      {checked === undefined ? (
        <View style={styles.trailing}>
          <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>{formatDuration(track.duration_ms)}</Text>
          {handle}
        </View>
      ) : (
        <View style={styles.check}>
          <SymbolView
            name={checked ? 'checkmark.circle.fill' : 'circle'}
            size={22}
            tintColor={checked ? colors.tint : colors.tertiaryLabel}
          />
        </View>
      )}
    </Pressable>
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
  pickerRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondaryBackground,
  },
  // The left border is always there, transparent off the playing song, so no row shifts sideways
  // when the song changes.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  currentRow: { backgroundColor: colors.secondaryBackground, borderLeftColor: colors.tint },
  index: { minWidth: 26, alignItems: 'flex-end' },
  rowText: { flex: 1, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  check: { width: 28, alignItems: 'flex-end' },
}));
