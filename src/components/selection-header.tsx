import { useLayoutEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import type { Selection } from '@/hooks/use-selection';
import { colors, spacing, type } from '@/theme';
import { IconButton } from './icon-button';

interface Options {
  selection: Selection;
  /** Rows that can be selected, for Select All. */
  count: number;
  /** Opens the batch actions for the current selection. */
  onActions: () => void;
  /** Outside selection mode: an ellipsis button in the header, e.g. for a playlist's own actions. */
  onMenu?: () => void;
  /** Outside selection mode: a "Select" button, so multi-select is findable without a long press. */
  selectable?: boolean;
}

/**
 * Owns the screen's header buttons. In selection mode: Select All on the left (standing in for
 * the back button, as Mail and Files do), actions and Done on the right. Callbacks are read
 * through a ref when pressed, so the header is only rebuilt when what it shows changes.
 */
export function useSelectionHeader({ selection, count, onActions, onMenu, selectable = true }: Options) {
  const navigation = useNavigation();
  const latest = useRef({ selection, count, onActions, onMenu });
  latest.current = { selection, count, onActions, onMenu };

  const { active } = selection;
  const size = selection.selected.size;
  const all = count > 0 && size === count;
  const hasMenu = onMenu !== undefined;

  useLayoutEffect(() => {
    if (active) {
      navigation.setOptions({
        headerBackVisible: false,
        headerLeft: () => (
          <HeaderText
            label={all ? 'Deselect All' : 'Select All'}
            onPress={() => latest.current.selection.setAll(latest.current.count, !all)}
          />
        ),
        headerRight: () => (
          <View style={styles.row}>
            <IconButton
              name="ellipsis.circle"
              disabled={size === 0}
              onPress={() => latest.current.onActions()}
              accessibilityLabel={`Actions for ${size} selected`}
            />
            <HeaderText label="Done" strong onPress={() => latest.current.selection.end()} />
          </View>
        ),
      });
    } else {
      navigation.setOptions({
        headerBackVisible: true,
        headerLeft: undefined,
        headerRight:
          hasMenu || (selectable && count > 0)
            ? () => (
                <View style={styles.row}>
                  {selectable && count > 0 ? (
                    <HeaderText label="Select" onPress={() => latest.current.selection.start()} />
                  ) : null}
                  {hasMenu ? (
                    <IconButton name="ellipsis.circle" onPress={() => latest.current.onMenu?.()} accessibilityLabel="More" />
                  ) : null}
                </View>
              )
            : undefined,
      });
    }
  }, [navigation, active, all, size, hasMenu, selectable, count]);

  // A list that unmounts (switching library views) leaves the header clean for whatever is next.
  // A layout effect so this runs before, not after, the replacement's own header setup.
  useLayoutEffect(
    () => () => navigation.setOptions({ headerBackVisible: true, headerLeft: undefined, headerRight: undefined }),
    [navigation],
  );
}

function HeaderText({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={spacing.sm} accessibilityRole="button" style={styles.text}>
      <Text style={[type.body, { color: colors.tint, fontWeight: strong ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  text: { paddingHorizontal: spacing.xs },
});
