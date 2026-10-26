import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useReduceMotion } from '@/screens/onboarding/art';
import { face } from '@/screens/onboarding/fonts';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';

/**
 * The Deck layout: the player as a record deck rather than a streaming app. The cover is a
 * sleeve, tilted and shadowed, with the record itself sliding out behind it and turning while the
 * song plays; the time is set in big numerals over a groove-marked rail; and the transport is one
 * plate of keys, with shuffle and repeat as lamps on its shoulders.
 *
 * Home draws its lists the same way — a record half out of its sleeve — so the player finishes a
 * motif the rest of the app already uses, instead of copying Spotify's centred square.
 */

/** One turn of the record. A 33⅓ rpm record turns once every 1.8 s; this is slowed for the eye. */
const SPIN_MS = 7200;
const SLEEVE_TILT = '-2.5deg';

export function DeckStage({ size, artKey, playing, sleeve }: { size: number; artKey: string | null; playing: boolean; sleeve: ReactNode }) {
  const styles = useStyles();
  const colors = useTheme();
  const reduceMotion = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const at = useRef(0);

  useEffect(() => {
    const id = spin.addListener(({ value }) => (at.current = value));
    return () => spin.removeListener(id);
  }, [spin]);

  // The record carries on from where it stopped rather than snapping back to the top of a turn.
  useEffect(() => {
    if (!playing || reduceMotion) return;
    let stopped = false;
    const turn = () => {
      Animated.timing(spin, {
        toValue: 1,
        duration: Math.max(200, SPIN_MS * (1 - at.current)),
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || stopped) return;
        spin.setValue(0);
        at.current = 0;
        turn();
      });
    };
    turn();
    return () => {
      stopped = true;
      spin.stopAnimation();
    };
  }, [playing, reduceMotion, spin]);

  const disc = size * 0.94;
  const label = disc * 0.34;
  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.disc,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            right: -disc * 0.3,
            top: (size - disc) / 2,
            transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
          },
        ]}
      >
        {/* The grooves: rings that catch the light the way a record's do. */}
        {[0.9, 0.76, 0.62, 0.48].map((scale) => (
          <View
            key={scale}
            style={[
              styles.groove,
              { width: disc * scale, height: disc * scale, borderRadius: (disc * scale) / 2, opacity: 0.1 + (1 - scale) * 0.12 },
            ]}
          />
        ))}
        <View style={[styles.sheen, { width: disc, height: disc, borderRadius: disc / 2 }]} />
        <View style={[styles.label, { width: label, height: label, borderRadius: label / 2, backgroundColor: colors.tint }]}>
          <Artwork artKey={artKey} size={label} rounded="full" />
          <View style={[styles.spindle, { backgroundColor: colors.background }]} />
        </View>
      </Animated.View>
      <View style={styles.sleeve}>{sleeve}</View>
    </View>
  );
}

/** The sleeve's tilt, applied around whatever the screen puts inside it (artwork or lyrics). */
export function DeckSleeve({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.tilt}>{children}</View>;
}

/**
 * The song, set as a record label is: the title large and in Outfit, the artist on a line of its
 * own with the album after it, and the favourite as a stamp at the end.
 */
export function DeckTitle({
  title,
  artist,
  album,
  onTitle,
  onArtist,
  trailing,
}: {
  title: string;
  artist: string | null;
  album: string | null;
  onTitle?: () => void;
  onArtist?: () => void;
  trailing: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text
          numberOfLines={2}
          onPress={onTitle}
          accessibilityRole={onTitle ? 'link' : 'header'}
          accessibilityHint={onTitle ? 'Goes to the album' : undefined}
          style={[styles.title, face('semibold')]}
        >
          {title}
        </Text>
        <View style={styles.underTitle}>
          <Pressable
            onPress={onArtist}
            disabled={!onArtist}
            accessibilityRole={onArtist ? 'link' : 'text'}
            style={({ pressed }) => [styles.artistChip, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[type.footnote, styles.artistText, face('medium')]}>{artist ?? 'Unknown artist'}</Text>
          </Pressable>
          {album ? <Text numberOfLines={1} style={[type.footnote, styles.album]}>{album}</Text> : null}
        </View>
      </View>
      {trailing}
    </View>
  );
}

/**
 * The time as a deck's counter: the position in big tabular numerals, what is left in small ones,
 * over the grooved rail the seek bar is drawn on.
 */
export function DeckCounter({ positionMs, durationMs, children }: { positionMs: number; durationMs: number; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.counter}>
      <View style={styles.counterRow}>
        <Text style={[styles.elapsed, face('semibold')]}>{formatDuration(positionMs)}</Text>
        <Text style={[type.footnote, styles.remaining]}>
          {durationMs > 0 ? `−${formatDuration(durationMs - positionMs)}` : '--:--'}
        </Text>
      </View>
      <View style={styles.ticks} pointerEvents="none">
        {Array.from({ length: 41 }, (_, i) => (
          <View key={i} style={[styles.tick, i % 10 === 0 && styles.tickTall]} />
        ))}
      </View>
      {children}
    </View>
  );
}

/**
 * The transport: one plate of keys. Previous and next are plain glyphs on it, play is a raised
 * key in the accent, and shuffle and repeat sit on the shoulders as lamps that light when on.
 */
export function DeckTransport({
  playing,
  onToggle,
  onPrevious,
  onNext,
  onPreviousHold,
  onNextHold,
  onHoldEnd,
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
  left: ReactNode;
  right: ReactNode;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.transport}>
      {left}
      <View style={styles.plate}>
        <IconButton
          name="backward.end.fill"
          size={24}
          onPress={onPrevious}
          onLongPress={onPreviousHold}
          onPressOut={onHoldEnd}
          accessibilityLabel="Previous track"
          accessibilityHint="Hold to rewind"
        />
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.key, { backgroundColor: colors.tint }, pressed && styles.keyPressed]}
        >
          <SymbolView
            name={playing ? 'pause.fill' : 'play.fill'}
            size={26}
            tintColor={colors.onTint}
            style={playing ? undefined : { marginLeft: 3 }}
          />
        </Pressable>
        <IconButton
          name="forward.end.fill"
          size={24}
          onPress={onNext}
          onLongPress={onNextHold}
          onPressOut={onHoldEnd}
          accessibilityLabel="Next track"
          accessibilityHint="Hold to fast-forward"
        />
      </View>
      {right}
    </View>
  );
}

/** Shuffle and repeat as lamps beside the plate: lit in the accent when they are on. */
export function DeckLamp({
  name,
  active,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  name: SFSymbol;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.lamp, active && { borderColor: colors.tint }, (pressed || disabled) && styles.pressed]}
    >
      <SymbolView name={name} size={18} tintColor={active ? colors.tint : colors.secondaryLabel} weight="semibold" />
    </Pressable>
  );
}

/** The queue this song came from, as a deck's cue card: name, place in the queue, and a chevron. */
export function DeckHeader({
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
    <View style={styles.header}>
      <IconButton name="chevron.down" size={20} onPress={onClose} accessibilityLabel="Close the player" />
      <Pressable
        onPress={onFrom}
        style={({ pressed }) => [styles.cue, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Playing from ${from}, ${index} of ${total}`}
        accessibilityHint="Switches to another queue"
      >
        <Text numberOfLines={1} style={[type.caption, styles.cueName, face('semibold')]}>{from.toUpperCase()}</Text>
        <Text style={[type.caption, styles.cueCount]}>
          {index}/{total}
        </Text>
        <SymbolView name="chevron.down" size={10} tintColor={colors.secondaryLabel} weight="semibold" />
      </Pressable>
      <IconButton name="ellipsis" size={20} onPress={onMore} accessibilityLabel="More for this song" />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  stage: { alignSelf: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0c0e' },
  groove: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff' },
  sheen: {
    position: 'absolute',
    experimental_backgroundImage: [
      {
        type: 'linear-gradient',
        direction: '120deg',
        colorStops: [
          { color: 'rgba(255, 255, 255, 0.16)', positions: ['0%'] },
          { color: 'rgba(255, 255, 255, 0)', positions: ['38%'] },
          { color: 'rgba(255, 255, 255, 0)', positions: ['62%'] },
          { color: 'rgba(255, 255, 255, 0.1)', positions: ['100%'] },
        ],
      },
    ],
  },
  label: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  spindle: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  sleeve: { transform: [{ rotate: SLEEVE_TILT }] },
  tilt: { boxShadow: [{ offsetX: -6, offsetY: 16, blurRadius: 34, color: colors.shadow }] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs },
  title: { fontSize: 30, lineHeight: 34, color: colors.label },
  underTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artistChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    maxWidth: '70%',
  },
  artistText: { color: colors.label },
  album: { flex: 1, color: colors.secondaryLabel },
  pressed: { opacity: 0.5 },
  counter: { gap: 2 },
  counterRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  elapsed: { fontSize: 34, lineHeight: 38, color: colors.label, fontVariant: ['tabular-nums'] },
  remaining: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 10, paddingBottom: 2 },
  tick: { width: StyleSheet.hairlineWidth, height: 4, backgroundColor: colors.separator },
  tickTall: { height: 9 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  plate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
  },
  key: {
    width: 62,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: colors.shadow }],
  },
  keyPressed: { transform: [{ translateY: 2 }], opacity: 0.9 },
  lamp: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.separator,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, minHeight: 44 },
  cue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.fill,
  },
  cueName: { color: colors.label, letterSpacing: 1.2 },
  cueCount: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
}));
