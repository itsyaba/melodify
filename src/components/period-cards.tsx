import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Artwork } from '@/components/artwork';
import { SymbolView } from '@/components/symbol';
import { face } from '@/screens/onboarding/fonts';
import { makeStyles, ON_TINT_FAINT, ON_TINT_MUTED, radius, SHEEN, spacing, type, useTheme } from '@/theme';
import { formatCount } from '@/utils/format';

export interface PeriodOption<K extends string> {
  key: K;
  label: string;
  /** Songs inside the span; undefined until counted. */
  count: number | undefined;
  /** A few covers from the span, stacked at the top of its card. */
  covers: readonly string[];
}

interface Props<K extends string> {
  options: readonly PeriodOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

const GAP = spacing.md;
const COVER = 34;
/** How much of each cover the next one hides. */
const OVERLAP = 12;

/**
 * The spans a list can cover (Recently added's days, Most played's weeks and months), as tall
 * cards two to a row. An odd one out at the end spans the whole row.
 */
export function PeriodCards<K extends string>({ options, value, onChange }: Props<K>) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const half = Math.floor((width - spacing.lg * 2 - GAP) / 2);
  const full = width - spacing.lg * 2;
  return (
    <View style={styles.cards} accessibilityRole="tablist">
      {options.map((o, i) => (
        <PeriodCard
          key={o.key}
          option={o}
          selected={o.key === value}
          width={options.length % 2 === 1 && i === options.length - 1 ? full : half}
          onPress={() => onChange(o.key)}
        />
      ))}
    </View>
  );
}

/**
 * One span: the covers fanned out at the top, then how many songs it holds, large, over its name.
 * The chosen one is filled with the accent, lit from above, with a check in its corner.
 */
function PeriodCard<K extends string>({
  option,
  selected,
  width,
  onPress,
}: {
  option: PeriodOption<K>;
  selected: boolean;
  width: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const { label, count, covers } = option;
  const ink = selected ? colors.onTint : colors.label;
  const muted = selected ? ON_TINT_MUTED : colors.secondaryLabel;
  // The ring round each cover is the card's own color, so the covers look cut out of it.
  const ring = selected ? colors.tint : colors.secondaryBackground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count === undefined ? '' : formatCount(count, 'song')}`}
      style={({ pressed }) => [styles.card, { width }, selected && styles.selected, pressed && styles.pressed]}
    >
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheen]} /> : null}
      <View style={styles.top}>
        <View style={styles.covers}>
          {covers.length ? (
            covers.map((key, i) => (
              <View key={key} style={[styles.cover, { borderColor: ring, marginLeft: i ? -OVERLAP : 0, zIndex: covers.length - i }]}>
                <Artwork artKey={key} size={COVER} rounded="sm" />
              </View>
            ))
          ) : (
            <View style={[styles.noCover, selected && styles.noCoverSelected]}>
              <SymbolView name="music.note" size={16} tintColor={muted} />
            </View>
          )}
        </View>
        {selected ? <SymbolView name="checkmark.circle.fill" size={22} tintColor={colors.onTint} /> : null}
      </View>
      <View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.count, face('semibold'), { color: ink }]}>
          {count === undefined ? ' ' : count.toLocaleString()}
        </Text>
        <Text numberOfLines={1} style={[type.subhead, styles.label, { color: muted }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  card: {
    height: 132,
    justifyContent: 'space-between',
    padding: spacing.md + 2,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.secondaryBackground,
  },
  selected: {
    backgroundColor: colors.tint,
    // A glow in the accent under the chosen card.
    shadowColor: colors.tint,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'visible',
  },
  sheen: {
    borderRadius: 20,
    experimental_backgroundImage: [
      {
        type: 'linear-gradient',
        direction: '160deg',
        colorStops: [
          { color: SHEEN.light, positions: ['0%'] },
          { color: SHEEN.clear, positions: ['45%'] },
          { color: SHEEN.shade, positions: ['100%'] },
        ],
      },
    ],
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  covers: { flexDirection: 'row' },
  cover: { borderWidth: 2, borderRadius: radius.sm + 2 },
  noCover: {
    width: COVER,
    height: COVER,
    borderRadius: COVER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  noCoverSelected: { backgroundColor: ON_TINT_FAINT },
  count: { fontSize: 32, lineHeight: 38, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  label: { fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
}));
