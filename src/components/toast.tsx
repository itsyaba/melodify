import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, radius, spacing, type } from '@/theme';

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

let current: ToastMessage | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const subscribers = new Set<() => void>();

function publish(message: ToastMessage | null) {
  current = message;
  subscribers.forEach((fn) => fn());
}

/**
 * Brief confirmation for things that happen off screen ("Added to Queue 2"), with an optional
 * action, which is how undo is offered. One at a time: a new toast replaces the old one.
 */
export const toast = {
  show(text: string, action?: ToastMessage['action']) {
    clearTimeout(timer);
    publish({ id: nextId++, text, action });
    timer = setTimeout(() => publish(null), action ? 5000 : 2500);
  },
  hide() {
    clearTimeout(timer);
    publish(null);
  },
};

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Mounted once, over the whole app, at the top so it never collides with the tab bar or the
 * mini player. It sits under a presented modal, since that is a separate native window layer.
 */
export function ToastHost() {
  const styles = useStyles();
  const message = useSyncExternalStore(subscribe, () => current, () => current);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: message ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [message, opacity]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite">
        <Text numberOfLines={2} style={[type.subhead, styles.text]}>{message.text}</Text>
        {message.action ? (
          <Pressable
            hitSlop={spacing.md}
            accessibilityRole="button"
            onPress={() => {
              const action = message.action!;
              toast.hide();
              action.onPress();
            }}
          >
            <Text style={[type.headline, styles.action]}>{message.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  // Inverted from the page: label color as the fill, background color as the text.
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    maxWidth: 500,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.label,
  },
  text: { flexShrink: 1, color: colors.background },
  action: { color: colors.tint },
}));
