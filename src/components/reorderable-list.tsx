import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/theme';

/**
 * A FlatList whose rows can be dragged by a handle and swiped away, built on PanResponder and
 * Animated so it needs nothing native beyond React Native itself.
 *
 * Rows must all be the same height (they are: one track row each), which lets the drop target be
 * worked out from the finger position alone. The dragged row is drawn as a floating copy over
 * the list while the original stays mounted, invisible, holding the gesture: FlatList keeps ten
 * screens of rows either side rendered, so the original survives any realistic autoscroll.
 */

interface RenderInfo<T> {
  item: T;
  index: number;
  /** Place this in the row where the drag handle should go. */
  handle: ReactElement;
  /** True for the floating copy under the finger. */
  lifted: boolean;
}

interface Props<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: RenderInfo<T>) => ReactElement;
  onMove: (from: number, to: number) => void;
  /** Swiping a row far enough either way calls this. Omit to turn swiping off. */
  onSwipeRemove?: (index: number) => void;
  header?: ReactElement | null;
  empty?: ReactElement | null;
  extraData?: unknown;
  listRef?: RefObject<FlatList<T> | null>;
}

/** How close to an edge, in points, the lifted row has to be before the list scrolls. */
const EDGE = 72;
/** The tab bar and the mini player cover roughly this much of the list's bottom. */
const BOTTOM_COVERED = 120;
const MAX_SCROLL_STEP = 14;

export function ReorderableList<T>({
  data,
  keyExtractor,
  renderItem,
  onMove,
  onSwipeRemove,
  header,
  empty,
  extraData,
  listRef: externalRef,
}: Props<T>) {
  const ownRef = useRef<FlatList<T>>(null);
  const listRef = externalRef ?? ownRef;
  const containerRef = useRef<View>(null);
  const rowRefs = useRef(new Map<number, View>());

  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Geometry, in refs: it changes every frame of a drag and must not re-render the list.
  const g = useRef({
    rowHeight: 64,
    headerHeight: 0,
    containerHeight: 0,
    contentHeight: 0,
    scrollY: 0,
    minScrollY: Number.POSITIVE_INFINITY,
    /** Lifted row's top, in container coordinates, when the drag began. */
    startTop: 0,
    startScrollY: 0,
    dy: 0,
    from: -1,
    to: -1,
    measured: false,
    frame: 0 as number | ReturnType<typeof requestAnimationFrame>,
  }).current;
  const ghostTop = useRef(new Animated.Value(0)).current;
  // Hidden until the lifted row has been measured, so it never flashes up at a stale position.
  const ghostOpacity = useRef(new Animated.Value(0)).current;
  /**
   * One responder per row position, kept across renders. A drag re-renders the list on every
   * change of drop target, and a responder recreated mid-gesture would start counting its
   * movement from zero again.
   */
  const responders = useRef(new Map<number, ReturnType<typeof PanResponder.create>>()).current;

  const latest = useRef({ data, onMove });
  latest.current = { data, onMove };

  const updateTarget = useCallback(() => {
    const count = latest.current.data.length;
    const offset = g.dy + (g.scrollY - g.startScrollY);
    const to = Math.max(0, Math.min(count - 1, g.from + Math.round(offset / g.rowHeight)));
    if (to !== g.to) {
      g.to = to;
      setDrag({ from: g.from, to });
    }
  }, [g]);

  const autoscroll = useCallback(() => {
    if (g.from < 0) return;
    const top = g.startTop + g.dy;
    const bottomEdge = g.containerHeight - BOTTOM_COVERED - EDGE;
    let step = 0;
    if (top < EDGE) step = -Math.ceil(((EDGE - top) / EDGE) * MAX_SCROLL_STEP);
    else if (top + g.rowHeight > bottomEdge) step = Math.ceil(((top + g.rowHeight - bottomEdge) / EDGE) * MAX_SCROLL_STEP);
    if (step !== 0 && g.measured) {
      const min = Math.min(g.minScrollY, g.startScrollY);
      const max = Math.max(min, g.contentHeight - g.containerHeight + BOTTOM_COVERED);
      const next = Math.max(min, Math.min(max, g.scrollY + Math.max(-MAX_SCROLL_STEP, Math.min(MAX_SCROLL_STEP, step))));
      if (next !== g.scrollY) {
        g.scrollY = next;
        listRef.current?.scrollToOffset({ offset: next, animated: false });
        updateTarget();
      }
    }
    g.frame = requestAnimationFrame(autoscroll);
  }, [g, listRef, updateTarget]);

  const finish = useCallback(
    (commit: boolean) => {
      if (g.from < 0) return;
      cancelAnimationFrame(g.frame as number);
      const { from, to } = g;
      g.from = -1;
      g.to = -1;
      g.measured = false;
      setDrag(null);
      setScrollEnabled(true);
      if (commit && from !== to && to >= 0) latest.current.onMove(from, to);
    },
    [g],
  );

  useEffect(() => () => cancelAnimationFrame(g.frame as number), [g]);

  const begin = useCallback(
    (index: number) => {
      g.from = index;
      g.to = index;
      g.dy = 0;
      g.measured = false;
      g.startScrollY = g.scrollY;
      ghostOpacity.setValue(0);
      setScrollEnabled(false);
      setDrag({ from: index, to: index });
      // Where the row actually is on screen, rather than where arithmetic says it should be:
      // the content inset under a large title is not known here, but this settles it.
      const row = rowRefs.current.get(index);
      const container = containerRef.current;
      if (row && container) {
        container.measureInWindow((_cx, cy) => {
          row.measureInWindow((_rx, ry) => {
            if (g.from !== index) return;
            g.startTop = ry - cy;
            g.startScrollY = g.headerHeight + index * g.rowHeight - g.startTop;
            g.scrollY = g.startScrollY;
            g.measured = true;
            ghostTop.setValue(g.startTop + g.dy);
            ghostOpacity.setValue(1);
          });
        });
      }
      g.frame = requestAnimationFrame(autoscroll);
    },
    [g, ghostTop, ghostOpacity, autoscroll],
  );

  const handleFor = useCallback(
    (index: number) => {
      let responder = responders.get(index);
      if (!responder) {
        responder = PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => begin(index),
          onPanResponderMove: (_e, gesture) => {
            g.dy = gesture.dy;
            if (g.measured) ghostTop.setValue(g.startTop + gesture.dy);
            updateTarget();
          },
          onPanResponderRelease: () => finish(true),
          onPanResponderTerminate: () => finish(true),
        });
        responders.set(index, responder);
      }
      return (
        <View
          {...responder.panHandlers}
          hitSlop={spacing.sm}
          style={styles.handle}
          accessibilityLabel="Reorder"
          accessibilityHint="Drag up or down to move this song"
        >
          <SymbolView name="line.3.horizontal" size={20} tintColor={colors.tertiaryLabel} />
        </View>
      );
    },
    [begin, finish, g, ghostTop, updateTarget, responders],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (g.from >= 0) return; // Our own autoscroll owns the offset during a drag.
      g.scrollY = e.nativeEvent.contentOffset.y;
      g.minScrollY = Math.min(g.minScrollY, g.scrollY);
    },
    [g],
  );

  const shift = (index: number): number => {
    if (!drag) return 0;
    const { from, to } = drag;
    if (index === from) return 0;
    if (from < index && index <= to) return -g.rowHeight;
    if (to <= index && index < from) return g.rowHeight;
    return 0;
  };

  const lifted = drag ? data[drag.from] : undefined;
  const listExtra = useMemo(() => [drag, extraData], [drag, extraData]);

  return (
    <View
      ref={containerRef}
      style={styles.root}
      onLayout={(e: LayoutChangeEvent) => {
        g.containerHeight = e.nativeEvent.layout.height;
      }}
    >
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={keyExtractor}
        extraData={listExtra}
        scrollEnabled={scrollEnabled}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => {
          g.contentHeight = h;
        }}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          header ? (
            <View
              onLayout={(e) => {
                g.headerHeight = e.nativeEvent.layout.height;
              }}
            >
              {header}
            </View>
          ) : null
        }
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => {
          const row = (
            <View
              ref={(v) => {
                if (v) rowRefs.current.set(index, v);
                else rowRefs.current.delete(index);
              }}
              onLayout={(e) => {
                g.rowHeight = e.nativeEvent.layout.height || g.rowHeight;
              }}
              style={[
                drag && { transform: [{ translateY: shift(index) }] },
                drag?.from === index && styles.placeholder,
              ]}
            >
              {renderItem({ item, index, handle: handleFor(index), lifted: false })}
            </View>
          );
          // Always wrapped when swiping is on, even mid-drag: changing the element tree would
          // remount the row, and with it the handle that owns the drag gesture.
          return onSwipeRemove ? (
            <SwipeToRemove
              enabled={!drag}
              onRemove={() => onSwipeRemove(index)}
              onActive={(active) => setScrollEnabled(!active)}
            >
              {row}
            </SwipeToRemove>
          ) : (
            row
          );
        }}
      />
      {drag && lifted !== undefined ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ghost, { opacity: ghostOpacity, transform: [{ translateY: ghostTop }] }]}
        >
          {renderItem({ item: lifted, index: drag.from, handle: <View style={styles.handle} />, lifted: true })}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Swipe a row sideways past a third of the screen, or flick it, to remove it. */
function SwipeToRemove({
  children,
  enabled,
  onRemove,
  onActive,
}: {
  children: ReactElement;
  enabled: boolean;
  onRemove: () => void;
  onActive: (active: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const latest = useRef({ onRemove, onActive, width, enabled });
  latest.current = { onRemove, onActive, width, enabled };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gs) =>
          latest.current.enabled && Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => latest.current.onActive(true),
        onPanResponderMove: (_e, gs) => {
          setDirection(gs.dx < 0 ? 'left' : 'right');
          x.setValue(gs.dx);
        },
        onPanResponderRelease: (_e, gs) => {
          latest.current.onActive(false);
          const w = latest.current.width;
          const away = Math.abs(gs.dx) > w / 3 || (Math.abs(gs.vx) > 0.9 && Math.abs(gs.dx) > 48);
          if (away) {
            Animated.timing(x, { toValue: Math.sign(gs.dx || -1) * w, duration: 160, useNativeDriver: true }).start(() => {
              latest.current.onRemove();
              // The row normally unmounts with the edit; this only matters if it did not.
              setTimeout(() => x.setValue(0), 400);
            });
          } else {
            Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          latest.current.onActive(false);
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [x],
  );

  return (
    <View style={styles.swipe}>
      <View style={[StyleSheet.absoluteFill, styles.removeBehind, direction === 'right' && styles.removeRight]}>
        <SymbolView name="trash.fill" size={20} tintColor={colors.background} />
      </View>
      <Animated.View {...responder.panHandlers} style={[styles.swipeFront, { transform: [{ translateX: x }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  handle: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  placeholder: { opacity: 0 },
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: colors.secondaryBackground,
    shadowColor: colors.label,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  swipe: { overflow: 'hidden' },
  removeBehind: {
    backgroundColor: colors.destructive,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  removeRight: { alignItems: 'flex-start' },
  swipeFront: { backgroundColor: colors.background },
});
