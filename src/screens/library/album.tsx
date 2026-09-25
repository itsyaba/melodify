import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { groupHref, tagsHref, useTrackActions } from '@/components/track-actions';
import { TrackList } from '@/components/track-list';
import { listAlbumTracks } from '@/db/tracks';
import type { Track } from '@/db/types';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { queue } from '@/player/queue-store';
import { canEditTags } from '@/tags';
import { artSize, spacing, type, useTheme } from '@/theme';
import { formatCount, formatDuration } from '@/utils/format';

const NO_TRACKS: Track[] = [];

export function AlbumScreen({ album, albumArtist }: { album: string; albumArtist: string | null }) {
  const colors = useTheme();
  const router = useRouter();
  const actions = useTrackActions();
  const { data } = useLibraryQuery((db) => listAlbumTracks(db, album, albumArtist), [album, albumArtist]);
  const tracks = data ?? NO_TRACKS;
  const total = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0), [tracks]);
  const year = tracks.find((t) => t.year)?.year;

  const header = (
    <View style={styles.header}>
      <Artwork artKey={tracks.find((t) => t.art_key)?.art_key ?? null} size={artSize.card} rounded="lg" />
      <Text style={[type.title, { color: colors.label, textAlign: 'center' }]}>{album}</Text>
      <Pressable
        disabled={!albumArtist}
        onPress={() => albumArtist && router.push(groupHref('album_artist', albumArtist))}
        accessibilityRole="link"
      >
        <Text style={[type.subhead, { color: albumArtist ? colors.tint : colors.secondaryLabel }]}>
          {albumArtist ?? 'Unknown artist'}
        </Text>
      </Pressable>
      <Text style={[type.footnote, { color: colors.tertiaryLabel }]}>
        {[year, formatCount(tracks.length, 'song'), formatDuration(total)].filter(Boolean).join(' · ')}
      </Text>
      {tracks.length ? (
        <View style={styles.buttons}>
          <IconButton name="play.fill" color={colors.tint} onPress={() => void queue.replace(tracks, 0)} accessibilityLabel="Play album" />
          <IconButton name="shuffle" color={colors.tint} onPress={() => void queue.playShuffled(tracks)} accessibilityLabel="Shuffle album" />
        </View>
      ) : null}
    </View>
  );

  return (
    <TrackList
      tracks={tracks}
      header={header}
      showNumber
      onMenu={() =>
        actions.collectionMenu(album, (db) => listAlbumTracks(db, album, albumArtist), [
          { label: 'Edit album tags…', hidden: !canEditTags() || tracks.length === 0, onPress: () => router.push(tagsHref(tracks)) },
        ])
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  buttons: { flexDirection: 'row', gap: spacing.xxl, paddingTop: spacing.sm },
});
