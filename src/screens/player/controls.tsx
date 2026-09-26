import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { artSource } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { makeStyles, spacing, type, useTheme } from '@/theme';

/** The pieces of the player that look like Spotify's. The screen lays them out. */

const PLAY = 64;

/**
 * The artwork, blurred, behind everything: the colour wash Spotify takes from the cover. A scrim
 * keeps text legible, and a fade darkens the lower half, where the cards scroll.
 */
export function Backdrop({ artKey }: { artKey: string | null }) {
  const styles = useStyles();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={artSource(artKey)} blurRadius={60} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={[StyleSheet.absoluteFill, styles.fade]} />
    </View>
  );
}

/** Close on the left, "Playing from" the queue in the middle, the song's menu on the right. */
export function PlayerHeader({
  from,
  detail,
  onClose,
  onFrom,
  onMore,
}: {
  from: string;
  detail: string;
  onClose: () => void;
  onFrom: () => void;
  onMore: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.header}>
      <IconButton name="chevron.down" size={20} onPress={onClose} accessibilityLabel="Close the player" />
      <Pressable
        onPress={onFrom}
        style={({ pressed }) => [styles.headerMiddle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Playing from ${from}, ${detail}`}
        accessibilityHint="Switches to another queue"
      >
        <Text style={[type.caption, styles.eyebrow]}>PLAYING FROM QUEUE</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: colors.label, fontWeight: '700' }]}>
          {from} · {detail}
        </Text>
      </Pressable>
      <IconButton name="ellipsis" size={20} onPress={onMore} accessibilityLabel="More for this song" />
    </View>
  );
}

/** The big round button: a filled circle in the text colour, the glyph cut out of it. */
export function PlayButton({ playing, onPress, size = PLAY }: { playing: boolean; onPress: () => void; size?: number }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      hitSlop={spacing.sm}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.label, alignItems: 'center', justifyContent: 'center' },
        pressed && { transform: [{ scale: 0.94 }] },
      ]}
    >
      {/* The play triangle sits a touch right of centre, where it looks centred. */}
      <SymbolView
        name={playing ? 'pause.fill' : 'play.fill'}
        size={size * 0.42}
        tintColor={colors.background}
        style={playing ? undefined : { marginLeft: size * 0.06 }}
      />
    </Pressable>
  );
}

/** Shuffle and repeat: accent-coloured with a dot under them while on, as Spotify marks them. */
export function ModeButton({
  name,
  active,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  name: SFSymbol;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.mode}>
      <IconButton
        name={name}
        size={22}
        color={active ? colors.tint : colors.label}
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
      />
      <View style={[styles.dot, { opacity: active ? 1 : 0 }]} />
    </View>
  );
}

/**
 * Spotify's add button beside the title: a plus while the song is not a favourite, a filled check
 * once it is. Held, it offers the playlists, as Spotify's "Save in" does.
 */
export function FavoriteButton({ favorite, onPress, onLongPress }: { favorite: boolean; onPress: () => void; onLongPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={spacing.md}
      accessibilityRole="button"
      accessibilityLabel={favorite ? 'In favorites. Remove' : 'Add to favorites'}
      accessibilityHint="Hold to add to a playlist"
      style={({ pressed }) => pressed && { opacity: 0.5 }}
    >
      <SymbolView
        name={favorite ? 'checkmark.circle.fill' : 'plus.circle'}
        size={28}
        tintColor={favorite ? colors.tint : colors.label}
        weight="regular"
      />
    </Pressable>
  );
}

export interface Pill {
  key: string;
  icon: SFSymbol;
  text: string;
  onPress: () => void;
  accessibilityLabel: string;
}

/** What is changing the playback right now (sleep timer, A–B repeat, speed, equalizer), tappable. */
export function StatusPills({ pills }: { pills: Pill[] }) {
  const styles = useStyles();
  const colors = useTheme();
  if (pills.length === 0) return null;
  return (
    <View style={styles.pills}>
      {pills.map((p) => (
        <Pressable
          key={p.key}
          onPress={p.onPress}
          accessibilityRole="button"
          accessibilityLabel={p.accessibilityLabel}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        >
          <SymbolView name={p.icon} size={12} tintColor={colors.tint} weight="semibold" />
          <Text style={[type.caption, { color: colors.label, fontWeight: '600' }]}>{p.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  scrim: { backgroundColor: colors.background, opacity: 0.35 },
  fade: {
    experimental_backgroundImage: [
      {
        type: 'linear-gradient',
        direction: 'to bottom',
        colorStops: [
          { color: 'transparent', positions: ['0%'] },
          { color: 'transparent', positions: ['25%'] },
          { color: colors.background, positions: ['100%'] },
        ],
      },
    ],
    opacity: 0.9,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, minHeight: 44 },
  headerMiddle: { flex: 1, alignItems: 'center', gap: 1 },
  eyebrow: { color: colors.secondaryLabel, letterSpacing: 1, fontSize: 10, fontWeight: '600' },
  pressed: { opacity: 0.5 },
  mode: { alignItems: 'center', gap: 3, paddingTop: 7 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.tint },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
}));
