import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { Artwork } from './artwork';
import { setMenuHost, type MenuItem, type MenuRequest } from './menus';

const OPEN_MS = 240;
const CLOSE_MS = 180;
/** How far the sheet has to be pulled down, or how fast, to close. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 1.2;

/**
 * Spotify's menu sheet, mounted once at the root; `showMenu` opens it. It slides up over a dimmed
 * page with a grab handle, the item's cover, name and artist, then a row per action with its
 * icon. A tap outside, or pulling it down by the handle, closes it.
 *
 * An item runs once the sheet is fully gone (the Modal's onDismiss), since iOS cannot present a
 * prompt or another sheet while one is still going away. A menu asked for while one closes waits
 * for it.
 */
export function MenuHost() {
  const styles = useStyles();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const [panelHeight, setPanelHeight] = useState(height);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  // Refs, as the host callback is registered once and must see the latest state.
  const state = useRef<'closed' | 'open' | 'closing'>('closed');
  const after = useRef<(() => void) | null>(null);
  const queued = useRef<MenuRequest | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const open = useCallback(
    (next: MenuRequest) => {
      if (state.current === 'closing') {
        queued.current = next;
        return;
      }
      setRequest(next);
      if (state.current === 'open') return;
      // The keyboard's window sits above any modal and would cover the bottom of the sheet.
      Keyboard.dismiss();
      state.current = 'open';
      drag.setValue(0);
      progress.setValue(0);
      setVisible(true);
    },
    [drag, progress],
  );

  const finish = useCallback(() => {
    clearTimeout(fallback.current);
    if (state.current !== 'closing') return;
    state.current = 'closed';
    setRequest(null);
    const run = after.current;
    after.current = null;
    run?.();
    const next = queued.current;
    queued.current = null;
    if (next) open(next);
  }, [open]);

  const close = useCallback(
    (then?: () => void) => {
      if (state.current !== 'open') return;
      state.current = 'closing';
      after.current = then ?? null;
      Animated.timing(progress, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }).start(() => {
        setVisible(false);
        // iOS says when the modal is gone (onDismiss); elsewhere, or if that never comes, go on.
        fallback.current = setTimeout(finish, Platform.OS === 'ios' ? 500 : 0);
      });
    },
    [progress, finish],
  );

  useEffect(() => {
    setMenuHost(open);
    return () => setMenuHost(null);
  }, [open]);

  const closeRef = useRef(close);
  closeRef.current = close;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) closeRef.current();
        else Animated.spring(drag, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, bounciness: 0, useNativeDriver: true }).start(),
    }),
  ).current;

  const items = request?.items ?? [];
  const withIcons = items.some((i) => i.icon);
  const hasHeader = Boolean(request?.title || request?.message);
  const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [panelHeight, 0] }), drag);

  const row = (item: MenuItem, index: number) => {
    const tint = item.destructive ? colors.destructive : colors.label;
    return (
      <Pressable
        key={`${index}:${item.label}`}
        onPress={() => close(item.onPress)}
        accessibilityRole="button"
        accessibilityState={item.selected ? { selected: true } : undefined}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {withIcons ? (
          <View style={styles.icon}>
            {item.icon ? <SymbolView name={item.icon} size={22} tintColor={item.destructive ? colors.destructive : colors.secondaryLabel} /> : null}
          </View>
        ) : null}
        <Text numberOfLines={2} style={[type.body, styles.label, { color: tint }]}>{item.label}</Text>
        {item.selected ? <SymbolView name="checkmark" size={17} tintColor={colors.tint} weight="semibold" /> : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onShow={() => Animated.timing(progress, { toValue: 1, duration: OPEN_MS, useNativeDriver: true }).start()}
      onDismiss={finish}
      onRequestClose={() => close()}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={() => close()}
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          style={[styles.panel, { maxHeight: height - insets.top - spacing.xl, transform: [{ translateY }] }]}
        >
          <View {...pan.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            {hasHeader ? (
              <View style={styles.header}>
                {request?.artKey !== undefined ? (
                  <Artwork artKey={request.artKey} size={48} rounded={request.round ? 'full' : 'sm'} />
                ) : null}
                <View style={styles.headerText}>
                  {request?.title ? <Text numberOfLines={1} style={[type.body, styles.title]}>{request.title}</Text> : null}
                  {request?.message ? <Text numberOfLines={2} style={[type.footnote, styles.message]}>{request.message}</Text> : null}
                </View>
              </View>
            ) : null}
          </View>
          {hasHeader ? <View style={styles.divider} /> : null}
          <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.sm }}>
            {items.map(row)}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  scrim: { backgroundColor: colors.scrim },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: 640,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.sheet,
  },
  handleArea: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.tertiaryLabel },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  title: { color: colors.label, fontWeight: '600' },
  message: { color: colors.secondaryLabel },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  icon: { width: 26, alignItems: 'center' },
  label: { flex: 1 },
  pressed: { backgroundColor: colors.fill },
}));
