import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SymbolView } from '@/components/symbol';
import type { Track } from '@/db/types';
import { useSelection } from '@/hooks/use-selection';
import { queue, useCurrentTrack } from '@/player/queue-store';
import { useTheme } from '@/theme';
import type { MenuItem } from './menus';
import { useSelectionHeader } from './selection-header';
import { useTrackActions } from './track-actions';
import { TrackRow } from './track-row';

/** A row that is not a track, listed before the tracks: a subfolder, in the folder view. */
export interface LeadingRow {
  key: string;
  element: ReactElement;
}

type Row = { kind: 'leading'; row: LeadingRow } | { kind: 'track'; track: Track; index: number };

interface Props {
  tracks: Track[];
  header?: ReactElement | null;
  leading?: LeadingRow[];
  empty?: ReactElement | null;
  showNumber?: boolean;
  /** Tap on a track. Defaults to playing the list from there, replacing the queue. */
  onPlay?: (index: number) => void;
  /** Extra long-press items for one track, e.g. "Remove from playlist". */
  menuExtra?: (index: number) => MenuItem[];
  /** Extra batch items for a selection (ascending indexes). */
  batchExtra?: (indexes: number[]) => MenuItem[];
  /** The screen's own actions, shown as an ellipsis button in the header. */
  onMenu?: () => void;
  /** Shown in a row in place of the song's length, e.g. its play count. */
  badge?: (index: number) => ReactElement | null;
}

/**
 * Every list of songs: tap plays from that row, long press opens the track menu, and "Select"
 * (in the header, or from the menu) switches to multi-select with batch actions. The header
 * buttons belong to this list, so a screen hands its own through `onMenu`.
 */
export function TrackList({ tracks, header, leading, empty, showNumber, onPlay, menuExtra, batchExtra, onMenu, badge }: Props) {
  const colors = useTheme();
  const selection = useSelection(tracks);
  const actions = useTrackActions();
  const current = useCurrentTrack();

  useSelectionHeader({
    selection,
    count: tracks.length,
    onMenu,
    onActions: () => {
      const indexes = selection.indexes();
      actions.batchMenu(
        indexes.map((i) => tracks[i]),
        batchExtra?.(indexes),
      );
    },
  });

  const openMenu = (track: Track, index: number) =>
    actions.trackMenu(track, { extra: menuExtra?.(index), onSelect: () => selection.start(index) });

  const play = useCallback(
    (index: number) => (onPlay ? onPlay(index) : void queue.replace(tracks, index)),
    [onPlay, tracks],
  );

  const extraData = useMemo(() => [selection, current], [selection, current]);
  const rows = useMemo<Row[]>(
    () => [
      ...(leading ?? []).map((row) => ({ kind: 'leading' as const, row })),
      ...tracks.map((track, index) => ({ kind: 'track' as const, track, index })),
    ],
    [leading, tracks],
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => (r.kind === 'leading' ? `l:${r.row.key}` : `t:${r.track.id}:${r.index}`)}
      extraData={extraData}
      // Every mounted row re-renders when the playing song changes (its highlight moves), so this
      // keeps five screens either side rather than FlatList's ten: a shuffle of a long library
      // re-renders a hundred rows, not a few hundred.
      windowSize={11}
      renderItem={({ item }) => {
        if (item.kind === 'leading') return item.row.element;
        const { track, index } = item;
        const checked = selection.selected.has(index);
        return (
          <TrackRow
            track={track}
            showNumber={showNumber}
            active={current?.id === track.id}
            badge={badge?.(index)}
            trailing={
              selection.active ? (
                <View style={styles.check}>
                  <SymbolView
                    name={checked ? 'checkmark.circle.fill' : 'circle'}
                    size={22}
                    tintColor={checked ? colors.tint : colors.tertiaryLabel}
                  />
                </View>
              ) : undefined
            }
            onPress={() => (selection.active ? selection.toggle(index) : play(index))}
            onLongPress={() => (selection.active ? selection.toggle(index) : openMenu(track, index))}
            onMore={selection.active ? undefined : () => openMenu(track, index)}
          />
        );
      }}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      // A header can hold a find field: the first tap on a row plays it rather than only closing
      // the keyboard.
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  check: { width: 28, alignItems: 'flex-end' },
});
