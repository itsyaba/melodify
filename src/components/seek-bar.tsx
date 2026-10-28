import { useRef, useState } from 'react';
import { PanResponder, View, type ColorValue, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';
import { makeStyles, radius } from '@/theme';
import { formatDuration } from '@/utils/format';

const TRACK = 4;
const THUMB = 14;
const MARK = 3;

interface Props {
  positionMs: number;
  durationMs: number;
  /** Fired once, on release. */
  onSeek: (positionMs: number) => void;
  /** The dragged position while scrubbing, then null on release, so labels can follow the thumb. */
  onScrub?: (positionMs: number | null) => void;
  /** The played part and the thumb. The accent by default. */
  color?: ColorValue;
  /** An A–B repeat stretch, marked on the bar; B is null while only A is set. */
  loop?: { aMs: number; bMs: number | null } | null;
}

export function SeekBar({ positionMs, durationMs, onSeek, onScrub, color, loop }: Props) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [dragMs, setDragMs] = useState<number | null>(null);

  // The PanResponder is built once and never rebuilt, so its handlers read live values out of
  // refs. Closing over the props directly would pin them to whatever they were on first render.
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
    const release = (x: number) => {
      const ms = msAt(x);
      setDragMs(null);
      live.current.onScrub?.(null);
      live.current.onSeek(ms);
    };
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        scrub(startX.current);
      },
      // dx off the grant point rather than the raw touch position, which is measured against
      // the window rather than this view.
      onPanResponderMove: (_e, g) => scrub(startX.current + g.dx),
      onPanResponderRelease: (_e, g) => release(startX.current + g.dx),
      onPanResponderTerminate: () => {
        setDragMs(null);
        live.current.onScrub?.(null);
      },
    });
  }

  const shown = dragMs ?? positionMs;
  const fraction = (ms: number) => (durationMs > 0 ? Math.max(0, Math.min(1, ms / durationMs)) : 0);
  const progress = fraction(shown);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const tone = color ? { backgroundColor: color } : null;
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
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ text: `${formatDuration(shown)} of ${formatDuration(durationMs)}` }}
      accessibilityState={{ disabled: durationMs <= 0 }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName)}
      {...responder.current.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, tone, { width: `${progress * 100}%` }]} />
      </View>
      {a !== null && b !== null ? (
        <View pointerEvents="none" style={[styles.loop, { left: a * width, width: (b - a) * width }]} />
      ) : null}
      {a !== null ? <View pointerEvents="none" style={[styles.mark, { left: a * width - MARK / 2 }]} /> : null}
      {b !== null ? <View pointerEvents="none" style={[styles.mark, { left: b * width - MARK / 2 }]} /> : null}
      <View style={[styles.thumb, tone, { left: progress * width - THUMB / 2 }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { height: THUMB * 2, justifyContent: 'center' },
  track: { height: TRACK, borderRadius: radius.sm, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: TRACK, backgroundColor: colors.tint },
  // The looped stretch, over the track; the marks at A and B stand a little taller than it.
  loop: { position: 'absolute', height: TRACK + 4, borderRadius: radius.sm, backgroundColor: colors.tint, opacity: 0.45 },
  mark: { position: 'absolute', width: MARK, height: TRACK + 10, borderRadius: MARK / 2, backgroundColor: colors.tint },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.tint,
  },
}));
