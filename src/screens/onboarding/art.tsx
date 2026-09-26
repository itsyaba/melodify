import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { ONBOARDING, THEME_SWATCHES, type ThemeName } from '@/theme';
import { face } from './fonts';

/**
 * The welcome pages' pictures, each drawn at ART_W × ART_H and scaled to the room the page has:
 * a player with a waveform through it, Musicolet's features floating over a sound peak, a lock
 * screen with Melodify's live import status on it, and the four themes as a collage. They glow in
 * the accent, which is passed in as a hex so it can be given an alpha.
 */

export const ART_W = 320;
export const ART_H = 300;

export const VALLEY = require('../../../assets/onboarding/valley.jpg') as number;

/** Two hex digits of alpha, for appending to a #rrggbb colour. */
function alpha(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** A soft round light, strongest in the middle and gone at its edge. */
export function Glow({ size, hex, strength = 0.5, style }: { size: number; hex: string; strength?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          experimental_backgroundImage: [
            {
              type: 'radial-gradient',
              shape: 'circle',
              size: 'closest-side',
              position: { top: '50%', left: '50%' },
              colorStops: [
                { color: `${hex}${alpha(strength)}`, positions: ['0%'] },
                { color: `${hex}${alpha(strength * 0.35)}`, positions: ['45%'] },
                { color: `${hex}00`, positions: ['100%'] },
              ],
            },
          ],
        },
        style,
      ]}
    />
  );
}

/** Drifts up and down a few points, forever, out of step with its neighbours. */
function Float({ delay, still, style, children }: { delay: number; still: boolean; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [t, delay, still]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  return <Animated.View style={[style, { transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ---- 1. The player

/** Bar heights for the waveform behind the player, a fixed shape so it never jumps. */
const WAVE = Array.from({ length: 40 }, (_, i) => {
  const x = i / 39;
  return Math.round(6 + 26 * Math.abs(Math.sin(x * 9.2) * Math.cos(x * 3.1)) + 10 * Math.sin(x * Math.PI));
});

export function PlayerArt({ hex }: { hex: string }) {
  return (
    <View style={styles.box}>
      <Glow size={400} hex={hex} strength={0.55} style={{ left: (ART_W - 400) / 2, top: 40 }} />
      <View style={styles.wave}>
        {WAVE.map((h, i) => {
          // Brightest by the player, fading out towards both edges.
          const fade = 1 - Math.abs(i - 19.5) / 20;
          return <View key={i} style={[styles.waveBar, { height: h, backgroundColor: hex, opacity: 0.25 + fade * 0.75 }]} />;
        })}
      </View>
      <View style={[styles.player, { boxShadow: `0px 16px 40px ${hex}${alpha(0.3)}` }]}>
        <Image source={VALLEY} resizeMode="cover" style={styles.playerArt} />
        <Text numberOfLines={1} style={[styles.song, face('semibold')]}>Northern Valley</Text>
        <Text numberOfLines={1} style={[styles.artist, face('regular')]}>Your library · offline</Text>
        <View style={styles.seek}>
          <View style={[styles.seekFill, { backgroundColor: hex }]} />
        </View>
        <View style={styles.controls}>
          <SymbolView name="backward.fill" size={18} tintColor={ONBOARDING.ink} />
          <View style={styles.play}>
            <SymbolView name="pause.fill" size={18} tintColor={ONBOARDING.buttonInk} />
          </View>
          <SymbolView name="forward.fill" size={18} tintColor={ONBOARDING.ink} />
        </View>
      </View>
    </View>
  );
}

// ---- 2. What it does

const PEAK = [22, 40, 64, 96, 132, 96, 64, 40, 22];

const BADGES: { icon: SFSymbol; size: number; x: number; y: number; far?: boolean }[] = [
  { icon: 'folder.fill', size: 48, x: 30, y: 118 },
  { icon: 'bookmark.fill', size: 48, x: 244, y: 100 },
  { icon: 'quote.bubble.fill', size: 42, x: 262, y: 200 },
  { icon: 'slider.vertical.3', size: 42, x: 16, y: 212 },
  { icon: 'tag.fill', size: 34, x: 72, y: 30, far: true },
  { icon: 'moon.zzz.fill', size: 34, x: 222, y: 18, far: true },
];

export function FeaturesArt({ hex, still }: { hex: string; still: boolean }) {
  const peakTop = ART_H - 6 - Math.max(...PEAK);
  return (
    <View style={styles.box}>
      <Glow size={320} hex={hex} strength={0.5} style={{ left: 0, top: ART_H - 230 }} />
      {/* Radar rings round the queue badge. */}
      {[176, 132, 96].map((d, i) => (
        <View
          key={d}
          style={[styles.ring, { width: d, height: d, left: ART_W / 2 - d / 2, top: 78 - d / 2, borderColor: `${hex}${alpha(0.14 + i * 0.12)}` }]}
        />
      ))}
      <View style={[styles.hub, { boxShadow: `0px 0px 36px ${hex}${alpha(0.55)}` }]}>
        <SymbolView name="music.note.list" size={26} tintColor={ONBOARDING.ink} />
      </View>
      {/* A dotted line from the peak up to the badge, as a trail to a summit. */}
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={[styles.trail, { top: 116 + i * ((peakTop - 120) / 5) }]} />
      ))}
      <View style={styles.peak}>
        {PEAK.map((h, i) => (
          <View
            key={i}
            style={[
              styles.peakBar,
              {
                height: h,
                experimental_backgroundImage: [
                  {
                    type: 'linear-gradient',
                    direction: 'to top',
                    colorStops: [
                      { color: `${hex}${alpha(0.05)}`, positions: ['0%'] },
                      { color: `${hex}${alpha(i === 4 ? 1 : 0.75)}`, positions: ['100%'] },
                    ],
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
      {BADGES.map((b, i) => (
        <Float
          key={b.icon}
          delay={i * 420}
          still={still}
          style={[styles.badge, { width: b.size, height: b.size, left: b.x, top: b.y, opacity: b.far ? 0.5 : 1 }]}
        >
          <SymbolView name={b.icon} size={Math.round(b.size * 0.42)} tintColor={b.far ? ONBOARDING.muted : ONBOARDING.ink} />
        </Float>
      ))}
    </View>
  );
}

// ---- 3. Adding music

export interface Status {
  title: string;
  body: string;
  /** 0 to 1 while something with a known size runs. */
  value: number | null;
}

function clock(now: Date): { time: string; date: string } {
  const hours = now.getHours() % 12 || 12;
  return {
    time: `${hours}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export function LockScreenArt({ hex, status }: { hex: string; status: Status }) {
  const [{ time, date }] = useState(() => clock(new Date()));
  return (
    <View style={styles.box}>
      <Glow size={360} hex={hex} strength={0.42} style={{ left: (ART_W - 360) / 2, top: 40 }} />
      <View style={styles.phone}>
        <Image source={VALLEY} resizeMode="cover" blurRadius={1} style={styles.wallpaper} />
        <View style={styles.wallpaperShade} />
        <View style={styles.island} />
        <Text numberOfLines={1} style={[styles.date, face('medium')]}>{date}</Text>
        <Text style={[styles.time, face('semibold')]}>{time}</Text>
        <View style={styles.phoneFade} />
      </View>
      <View style={[styles.notice, { boxShadow: `0px 0px 44px ${hex}${alpha(0.45)}` }]}>
        <View style={[styles.appIcon, { backgroundColor: hex }]}>
          <SymbolView name="music.note" size={18} tintColor={ONBOARDING.ink} />
        </View>
        <View style={styles.noticeText}>
          <View style={styles.noticeHead}>
            <Text style={[styles.noticeApp, face('semibold')]}>Melodify</Text>
            <Text style={[styles.noticeWhen, face('regular')]}>now</Text>
          </View>
          <Text numberOfLines={1} style={[styles.noticeTitle, face('medium')]}>{status.title}</Text>
          <Text numberOfLines={2} style={[styles.noticeBody, face('regular')]}>{status.body}</Text>
          {status.value != null ? (
            <View style={styles.noticeTrack}>
              <View style={[styles.noticeFill, { backgroundColor: hex, width: `${Math.round(status.value * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---- 4. Themes

const THEME_CARDS: { key: ThemeName; label: string; x: number; y: number }[] = [
  { key: 'system', label: 'System', x: 24, y: 72 },
  { key: 'light', label: 'Light', x: 94, y: 40 },
  { key: 'dark', label: 'Dark', x: 164, y: 82 },
  { key: 'black', label: 'Black', x: 234, y: 50 },
];
const CARD_W = 62;
const CARD_H = 112;

/** A tiny page of the app in a theme's colours: a cover in the accent, two lines, a mini player. */
function MiniScreen({ theme, hex }: { theme: keyof typeof THEME_SWATCHES; hex: string }) {
  const s = THEME_SWATCHES[theme];
  return (
    <View style={[styles.mini, { backgroundColor: s.page }]}>
      <View style={[styles.miniCover, { backgroundColor: hex }]} />
      <View style={[styles.miniLine, { backgroundColor: s.ink, width: '82%' }]} />
      <View style={[styles.miniLine, { backgroundColor: s.ink, width: '56%' }]} />
      <View style={[styles.miniPlayer, { backgroundColor: s.ink }]} />
    </View>
  );
}

export function ThemesArt({ hex, theme, onPick }: { hex: string; theme: ThemeName; onPick: (t: ThemeName) => void }) {
  const picked = THEME_CARDS.find((c) => c.key === theme) ?? THEME_CARDS[0];
  return (
    <View style={styles.box}>
      {/* Faded tiles round the edge, as a collage runs on past the frame. */}
      <Image source={VALLEY} resizeMode="cover" style={[styles.ghost, { left: -8, top: 4, width: 58, height: 76, opacity: 0.32 }]} />
      <View style={[styles.ghost, styles.ghostCard, { left: 292, top: -6, width: 44, height: 104, opacity: 0.55 }]} />
      <View style={[styles.ghost, styles.ghostCard, { left: -14, top: 214, width: 42, height: 64, opacity: 0.45 }]} />
      <Image source={VALLEY} resizeMode="cover" style={[styles.ghost, { left: 258, top: 226, width: 70, height: 58, opacity: 0.28 }]} />
      <Glow size={240} hex={hex} strength={0.55} style={{ left: picked.x + CARD_W / 2 - 120, top: picked.y + CARD_H / 2 - 120 }} />
      {THEME_CARDS.map((c) => {
        const selected = c.key === theme;
        return (
          <Pressable
            key={c.key}
            onPress={() => onPick(c.key)}
            accessibilityRole="radio"
            accessibilityLabel={`${c.label} theme`}
            accessibilityState={{ selected }}
            hitSlop={6}
            style={[styles.themeCard, { left: c.x, top: c.y }, selected && { transform: [{ scale: 1.08 }] }]}
          >
            <View style={[styles.frame, selected && { borderColor: hex, boxShadow: `0px 0px 24px ${hex}${alpha(0.6)}` }]}>
              {c.key === 'system' ? (
                <View style={styles.split}>
                  <MiniScreen theme="light" hex={hex} />
                  <MiniScreen theme="dark" hex={hex} />
                </View>
              ) : (
                <MiniScreen theme={c.key} hex={hex} />
              )}
            </View>
            <Text style={[styles.themeLabel, face(selected ? 'semibold' : 'regular'), selected && { color: ONBOARDING.ink }]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Every colour here is an ONBOARDING token, the same in every theme, so a plain sheet is right.
const styles = StyleSheet.create({
  box: { width: ART_W, height: ART_H },

  wave: { position: 'absolute', left: 0, right: 0, top: 130, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waveBar: { width: 3, borderRadius: 1.5 },
  player: {
    position: 'absolute',
    left: (ART_W - 208) / 2,
    top: 2,
    width: 208,
    height: 296,
    borderRadius: 30,
    padding: 14,
    backgroundColor: ONBOARDING.card,
    borderWidth: 1,
    borderColor: ONBOARDING.cardEdge,
  },
  playerArt: { width: 180, height: 150, borderRadius: 18 },
  song: { color: ONBOARDING.ink, fontSize: 15, marginTop: 12 },
  artist: { color: ONBOARDING.muted, fontSize: 12, marginTop: 2 },
  seek: { height: 3, borderRadius: 1.5, backgroundColor: ONBOARDING.faint, marginTop: 12, overflow: 'hidden' },
  seekFill: { width: '42%', height: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginTop: 12 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: ONBOARDING.button, alignItems: 'center', justifyContent: 'center' },

  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  hub: {
    position: 'absolute',
    left: ART_W / 2 - 32,
    top: 46,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING.card,
    borderWidth: 1,
    borderColor: ONBOARDING.cardEdge,
  },
  trail: { position: 'absolute', left: ART_W / 2 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: ONBOARDING.muted },
  peak: { position: 'absolute', left: 0, right: 0, bottom: 6, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 7 },
  peakBar: { width: 14, borderRadius: 7 },
  badge: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING.card,
    borderWidth: 1,
    borderColor: ONBOARDING.cardEdge,
  },

  phone: {
    position: 'absolute',
    left: (ART_W - 244) / 2,
    top: 0,
    width: 244,
    height: 240,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    borderWidth: 6,
    borderBottomWidth: 0,
    borderColor: ONBOARDING.cardEdge,
    overflow: 'hidden',
    alignItems: 'center',
  },
  wallpaper: { position: 'absolute', left: 0, top: 0, width: 232, height: 300 },
  wallpaperShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: ONBOARDING.photoShade, opacity: 0.45 },
  island: { width: 74, height: 22, borderRadius: 11, backgroundColor: ONBOARDING.background, marginTop: 10 },
  date: { color: ONBOARDING.ink, opacity: 0.85, fontSize: 12, marginTop: 16 },
  time: { color: ONBOARDING.ink, fontSize: 60, lineHeight: 68, letterSpacing: -1 },
  phoneFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    experimental_backgroundImage: [
      {
        type: 'linear-gradient',
        direction: 'to bottom',
        colorStops: [
          { color: `${ONBOARDING.background}00`, positions: ['0%'] },
          { color: ONBOARDING.background, positions: ['100%'] },
        ],
      },
    ],
  },
  notice: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 168,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: ONBOARDING.card,
    borderWidth: 1,
    borderColor: ONBOARDING.cardEdge,
  },
  appIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  noticeText: { flex: 1, gap: 1 },
  noticeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  noticeApp: { color: ONBOARDING.ink, fontSize: 13 },
  noticeWhen: { color: ONBOARDING.muted, fontSize: 11 },
  noticeTitle: { color: ONBOARDING.ink, fontSize: 13 },
  noticeBody: { color: ONBOARDING.muted, fontSize: 12, lineHeight: 16 },
  noticeTrack: { height: 3, borderRadius: 1.5, backgroundColor: ONBOARDING.faint, marginTop: 6, overflow: 'hidden' },
  noticeFill: { height: 3 },

  ghost: { position: 'absolute', borderRadius: 12 },
  ghostCard: { backgroundColor: ONBOARDING.card },
  themeCard: { position: 'absolute', width: CARD_W, alignItems: 'center', gap: 8 },
  frame: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ONBOARDING.cardEdge,
    overflow: 'hidden',
  },
  split: { flex: 1, flexDirection: 'row' },
  mini: { flex: 1, padding: 6, gap: 5 },
  miniCover: { width: '100%', aspectRatio: 1, borderRadius: 6, maxWidth: 46, alignSelf: 'center' },
  miniLine: { height: 4, borderRadius: 2 },
  miniPlayer: { position: 'absolute', left: 5, right: 5, bottom: 6, height: 11, borderRadius: 4 },
  themeLabel: { color: ONBOARDING.muted, fontSize: 12 },
});
