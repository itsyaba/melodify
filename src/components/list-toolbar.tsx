import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from '@/components/symbol';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { IconButton } from './icon-button';
import { showMenu } from './menus';

export interface SortOption<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  /** "128 songs · 7:42:10". Left out, with no play buttons, for a header that shows its own. */
  summary?: string;
  sort?: { options: readonly SortOption<T>[]; value: T; onChange: (value: T) => void };
  /** Find in this list: a magnifier that opens a field, which filters as you type. */
  find?: { query: string; onChange: (query: string) => void; placeholder: string };
  onPlay?: () => void;
  onShuffle?: () => void;
  /** Anything else for the sort row, e.g. a grid / list toggle. */
  trailing?: ReactNode;
}

/**
 * The strip above a list. Spotify's sort row first (the order on the left, find and layout on the
 * right), then Musicolet's count and length, with shuffle and a round play button beside them.
 * A list with nothing to sort, find or lay out gets only the second row.
 */
export function ListToolbar<T extends string>({ summary, sort, find, onPlay, onShuffle, trailing }: Props<T>) {
  const styles = useStyles();
  const colors = useTheme();
  const [editing, setEditing] = useState(false);
  const current = sort?.options.find((o) => o.key === sort.value);
  // Kept open while a query is set, so a list that remounts (the albums grid toggle) still shows
  // why it is filtered.
  const finding = find !== undefined && (editing || find.query !== '');

  let top: ReactNode = null;
  if (finding) {
    top = (
      <View style={styles.row}>
        <View style={styles.field}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.secondaryLabel} />
          <TextInput
            value={find.query}
            onChangeText={find.onChange}
            placeholder={find.placeholder}
            placeholderTextColor={colors.tertiaryLabel}
            selectionColor={colors.tint}
            autoFocus={editing}
            // An empty field that loses focus (a scroll, a tap elsewhere) folds back into the sort row.
            onBlur={() => {
              if (!find.query) setEditing(false);
            }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            clearButtonMode="while-editing"
            accessibilityLabel={find.placeholder}
            style={[type.subhead, styles.input]}
          />
        </View>
        <Pressable
          hitSlop={spacing.sm}
          accessibilityRole="button"
          onPress={() => {
            find.onChange('');
            setEditing(false);
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[type.subhead, { color: colors.tint }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  } else if ((sort && current) || find || trailing) {
    top = (
      <View style={styles.row}>
        {sort && current ? (
          <Pressable
            hitSlop={spacing.sm}
            accessibilityRole="button"
            accessibilityLabel={`Sorted by ${current.label}. Change sort order`}
            style={({ pressed }) => [styles.sort, pressed && styles.pressed]}
            onPress={() =>
              showMenu({
                title: 'Sort by',
                items: sort.options.map((o) => ({
                  label: o.label,
                  selected: o.key === sort.value,
                  onPress: () => sort.onChange(o.key),
                })),
              })
            }
          >
            <SymbolView name="arrow.up.arrow.down" size={13} tintColor={colors.label} weight="semibold" />
            <Text style={[type.footnote, styles.sortLabel]}>{current.label}</Text>
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        {find ? (
          <IconButton name="magnifyingglass" size={18} onPress={() => setEditing(true)} accessibilityLabel={find.placeholder} />
        ) : null}
        {trailing}
      </View>
    );
  }

  return (
    <View>
      {top}
      {summary !== undefined || onPlay || onShuffle ? (
        <View style={[styles.row, onPlay && styles.summaryRow]}>
          <Text numberOfLines={1} style={[type.footnote, styles.summary]}>{summary}</Text>
          {onShuffle ? <IconButton name="shuffle" size={20} onPress={onShuffle} accessibilityLabel="Shuffle all" /> : null}
          {onPlay ? (
            <Pressable
              onPress={onPlay}
              accessibilityRole="button"
              accessibilityLabel="Play all"
              style={({ pressed }) => [styles.play, pressed && styles.pressed]}
            >
              <SymbolView name="play.fill" size={18} tintColor={colors.onTint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const PLAY = 44;

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  summaryRow: { minHeight: PLAY + spacing.sm * 2 },
  summary: { flex: 1, color: colors.secondaryLabel },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel: { color: colors.label, fontWeight: '600' },
  spacer: { flex: 1 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  input: { flex: 1, paddingVertical: spacing.sm, color: colors.label },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  pressed: { opacity: 0.5 },
}));
