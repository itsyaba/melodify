import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { SymbolView } from '@/components/symbol';
import { queue, usePlaybackState } from '@/player/queue-store';
import { usePreview } from '@/player/preview';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

/**
 * The capsule a preview runs under: a floating bar at the top of the screen, clear of the mini
 * player and the tab bar at the foot of it, with the cover ringed by the seconds it has left.
 *
 * The ring is twenty ticks around the artwork that go out one by one as the preview runs, the
 * bars beside the title dance while it plays, and the whole thing can be flicked up to stop it.
 * Mounted once at the root beside the toasts, so it outlives the menu it was started from.
 */

const ART = 34;
const RING = ART + 14;
const TICKS = 20;
const TICK_H = 5;

export function PreviewCard() {
  const styles = useStyles();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const preview = usePreview();
  const playing = usePlaybackState() === 'playing';
  const left = useRef(new Animated.Value(1)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [seconds, setSeconds] = useState(0);

  // The ring empties over what is left of the preview, picking it up mid-way if this remounts.
  useEffect(() => {
    if (!preview) return;
    const remaining = () => Math.max(0, preview.lengthMs - (Date.now() - preview.startedAt));
    left.setValue(remaining() / preview.lengthMs);
    const run = Animated.timing(left, { toValue: 0, duration: remaining(), easing: Easing.linear, useNativeDriver: true });
    run.start();
    setSeconds(Math.ceil(remaining() / 1000));
    const tick = setInterval(() => setSeconds(Math.ceil(remaining() / 1000)), 250);
    return () => {
      run.stop();
      clearInterval(tick);
    };
  }, [preview, left]);

  // In from above with a little overshoot, out the same way.
  useEffect(() => {
    lift.setValue(0);
    const run = preview
      ? Animated.spring(drop, { toValue: 1, damping: 14, stiffness: 180, mass: 0.9, useNativeDriver: true })
      : Animated.timing(drop, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [preview, drop, lift]);

  // A flick upwards stops it, the way a notification is dismissed.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => lift.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -28 || g.vy < -0.6) void queue.endPreview();
        else Animated.spring(lift, { toValue: 0, damping: 16, stiffness: 200, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(lift, { toValue: 0, damping: 16, stiffness: 200, useNativeDriver: true }).start(),
    }),
  ).current;

  if (!preview) return null;
  const { track } = preview;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.xs,
          opacity: drop,
          transform: [
            { translateY: Animated.add(drop.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }), lift) },
            { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
    >
      <View style={styles.capsule} {...pan.panHandlers}>
        {/* The cover, ringed by the seconds it has left; tapping it holds and resumes. */}
        <Pressable
          onPress={() => void queue.toggle()}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause the preview' : 'Play the preview'}
          style={styles.ringBox}
        >
          {Array.from({ length: TICKS }, (_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.tickSlot,
                {
                  transform: [{ rotate: `${(i / TICKS) * 360}deg` }, { translateY: -RING / 2 }],
                  opacity: left.interpolate({
                    inputRange: [i / TICKS, (i + 0.6) / TICKS],
                    outputRange: [0.12, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <View style={[styles.tick, { backgroundColor: colors.tint }]} />
            </Animated.View>
          ))}
          <Artwork artKey={track.art_key} size={ART} rounded="full" />
          {!playing ? (
            <View style={styles.held}>
              <SymbolView name="play.fill" size={12} tintColor={colors.onTint} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.text}>
          <Text numberOfLines={1} style={[type.footnote, styles.title]}>{track.title}</Text>
          <View style={styles.under}>
            <Bars playing={playing} color={colors.tint} />
            <Text style={[type.caption, styles.count]}>Preview · {seconds}s</Text>
          </View>
        </View>

        <Pressable
          onPress={() => void queue.endPreview().then(() => queue.playNext([track])).then(() => queue.next())}
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Play ${track.title} now`}
        >
          <SymbolView name="play.fill" size={11} tintColor={colors.onTint} />
          <Text style={[type.caption, styles.playText]}>Play</Text>
        </Pressable>
        <Pressable
          onPress={() => void queue.endPreview()}
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Stop the preview"
          accessibilityHint="Flick the capsule up to stop it too"
        >
          <SymbolView name="xmark" size={12} tintColor={colors.secondaryLabel} weight="semibold" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** Three bars that dance while the preview plays and lie flat while it is held. */
function Bars({ playing, color }: { playing: boolean; color: ColorValue }) {
  const styles = useStyles();
  const values = useRef([new Animated.Value(0.3), new Animated.Value(0.8), new Animated.Value(0.5)]).current;

  useEffect(() => {
    if (!playing) {
      values.forEach((v) => Animated.timing(v, { toValue: 0.22, duration: 160, useNativeDriver: true }).start());
      return;
    }
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 320 + i * 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320 + i * 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l, i) => setTimeout(() => l.start(), i * 90));
    return () => loops.forEach((l) => l.stop());
  }, [playing, values]);

  return (
    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <Animated.View key={i} style={[styles.bar, { backgroundColor: color, transform: [{ scaleY: v }] }]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: spacing.md, alignItems: 'center' },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 28, color: colors.shadow }],
    maxWidth: 460,
  },
  ringBox: { width: RING + TICK_H * 2, height: RING + TICK_H * 2, alignItems: 'center', justifyContent: 'center' },
  tickSlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  tick: { width: 2, height: TICK_H, borderRadius: 1 },
  held: {
    position: 'absolute',
    width: ART,
    height: ART,
    borderRadius: ART / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  text: { flex: 1, gap: 1 },
  title: { color: colors.label, fontWeight: '600' },
  under: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 10 },
  bar: { width: 2, height: 10, borderRadius: 1, transformOrigin: 'bottom' },
  count: { color: colors.secondaryLabel, fontVariant: ['tabular-nums'] },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
  },
  playText: { color: colors.onTint, fontWeight: '700' },
  close: { padding: 2 },
  pressed: { opacity: 0.6 },
}));
