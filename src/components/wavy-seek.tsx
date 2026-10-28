import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';
import { makeStyles, radius, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';

/**
 * Material 3's media seek bar: the played part is a wave that travels while the song plays and
 * settles into a straight line when it stops or while a thumb is dragging it, with the bar-shaped
 * handle M3 sliders use. The wave is drawn from short rounded segments laid along a sine and slid
 * sideways by one wavelength on a loop, so there is no SVG or canvas behind it.
 */

/** One hump of the wave, and how far apart the segments along it sit. */
const WAVELENGTH = 26;
const STEP = 4;
const THICKNESS = 4;
const AMPLITUDE = 4;
const TRAVEL_MS = 1100;
const HANDLE_W = 5;
const HANDLE_H = 26;
const MARK = 3;
const HIT = 34;

interface Props {
  positionMs: number;
  durationMs: number;
  /** The wave travels while this is true; otherwise the played part is a straight line. */
  playing: boolean;
  /** Fired once, on release. */
  onSeek: (positionMs: number) => void;
  /** The dragged position while scrubbing, then null on release, so labels can follow the handle. */
  onScrub?: (positionMs: number | null) => void;
  /** An A–B repeat stretch, marked on the bar; B is null while only A is set. */
  loop?: { aMs: number; bMs: number | null } | null;
}

export function WavySeek({ positionMs, durationMs, playing, onSeek, onScrub, loop }: Props) {
  const styles = useStyles();
  const colors = useTheme();
  const [width, setWidth] = useState(0);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const travel = useRef(new Animated.Value(0)).current;
  const waviness = useRef(new Animated.Value(0)).current;

  // Live values for the gesture, which is built once: see SeekBar for why.
  const live = useRef({ width, durationMs, onSeek, onScrub });
  live.current = { width, durationMs, onSeek, onScrub };
  const startX = useRef(0);
  const responder = useRef<PanResponderInstance>(undefined);

  if (!responder.current) {
    const msAt = (x: number) => {
      const { width: w, durationMs: d } = live.current;
      if (w <= 0 || d <= 0) return 0;
      return Math.max(0, Math.min(1, x / w)) * d;
    };
    const scrub = (x: number) => {
      const ms = msAt(x);
      setDragMs(ms);
      live.current.onScrub?.(ms);
    };
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        scrub(startX.current);
      },
      onPanResponderMove: (_e, g) => scrub(startX.current + g.dx),
      onPanResponderRelease: (_e, g) => {
        const ms = msAt(startX.current + g.dx);
        setDragMs(null);
        live.current.onScrub?.(null);
        live.current.onSeek(ms);
      },
      onPanResponderTerminate: () => {
        setDragMs(null);
        live.current.onScrub?.(null);
      },
    });
  }

  const dragging = dragMs !== null;
  const wavy = playing && !dragging;

  // The wave slides one wavelength and starts over, which reads as one continuous travel.
  useEffect(() => {
    if (!wavy) return;
    travel.setValue(0);
    const loopAnimation = Animated.loop(
      Animated.timing(travel, { toValue: 1, duration: TRAVEL_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loopAnimation.start();
    return () => loopAnimation.stop();
  }, [wavy, travel]);

  // Flattening and rising again, rather than the wave appearing and vanishing.
  useEffect(() => {
    const run = Animated.timing(waviness, {
      toValue: wavy ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [wavy, waviness]);

  // One wavelength more than the bar is wide, so sliding it never shows the end.
  const segments = useMemo(() => {
    const count = Math.ceil((width + WAVELENGTH * 2) / STEP);
    return Array.from({ length: Math.max(0, count) }, (_, i) => {
      const x = i * STEP;
      return { x, y: Math.sin((x / WAVELENGTH) * Math.PI * 2) * AMPLITUDE };
    });
  }, [width]);

  const shown = dragMs ?? positionMs;
  const fraction = (ms: number) => (durationMs > 0 ? Math.max(0, Math.min(1, ms / durationMs)) : 0);
  const progress = fraction(shown);
  const played = progress * width;
  const a = loop && durationMs > 0 ? fraction(loop.aMs) : null;
  const b = loop && loop.bMs !== null && durationMs > 0 ? fraction(loop.bMs) : null;
  const nudge = (action: string) => {
    if (durationMs <= 0) return;
    const step = action === 'increment' ? 10_000 : action === 'decrement' ? -10_000 : 0;
    if (step) onSeek(Math.max(0, Math.min(durationMs, shown + step)));
  };

  return (
    <View
      style={styles.hit}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ text: `${formatDuration(shown)} of ${formatDuration(durationMs)}` }}
      accessibilityState={{ disabled: durationMs <= 0 }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName)}
      {...responder.current.panHandlers}
    >
      {/* What is left to play: a flat line, inset past the handle as M3 insets its track. */}
      <View style={[styles.rest, { left: played + HANDLE_W * 2, right: 0 }]} />

      <View style={[styles.playedClip, { width: Math.max(0, played - HANDLE_W) }]}>
        <Animated.View style={[styles.flat, { opacity: waviness.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
        <Animated.View
          style={[
            styles.wave,
            {
              opacity: waviness,
              transform: [
                { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, WAVELENGTH] }) },
                { scaleY: waviness.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
              ],
            },
          ]}
        >
          {segments.map((s) => (
            <View
              key={s.x}
              style={[styles.segment, { left: s.x - WAVELENGTH, transform: [{ translateY: s.y }], backgroundColor: colors.tint }]}
            />
          ))}
        </Animated.View>
      </View>

      {a !== null && b !== null ? <View pointerEvents="none" style={[styles.loop, { left: a * width, width: (b - a) * width }]} /> : null}
      {a !== null ? <View pointerEvents="none" style={[styles.mark, { left: a * width - MARK / 2 }]} /> : null}
      {b !== null ? <View pointerEvents="none" style={[styles.mark, { left: b * width - MARK / 2 }]} /> : null}
      <View style={[styles.handle, { left: Math.min(width - HANDLE_W, Math.max(0, played - HANDLE_W / 2)) }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { height: HIT, justifyContent: 'center' },
  rest: {
    position: 'absolute',
    height: THICKNESS,
    borderRadius: THICKNESS / 2,
    backgroundColor: colors.fill,
  },
  playedClip: {
    position: 'absolute',
    left: 0,
    height: HIT,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flat: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: THICKNESS,
    borderRadius: THICKNESS / 2,
    backgroundColor: colors.tint,
  },
  wave: { position: 'absolute', left: 0, right: 0, height: HIT, justifyContent: 'center' },
  segment: {
    position: 'absolute',
    top: HIT / 2 - THICKNESS / 2,
    width: STEP + 1,
    height: THICKNESS,
    borderRadius: THICKNESS / 2,
  },
  loop: { position: 'absolute', height: THICKNESS + 4, borderRadius: radius.sm, backgroundColor: colors.tint, opacity: 0.35 },
  mark: { position: 'absolute', width: MARK, height: THICKNESS + 12, borderRadius: MARK / 2, backgroundColor: colors.tint },
  handle: {
    position: 'absolute',
    width: HANDLE_W,
    height: HANDLE_H,
    borderRadius: HANDLE_W / 2,
    backgroundColor: colors.tint,
  },
}));
