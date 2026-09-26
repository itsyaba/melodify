import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { Artwork } from '@/components/artwork';
import { makeStyles, radius, spacing, type, useTheme, VINYL } from '@/theme';

export const LIST_CARD_HEIGHT = 136;
const ART = 108;
const DISC = Math.round(ART * 0.94);
/** How far the record slides out of the sleeve, left of the cover. */
const PEEK = Math.round(DISC / 2 - ART * 0.17);
/** Groove rings, as fractions of the record's width. */
const GROOVES = [0.9, 0.78, 0.66];
const LABEL = 0.4;

interface Props {
  title: string;
  /** What the list is, in a few words, under the title. */
  blurb: string;
  /** Its size, at the foot of the card. */
  meta: string;
  artKey: string | null;
  /** Stands in on the cover while the list has no art. */
  icon: SFSymbol;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}

/** A record, with the accent on its centre label. */
function Vinyl({ size }: { size: number }) {
  const colors = useTheme();
  const ring = (fraction: number) => {
    const d = size * fraction;
    return { width: d, height: d, borderRadius: d / 2, left: (size - d) / 2, top: (size - d) / 2 };
  };
  const label = size * LABEL;
  const hole = size * 0.06;
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      {GROOVES.map((g) => (
        <View key={g} style={[styles.groove, ring(g)]} />
      ))}
      <View style={[styles.sheen, ring(0.97)]} />
      <View style={[styles.label, { width: label, height: label, borderRadius: label / 2, backgroundColor: colors.tint }]}>
        <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2 }]} />
      </View>
    </View>
  );
}

/**
 * One of Home's lists: its name and a line about it on the left, and on the right its cover with a
 * record half out of the sleeve behind it.
 */
export function ListCard({ title, blurb, meta, artKey, icon, width, onPress, onLongPress }: Props) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.headline, styles.title]}>{title}</Text>
        <Text numberOfLines={2} style={[type.footnote, styles.blurb]}>{blurb}</Text>
        <Text numberOfLines={1} style={[type.caption, styles.meta]}>{meta}</Text>
      </View>
      <View style={styles.sleeve}>
        <View style={styles.record}>
          <Vinyl size={DISC} />
        </View>
        <View style={styles.cover}>
          {artKey ? (
            <Artwork artKey={artKey} size={ART} rounded="md" />
          ) : (
            <View style={styles.iconCover}>
              <SymbolView name={icon} size={ART * 0.36} tintColor={colors.onTint} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// The record's colours are the same in every theme, so these need no rebuild on a theme change.
const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: VINYL.disc },
  groove: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: VINYL.groove },
  // A wider, softer ring near the rim, for the light catching the edge.
  sheen: { position: 'absolute', borderWidth: 3, borderColor: VINYL.sheen },
  label: { alignItems: 'center', justifyContent: 'center' },
  hole: { backgroundColor: VINYL.disc },
});

const useStyles = makeStyles((colors) => ({
  card: {
    height: LIST_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.secondaryBackground,
    overflow: 'hidden',
  },
  text: { flex: 1, alignSelf: 'stretch', padding: spacing.md, paddingRight: spacing.sm },
  title: { color: colors.label, fontWeight: '700' },
  blurb: { color: colors.secondaryLabel, marginTop: 2 },
  // Pushed to the card's foot, under however many lines the blurb took.
  meta: { color: colors.secondaryLabel, fontWeight: '600', marginTop: 'auto' },
  sleeve: { width: ART + PEEK, height: ART, marginRight: (LIST_CARD_HEIGHT - ART) / 2 },
  record: { position: 'absolute', left: 0, top: (ART - DISC) / 2 },
  // Casts onto the record, so the cover reads as the sleeve in front of it.
  cover: {
    position: 'absolute',
    right: 0,
    top: 0,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: -3, height: 2 },
  },
  iconCover: {
    width: ART,
    height: ART,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  pressed: { opacity: 0.6 },
}));
