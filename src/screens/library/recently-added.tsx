import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ListToolbar } from '@/components/list-toolbar';
import { PeriodCards } from '@/components/period-cards';
import { useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { ADDED_PERIODS, type AddedPeriod } from '@/db/added';
import { listRecentlyAdded, summarizeRecentlyAdded } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useStoredChoice } from '@/hooks/use-stored-choice';
import { useTrackSort } from '@/hooks/use-track-sort';
import { queue } from '@/player/queue-store';
import { makeStyles } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const NO_TRACKS: Track[] = [];

/**
 * Recently added, as Musicolet has it: four cards, two by two, pick the span (the last 7, 30 or
 * 60 days, or all time), each with how many songs it holds and its newest covers, and the list
 * below shows the songs that arrived inside it, newest first. The span is remembered.
 */
export function RecentlyAddedScreen() {
  const styles = useStyles();
  const actions = useTrackActions();
  const [period, setPeriod] = useStoredChoice<AddedPeriod>('recent.period', '30', ADDED_PERIODS);
  const span = ADDED_PERIODS.find((p) => p.key === period) ?? ADDED_PERIODS[1];

  const { data: summary, refresh: refreshSummary } = useLibraryQuery(summarizeRecentlyAdded, []);
  const { data, refresh } = useLibraryQuery((db) => listRecentlyAdded(db, span.days), [span.days]);
  // A scan may have added songs since, and the spans move on with the clock.
  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshSummary();
    }, [refresh, refreshSummary]),
  );
  const { tracks, sort } = useTrackSort('recent.songs', data ?? NO_TRACKS, { label: 'Recently added', same: 'added' });
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  const title = span.days === null ? 'Recently added' : `Added in the last ${span.label}`;
  const options = ADDED_PERIODS.map((p) => ({
    key: p.key,
    label: p.days === null ? p.label : `Last ${p.label}`,
    count: summary?.counts[p.key],
    covers: summary?.covers[p.key] ?? [],
  }));

  return (
    <View style={styles.root}>
      <TrackList
        tracks={tracks}
        header={
          <View>
            <PeriodCards options={options} value={span.key} onChange={setPeriod} />
            {tracks.length ? (
              <ListToolbar
                summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`}
                sort={sort}
                onShuffle={() => void queue.playShuffled(tracks)}
                onPlay={() => void queue.replace(tracks, 0)}
              />
            ) : null}
          </View>
        }
        empty={
          data ? (
            span.days === null ? (
              <EmptyState title="No songs yet" body="Songs appear here after a scan." />
            ) : (
              <EmptyState title={`Nothing added in the last ${span.label}`} body="Pick a longer span, or scan for new music." />
            )
          ) : null
        }
        onMenu={tracks.length ? () => actions.collectionMenu(title, async () => tracks) : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({ root: { flex: 1, backgroundColor: colors.background } }));
