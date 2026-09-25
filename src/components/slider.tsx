import { useRef, useState } from 'react';
import { PanResponder, View, type AccessibilityActionEvent, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';
import { makeStyles, radius } from '@/theme';

const TRACK = 4;
const THUMB = 22;

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** While dragging, with every change of step. */
  onChange: (value: number) => void;
  /** Once, on release. Where the value gets saved. */
  onCommit?: (value: number) => void;
  /** When a drag begins; a scroll view around it can stop scrolling until `onCommit`. */
  onDragStart?: () => void;
  /** Where the fill starts: `min` by default, or a middle value such as 0 dB. */
  origin?: number;
  vertical?: boolean;
  /** Length of a vertical slider; a horizontal one fills its width. */
  length?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  /** The value as a screen reader should say it. */
  formatValue?: (value: number) => string;
}

/**
 * A plain slider, horizontal or vertical, on PanResponder like the seek bar: the speed, pitch
 * and volume controls and the equalizer's bands. VoiceOver adjusts it a step at a time.
 */
export function Slider({
  value,
  min,
  max,
  step = 0,
  onChange,
  onCommit,
  onDragStart,
  origin,
  vertical = false,
  length,
  disabled = false,
  accessibilityLabel,
  formatValue,
}: Props) {
  const styles = useStyles();
  const [size, setSize] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  // Built once; the handlers read the live props from here, as in SeekBar.
  const live = useRef({ size, min, max, step, vertical, disabled, onChange, onCommit, onDragStart, value });
  live.current = { size, min, max, step, vertical, disabled, onChange, onCommit, onDragStart, value };
  const start = useRef(0);
  const last = useRef<number | null>(null);
  const responder = useRef<PanResponderInstance>(undefined);

  if (!responder.current) {
    const valueAt = (offset: number) => {
      const l = live.current;
      if (l.size <= 0) return l.value;
      const fraction = Math.max(0, Math.min(1, offset / l.size));
      // Vertical sliders grow upwards, so the top is the maximum.
      const raw = l.min + (l.vertical ? 1 - fraction : fraction) * (l.max - l.min);
      const stepped = l.step > 0 ? Math.round((raw - l.min) / l.step) * l.step + l.min : raw;
      return Math.max(l.min, Math.min(l.max, Number(stepped.toFixed(4))));
    };
    const move = (offset: number) => {
      const v = valueAt(offset);
      setDrag(v);
      if (v !== last.current) {
        last.current = v;
        live.current.onChange(v);
      }
    };
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      // A vertical slider inside a scroll view must keep the gesture once it has it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.onDragStart?.();
        start.current = live.current.vertical ? e.nativeEvent.locationY : e.nativeEvent.locationX;
        last.current = null;
        move(start.current);
      },
      onPanResponderMove: (_e, g) => move(start.current + (live.current.vertical ? g.dy : g.dx)),
      onPanResponderRelease: (_e, g) => {
        const v = valueAt(start.current + (live.current.vertical ? g.dy : g.dx));
        setDrag(null);
        live.current.onChange(v);
        live.current.onCommit?.(v);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        if (last.current !== null) live.current.onCommit?.(last.current);
      },
    });
  }

  const shown = drag ?? value;
  const span = max - min || 1;
  const at = (v: number) => Math.max(0, Math.min(1, (v - min) / span));
  const from = at(origin ?? min);
  const to = at(shown);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  const onLayout = (e: LayoutChangeEvent) => setSize(vertical ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
  const nudge = (e: AccessibilityActionEvent) => {
    const by = step > 0 ? step : span / 20;
    const next = Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? by : -by)));
    onChange(next);
    onCommit?.(next);
  };

  return (
    <View
      style={[vertical ? [styles.hitV, { height: length ?? 160 }] : styles.hitH, disabled && styles.disabled]}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: formatValue ? formatValue(value) : String(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={nudge}
      {...responder.current.panHandlers}
    >
      <View style={vertical ? styles.trackV : styles.trackH} pointerEvents="none">
        <View
          style={
            vertical
              ? [styles.fill, { position: 'absolute', left: 0, right: 0, bottom: `${lo * 100}%`, height: `${(hi - lo) * 100}%` }]
              : [styles.fill, { position: 'absolute', top: 0, bottom: 0, left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }]
          }
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          vertical ? { top: (1 - to) * size - THUMB / 2 } : { left: to * size - THUMB / 2 },
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hitH: { height: THUMB + 12, justifyContent: 'center' },
  hitV: { width: THUMB + 12, alignItems: 'center' },
  trackH: { height: TRACK, borderRadius: radius.sm, backgroundColor: colors.fill, overflow: 'hidden' },
  trackV: { width: TRACK, flex: 1, borderRadius: radius.sm, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { backgroundColor: colors.tint },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.tint,
  },
  disabled: { opacity: 0.4 },
}));
