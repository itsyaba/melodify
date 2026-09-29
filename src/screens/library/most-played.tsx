import { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ListToolbar } from '@/components/list-toolbar';
import { PeriodCards } from '@/components/period-cards';
import { useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { PLAY_PERIODS, type MostPlayed, type PlayPeriod } from '@/db/plays';
import { listMostPlayed, summarizePlays } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { useStoredChoice } from '@/hooks/use-stored-choice';
import { queue } from '@/player/queue-store';
import { makeStyles, radius, spacing, type } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const NOTHING: MostPlayed = { tracks: [], plays: [] };

/**
 * Most played over a span, picked on five cards: the last week, month, six months or year, and
 * all time across the foot. Each card holds how many songs were played in it and the covers of the
 * most played, and each song in the list shows how many times it was played in the span.
 */
export function MostPlayedScreen() {
  const styles = useStyles();
  const actions = useTrackActions();
  const [period, setPeriod] = useStoredChoice<PlayPeriod>('played.period', 'month', PLAY_PERIODS);
  const span = PLAY_PERIODS.find((p) => p.key === period) ?? PLAY_PERIODS[1];

  const { data: summary, refresh: refreshSummary } = useLibraryQuery(summarizePlays, []);
  const { data, refresh } = useLibraryQuery((db) => listMostPlayed(db, span.days), [span.days]);
  // Plays are counted without telling the lists, so both are read again whenever this comes back.
  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshSummary();
    }, [refresh, refreshSummary]),
  );
  const { tracks, plays } = data ?? NOTHING;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  const title = span.days === null ? 'Most played' : `Most played, ${span.label.toLowerCase()}`;
  const options = PLAY_PERIODS.map((p) => ({
    key: p.key,
    label: p.label,
    count: summary?.counts[p.key],
    covers: summary?.covers[p.key] ?? [],
  }));

  return (
    <View style={styles.root}>
      <TrackList
        tracks={tracks}
        badge={(i) => (
          <View style={styles.badge}>
            <Text style={[type.caption, styles.badgeText]}>{formatCount(plays[i] ?? 0, 'play')}</Text>
          </View>
        )}
        header={
          <View>
            <PeriodCards options={options} value={span.key} onChange={setPeriod} />
            {tracks.length ? (
              <ListToolbar
                summary={`${formatCount(tracks.length, 'song')} · ${formatDuration(total)}`}
                onShuffle={() => void queue.playShuffled(tracks)}
                onPlay={() => void queue.replace(tracks, 0)}
              />
            ) : null}
          </View>
        }
        empty={
          data ? (
            span.days === null ? (
              <EmptyState title="Nothing played yet" body="A song counts as played at half way, or four minutes in." />
            ) : (
              <EmptyState
                title={`Nothing played in the ${span.label.toLowerCase()}`}
                body="Pick a longer span. Plays from before this update only count toward All time."
              />
            )
          ) : null
        }
        onMenu={tracks.length ? () => actions.collectionMenu(title, async () => tracks) : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.fill,
  },
  badgeText: { color: colors.tint, fontWeight: '700', fontVariant: ['tabular-nums'] },
}));
