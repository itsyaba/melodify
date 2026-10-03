import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { Artwork } from '@/components/artwork';
import type { PlaylistCard as Playlist } from '@/db/playlists';
import type { AlbumSummary, GroupSummary } from '@/db/types';
import { face } from '@/screens/onboarding/fonts';
import { makeStyles, PLAYLIST_BADGE, PLAYLIST_BANDS, radius, spacing, type, useTheme, type CardLook } from '@/theme';
import { formatCount } from '@/utils/format';

export const CARD_HEIGHT = 196;
export const CARD_RADIUS = 28;
const CARD_ART = 118;
const CARD_PLAY = 56;
const PLAY = 34;
const ROW_ART = 64;
const ROW_PLAY = 40;

/** A diagonal linear gradient between two colors, as a View style. */
export function sweep([from, to]: readonly [string, string]) {
  return {
    experimental_backgroundImage: [
      {
        type: 'linear-gradient' as const,
        direction: '135deg',
        colorStops: [
          { color: from, positions: ['0%'] },
          { color: to, positions: ['100%'] },
        ],
      },
    ],
  };
}

export interface CardAction {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
}

interface HeroProps {
  look: CardLook;
  title: string;
  /** Two lines at most, under the title. */
  body: string;
  /** A short line over the title, such as "Now playing". */
  eyebrow?: string;
  eyebrowIcon?: SFSymbol;
  /** The cover on the right; the icon stands in while there is none. */
  artKey: string | null;
  /** Several covers fanned out like a hand of cards, for a card that stands for many albums. */
  covers?: readonly string[];
  icon: SFSymbol;
  width: number;
  /** The big round button. Left out, the card has none (Bookmarks only opens). */
  play?: CardAction;
  /** Smaller buttons in the ink color beside it. */
  actions?: readonly CardAction[];
  /** Drawn under everything, such as the song's own cover blurred. */
  backdrop?: ReactNode;
  /** Drawn over everything along the bottom edge, such as a progress line. */
  footer?: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * One of Home's big cards, a page wide less a peek of the next: a title and a line or two on a
 * colored fill, a big round play button with a few smaller ones beside it, and a cover on the right.
 */
export function HeroCard(p: HeroProps) {
  const { look } = p;
  return (
    <Pressable
      onPress={p.onPress}
      onLongPress={p.onLongPress}
      accessibilityRole="button"
      accessibilityLabel={p.accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        { width: p.width, backgroundColor: look.fill },
        look.gradient && sweep(look.gradient),
        pressed && styles.pressed,
      ]}
    >
      {p.backdrop}
      <View style={styles.cardArt}>
        {p.covers?.length ? (
          <CoverFan covers={p.covers} edge={look.ink} />
        ) : p.artKey ? (
          <Artwork artKey={p.artKey} size={CARD_ART} rounded="lg" />
        ) : (
          <View style={[styles.cardIcon, { borderColor: look.muted }]}>
            <SymbolView name={p.icon} size={44} tintColor={look.ink} />
          </View>
        )}
      </View>
      <View style={styles.cardText}>
        {p.eyebrow ? (
          <View style={styles.eyebrow}>
            {p.eyebrowIcon ? <SymbolView name={p.eyebrowIcon} size={12} tintColor={look.muted} /> : null}
            <Text numberOfLines={1} style={[type.caption, styles.eyebrowText, { color: look.muted }]}>{p.eyebrow}</Text>
          </View>
        ) : null}
        <Text numberOfLines={p.eyebrow ? 1 : 2} style={[styles.cardTitle, face('semibold'), { color: look.ink }]}>{p.title}</Text>
        <Text numberOfLines={2} style={[type.subhead, { color: look.muted }]}>{p.body}</Text>
      </View>
      <View style={styles.cardButtons}>
        {p.play ? (
          <Pressable
            onPress={p.play.onPress}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={p.play.label}
            style={({ pressed }) => [
              styles.cardPlay,
              { backgroundColor: look.button },
              p.play!.icon === 'play.fill' && styles.nudge,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView name={p.play.icon} size={22} tintColor={look.buttonInk} />
          </Pressable>
        ) : null}
        {p.actions?.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}
          >
            <SymbolView name={a.icon} size={21} tintColor={look.ink} />
          </Pressable>
        ))}
      </View>
      {p.footer}
    </Pressable>
  );
}

const FAN_ART = 86;
/** Back left, back right, then the front one, which is drawn last so it sits on top. */
const FAN = [
  { x: -20, y: 6, turn: '-13deg', scale: 0.9 },
  { x: 20, y: 6, turn: '13deg', scale: 0.9 },
  { x: 0, y: -4, turn: '0deg', scale: 1 },
] as const;

/**
 * Up to three covers fanned out in the card's art box, each in a thin frame of the card's ink,
 * like prints dealt onto the table. The first cover goes in front.
 */
function CoverFan({ covers, edge }: { covers: readonly string[]; edge: CardLook['ink'] }) {
  // The front slot takes the first cover; the back slots fill in as there are more.
  const dealt = covers.length === 1 ? [FAN[2]] : covers.length === 2 ? [FAN[0], FAN[2]] : FAN;
  const order = covers.length === 1 ? [0] : covers.length === 2 ? [1, 0] : [1, 2, 0];
  return (
    <View style={styles.fan}>
      {dealt.map((slot, i) => (
        <View
          key={slot.turn}
          style={[
            styles.fanCover,
            { borderColor: edge, backgroundColor: edge },
            { transform: [{ translateX: slot.x }, { translateY: slot.y }, { rotate: slot.turn }, { scale: slot.scale }] },
          ]}
        >
          <Artwork artKey={covers[order[i]]} size={FAN_ART - 4} rounded="sm" />
        </View>
      ))}
    </View>
  );
}

interface RowProps {
  artKey: string | null;
  title: string;
  /** Who made it: shown after "By", in the label's color. */
  by: string;
  /** After the name and a dot: the song's length, or how many songs. */
  detail: string;
  /** The song playing now: its name in the accent, a waveform in the round button. */
  current?: boolean;
  /** The round button on the right; the row itself opens. */
  playLabel: string;
  onPlay: () => void;
  onPress: () => void;
  onLongPress: () => void;
}

/** A song or an album as a roomy row: a big rounded cover, its name, who made it, and a play button. */
export function MediaRow({ artKey, title, by, detail, current, playLabel, onPlay, onPress, onLongPress }: RowProps) {
  const themed = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} by ${by}, ${detail}`}
      accessibilityState={{ selected: !!current }}
      style={({ pressed }) => [themed.row, pressed && themed.rowPressed]}
    >
      <Artwork artKey={artKey} size={ROW_ART} rounded="lg" />
      <View style={themed.rowText}>
        <Text numberOfLines={1} style={[themed.rowTitle, face('semibold'), current && { color: colors.tint }]}>{title}</Text>
        <Text numberOfLines={1} style={[type.footnote, themed.secondary]}>
          By <Text style={themed.by}>{by}</Text>
          {`  •  ${detail}`}
        </Text>
      </View>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={playLabel}
        style={({ pressed }) => [themed.rowPlay, !current && styles.nudge, pressed && styles.pressed]}
      >
        <SymbolView name={current ? 'waveform' : 'play.fill'} size={15} tintColor={current ? colors.tint : colors.label} />
      </Pressable>
    </Pressable>
  );
}

interface AlbumProps {
  album: AlbumSummary;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
  /** The round button on the cover: plays the album without opening it. */
  onPlay: () => void;
}

/** A square cover with a play button in its corner, and the album and artist under it. */
export function AlbumCard({ album, size, onPress, onLongPress, onPlay }: AlbumProps) {
  const themed = useStyles();
  const colors = useTheme();
  return (
    <View style={{ width: size }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${album.album}${album.album_artist ? ` by ${album.album_artist}` : ''}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Artwork artKey={album.art_key} size={size} rounded="lg" />
        <Text numberOfLines={1} style={[type.subhead, themed.strong, themed.under]}>{album.album}</Text>
        <Text numberOfLines={1} style={[type.footnote, themed.secondary]}>{album.album_artist ?? 'Unknown artist'}</Text>
      </Pressable>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Play ${album.album}`}
        style={({ pressed }) => [themed.play, styles.nudge, { top: size - PLAY - spacing.sm }, pressed && styles.pressed]}
      >
        <SymbolView name="play.fill" size={14} tintColor={colors.onTint} />
      </Pressable>
    </View>
  );
}

/** "Bob Marley, Teddy Afro and more", or the song count for a playlist with no artists. */
export function playlistBlurb(p: Playlist, named = 3): string {
  if (!p.artists.length) return p.track_count ? formatCount(p.track_count, 'song') : 'Empty playlist';
  const shown = p.artists.slice(0, named);
  if (p.artists.length > named) return `${shown.join(', ')} and more`;
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

interface PlaylistProps {
  playlist: Playlist;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * A playlist as Spotify draws its mixes: the cover, a small badge in the top corner, and the name
 * on a bright band across the lower left, with a sliver of the same color before it. The artists
 * it holds most of go under the cover. A playlist without a cover is the band's color throughout.
 */
export function PlaylistTile({ playlist, size, onPress, onLongPress }: PlaylistProps) {
  const themed = useStyles();
  const band = PLAYLIST_BANDS[playlist.id % PLAYLIST_BANDS.length];
  const blurb = playlistBlurb(playlist);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, ${blurb}`}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
    >
      <View style={[styles.mixCover, { width: size, height: size, backgroundColor: band.fill }]}>
        {playlist.art_key ? (
          <Artwork artKey={playlist.art_key} size={size} rounded="none" />
        ) : (
          <View style={styles.mixEmpty}>
            <SymbolView name="music.note.list" size={size * 0.34} tintColor={band.ink} />
          </View>
        )}
        <View style={styles.mixBadge}>
          <SymbolView name="music.note" size={11} tintColor={PLAYLIST_BADGE.ink} weight="bold" />
        </View>
        <View style={[styles.mixBand, { bottom: size * 0.09, maxWidth: size - spacing.md }]}>
          <View style={[styles.mixSliver, { backgroundColor: band.fill }]} />
          <View style={[styles.mixLabel, { backgroundColor: band.fill }]}>
            <Text numberOfLines={1} style={[styles.mixName, face('semibold'), { color: band.ink }]}>{playlist.name}</Text>
          </View>
        </View>
      </View>
      <Text numberOfLines={2} style={[type.footnote, themed.secondary, themed.under]}>{blurb}</Text>
    </Pressable>
  );
}

interface ArtistProps {
  artist: GroupSummary;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
}

/** An artist as a round picture (the cover of one of their songs) with the name under it. */
export function ArtistCircle({ artist, size, onPress, onLongPress }: ArtistProps) {
  const themed = useStyles();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={artist.name}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
    >
      <Artwork artKey={artist.art_key} size={size} rounded="full" />
      <Text numberOfLines={1} style={[type.footnote, themed.strong, themed.under, themed.centered]}>{artist.name}</Text>
    </Pressable>
  );
}

/** A round button over Home's header: settings, search, favorites. */
export function RoundButton({ icon, label, size, onPress }: { icon: SFSymbol; label: string; size: number; onPress: () => void }) {
  const themed = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [themed.round, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}
    >
      <SymbolView name={icon} size={20} tintColor={colors.label} />
    </Pressable>
  );
}

// The card's colors come from its look, the same in every theme, so these need no rebuild.
const styles = StyleSheet.create({
  card: { height: CARD_HEIGHT, borderRadius: CARD_RADIUS, overflow: 'hidden', padding: spacing.lg + 4 },
  cardText: { gap: 4, marginRight: CARD_ART + spacing.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrowText: { fontWeight: '600' },
  cardTitle: { fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
  cardArt: {
    position: 'absolute',
    right: spacing.lg,
    top: (CARD_HEIGHT - CARD_ART) / 2,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fan: { width: CARD_ART, height: CARD_ART, alignItems: 'center', justifyContent: 'center' },
  fanCover: {
    position: 'absolute',
    width: FAN_ART,
    height: FAN_ART,
    padding: 2,
    borderRadius: radius.sm + 2,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardIcon: {
    width: CARD_ART,
    height: CARD_ART,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtons: { position: 'absolute', left: spacing.lg + 4, bottom: spacing.lg + 4, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardPlay: {
    width: CARD_PLAY,
    height: CARD_PLAY,
    borderRadius: CARD_PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mixCover: { borderRadius: radius.sm, overflow: 'hidden' },
  mixEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.35 },
  mixBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PLAYLIST_BADGE.fill,
  },
  mixBand: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  mixSliver: { width: 5 },
  mixLabel: { flexShrink: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  mixName: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  // A play triangle looks off-centre when it is centred exactly.
  nudge: { paddingLeft: 3 },
  pressed: { opacity: 0.7 },
});

const useStyles = makeStyles((colors) => ({
  strong: { color: colors.label, fontWeight: '600' },
  secondary: { color: colors.secondaryLabel },
  by: { color: colors.label },
  under: { marginTop: spacing.sm },
  centered: { textAlign: 'center' },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  play: {
    position: 'absolute',
    right: spacing.sm,
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.fill },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, lineHeight: 21, color: colors.label },
  rowPlay: {
    width: ROW_PLAY,
    height: ROW_PLAY,
    borderRadius: ROW_PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryBackground,
  },
}));
