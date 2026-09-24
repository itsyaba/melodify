import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';
import { makeStyles, radius } from '@/theme';

const TRACK = 4;
const THUMB = 14;

interface Props {
  positionMs: number;
  durationMs: number;
  /** Fired once, on release. */
  onSeek: (positionMs: number) => void;
  /** The dragged position while scrubbing, then null on release, so labels can follow the thumb. */
  onScrub?: (positionMs: number | null) => void;
}

export function SeekBar({ positionMs, durationMs, onSeek, onScrub }: Props) {
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
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, shown / durationMs)) : 0;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={styles.hit}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      {...responder.current.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={[styles.thumb, { left: progress * width - THUMB / 2 }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { height: THUMB * 2, justifyContent: 'center' },
  track: { height: TRACK, borderRadius: radius.sm, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: TRACK, backgroundColor: colors.tint },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.tint,
  },
}));
