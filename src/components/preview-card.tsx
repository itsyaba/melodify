import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/icon-button';
import { SymbolView } from '@/components/symbol';
import { queue, usePlaybackState } from '@/player/queue-store';
import { usePreview } from '@/player/preview';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

/**
 * The card a preview runs under, as Musicolet shows one: the song being sampled, a line that
 * empties over the preview's length, and the two ways out — stop, which puts back whatever was
 * playing, or play, which drops the song in after the current one and goes to it.
 *
 * Mounted once at the root, beside the toasts, so a preview survives the menu it was started
 * from closing.
 */
export function PreviewCard() {
  const styles = useStyles();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const preview = usePreview();
  const playing = usePlaybackState() === 'playing';
  const left = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(0)).current;

  // The line empties over what is left of the preview, picking up mid-way if the card remounts.
  useEffect(() => {
    if (!preview) return;
    const spent = Date.now() - preview.startedAt;
    const remaining = Math.max(0, preview.lengthMs - spent);
    left.setValue(remaining / preview.lengthMs);
    const run = Animated.timing(left, { toValue: 0, duration: remaining, easing: Easing.linear, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [preview, left]);

  useEffect(() => {
    const run = Animated.timing(rise, {
      toValue: preview ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [preview, rise]);

  if (!preview) return null;
  const { track } = preview;
  return (
    <Animated.View
      style={[
        styles.root,
        {
          paddingBottom: insets.bottom + spacing.md,
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Artwork artKey={track.art_key} size={40} rounded="sm" />
          <View style={styles.text}>
            <View style={styles.eyebrowRow}>
              <SymbolView name="waveform" size={11} tintColor={colors.tint} weight="semibold" />
              <Text style={[type.caption, styles.eyebrow]}>PREVIEW</Text>
            </View>
            <Text numberOfLines={1} style={[type.subhead, styles.title]}>{track.title}</Text>
          </View>
          <IconButton
            name={playing ? 'pause.fill' : 'play.fill'}
            size={16}
            color={colors.label}
            onPress={() => void queue.toggle()}
            accessibilityLabel={playing ? 'Pause the preview' : 'Play the preview'}
          />
          <Pressable
            onPress={() => {
              void queue.endPreview().then(() => queue.playNext([track])).then(() => queue.next());
            }}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Play ${track.title} now`}
          >
            <Text style={[type.footnote, styles.playText]}>Play</Text>
          </Pressable>
          <IconButton
            name="xmark"
            size={15}
            color={colors.secondaryLabel}
            onPress={() => void queue.endPreview()}
            accessibilityLabel="Stop the preview"
          />
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { transform: [{ scaleX: left }] }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: colors.shadow }],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eyebrow: { color: colors.tint, letterSpacing: 1, fontWeight: '700' },
  title: { color: colors.label, fontWeight: '600' },
  play: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.tint },
  playText: { color: colors.onTint, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.tint, transformOrigin: 'left' },
}));
