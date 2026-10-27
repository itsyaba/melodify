import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';

/**
 * The Material 3 Expressive player. Google's media shapes, not Spotify's: a small top bar over a
 * large rounded cover, the song set left under it, the wavy seek bar with the time in mono either
 * side, and a group of three round keys where the play button is a circle while paused and a
 * squircle while playing. Everything else on the screen is a tonal button: a filled pill when it
 * is on, an outlined one when it is off.
 *
 * Sources for the shapes: Material 3 Expressive's media player and Android Auto's redesigned one.
 */

const KEY = 56;
const PLAY = 76;
/** The play key's corner radius: a circle paused, a squircle playing, animated between. */
const PLAY_ROUND = PLAY / 2;
const PLAY_SQUIRCLE = 24;

/** The top bar: a tonal close key, the queue this came from in the middle, the song's menu. */
export function MaterialTopBar({
  from,
  index,
  total,
  onClose,
  onFrom,
  onMore,
}: {
  from: string;
  index: number;
  total: number;
  onClose: () => void;
  onFrom: () => void;
  onMore: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.topBar}>
      <ToneButton name="chevron.down" onPress={onClose} accessibilityLabel="Close the player" size={44} />
      <Pressable
        onPress={onFrom}
        style={({ pressed }) => [styles.from, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Playing from ${from}, ${index} of ${total}`}
        accessibilityHint="Switches to another queue"
      >
        <Text numberOfLines={1} style={[type.caption, styles.fromLabel]}>Playing from</Text>
        <View style={styles.fromRow}>
          <Text numberOfLines={1} style={[type.footnote, styles.fromName]}>{from}</Text>
          <Text style={[type.caption, styles.fromCount]}>
            {index}/{total}
          </Text>
          <SymbolView name="chevron.down" size={10} tintColor={colors.secondaryLabel} weight="semibold" />
        </View>
      </Pressable>
      <ToneButton name="ellipsis" onPress={onMore} accessibilityLabel="More for this song" size={44} />
    </View>
  );
}

/**
 * Material's icon button in its three states: filled with the accent when it is on, a tonal
 * surface when it is off, and transparent for the plain ones in the top bar.
 */
export function ToneButton({
  name,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  active = false,
  filled = false,
  disabled = false,
  size = 48,
  icon = 20,
}: {
  name: SFSymbol;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  active?: boolean;
  /** A tonal surface behind it even when off: the transport's previous and next keys. */
  filled?: boolean;
  disabled?: boolean;
  size?: number;
  icon?: number;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const background = active ? colors.tint : filled ? colors.fill : 'transparent';
  const tint = active ? colors.onTint : disabled ? colors.tertiaryLabel : colors.label;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.tone,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name={name} size={icon} tintColor={tint} weight="semibold" />
    </Pressable>
  );
}

/** The song: title in the headline size, artist and album under it, the heart as a tonal key. */
export function MaterialTitle({
  title,
  artist,
  album,
  onTitle,
  onArtist,
  favorite,
  onFavorite,
  onFavoriteLong,
  compact = false,
  leading,
}: {
  title: string;
  artist: string | null;
  album: string | null;
  onTitle?: () => void;
  onArtist?: () => void;
  favorite: boolean;
  onFavorite: () => void;
  onFavoriteLong: () => void;
  /** Small, for the row the lyrics push it into: the cover shrinks to a thumbnail beside it. */
  compact?: boolean;
  leading?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.titleRow}>
      {leading}
      <View style={styles.titleText}>
        <Text
          numberOfLines={compact ? 1 : 2}
          onPress={onTitle}
          accessibilityRole={onTitle ? 'link' : 'header'}
          accessibilityHint={onTitle ? 'Goes to the album' : undefined}
          style={compact ? styles.titleSmall : styles.title}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          onPress={onArtist}
          accessibilityRole={onArtist ? 'link' : 'text'}
          accessibilityHint={onArtist ? 'Goes to the artist' : undefined}
          style={compact ? styles.subtitleSmall : styles.subtitle}
        >
          {[artist, album].filter(Boolean).join(' · ') || 'Unknown artist'}
        </Text>
      </View>
      <ToneButton
        name={favorite ? 'heart.fill' : 'heart'}
        onPress={onFavorite}
        onLongPress={onFavoriteLong}
        active={favorite}
        filled={!favorite && !compact}
        size={compact ? 44 : 52}
        icon={compact ? 20 : 22}
        accessibilityLabel={favorite ? 'In favorites. Remove' : 'Add to favorites'}
        accessibilityHint="Hold to add to a playlist"
      />
    </View>
  );
}

/** The times under the wave, in mono as Material sets them: elapsed on the left, total on the right. */
export function MaterialTimes({ positionMs, durationMs }: { positionMs: number; durationMs: number }) {
  const styles = useStyles();
  return (
    <View style={styles.times}>
      <Text style={[type.caption, styles.time]}>{formatDuration(positionMs)}</Text>
      <Text style={[type.caption, styles.time]}>{durationMs > 0 ? formatDuration(durationMs) : '--:--'}</Text>
    </View>
  );
}

/**
 * The transport as Material's button group: previous and next on tonal keys either side of the
 * play key, which is filled with the accent and changes shape as it changes state — a circle
 * standing still, a squircle while the song runs.
 */
export function MaterialTransport({
  playing,
  onToggle,
  onPrevious,
  onNext,
  onPreviousHold,
  onNextHold,
  onHoldEnd,
  canPrevious,
  canNext,
  left,
  right,
}: {
  playing: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPreviousHold: () => void;
  onNextHold: () => void;
  onHoldEnd: () => void;
  canPrevious: boolean;
  canNext: boolean;
  left: ReactNode;
  right: ReactNode;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const morph = useRef(new Animated.Value(playing ? 1 : 0)).current;

  useEffect(() => {
    const run = Animated.timing(morph, {
      toValue: playing ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      // A corner radius cannot be driven natively, and it is one view changing.
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [playing, morph]);

  return (
    <View style={styles.transport}>
      {left}
      <ToneButton
        name="backward.fill"
        onPress={onPrevious}
        onLongPress={onPreviousHold}
        filled
        size={KEY}
        icon={24}
        disabled={!canPrevious}
        accessibilityLabel="Previous track"
        accessibilityHint="Hold to rewind"
      />
      <Pressable
        onPress={onToggle}
        onPressOut={onHoldEnd}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        style={({ pressed }) => [styles.playWrap, pressed && styles.playPressed]}
      >
        <Animated.View
          style={[
            styles.play,
            {
              backgroundColor: colors.tint,
              borderRadius: morph.interpolate({ inputRange: [0, 1], outputRange: [PLAY_ROUND, PLAY_SQUIRCLE] }),
            },
          ]}
        >
          <SymbolView
            name={playing ? 'pause.fill' : 'play.fill'}
            size={30}
            tintColor={colors.onTint}
            style={playing ? undefined : { marginLeft: 3 }}
          />
        </Animated.View>
      </Pressable>
      <ToneButton
        name="forward.fill"
        onPress={onNext}
        onLongPress={onNextHold}
        filled
        size={KEY}
        icon={24}
        disabled={!canNext}
        accessibilityLabel="Next track"
        accessibilityHint="Hold to fast-forward"
      />
      {right}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs, minHeight: 48 },
  from: { flex: 1, alignItems: 'center', gap: 1 },
  fromLabel: { color: colors.secondaryLabel },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fromName: { color: colors.label, fontWeight: '600' },
  fromCount: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
  tone: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleText: { flex: 1, gap: 4 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '700', color: colors.label },
  titleSmall: { fontSize: 17, lineHeight: 21, fontWeight: '700', color: colors.label },
  subtitleSmall: { ...type.footnote, color: colors.secondaryLabel },
  subtitle: { ...type.subhead, color: colors.secondaryLabel },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.xs },
  time: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  playWrap: { alignItems: 'center', justifyContent: 'center' },
  playPressed: { transform: [{ scale: 0.95 }] },
  play: {
    width: PLAY,
    height: PLAY,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
