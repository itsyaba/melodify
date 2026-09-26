import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, spacing, type } from '@/theme';

/** Header buttons handed up by a list inside a TabScreen, in place of the stack header's. */
export interface HeaderButtons {
  left?: ReactElement;
  right?: ReactElement;
}

type Publish = (buttons: HeaderButtons | null) => void;

const HeaderButtonsContext = createContext<Publish | null>(null);

/** Where useSelectionHeader puts its buttons inside a TabScreen; null under a stack header. */
export function useTabHeaderButtons(): Publish | null {
  return useContext(HeaderButtonsContext);
}

interface Props {
  title: string;
  /** Pinned under the title with it: the view pills, the queue tabs. */
  below?: ReactNode;
  /** The screen's list. It must come first: see below. */
  children: ReactNode;
}

/**
 * A tab's first screen with a header of its own, as Home has: a big title with the header buttons
 * beside it, and `below` under them, pinned and opaque from the status bar down, so the list
 * scrolls beneath rather than through it. The stack's large title is off on these screens: on
 * iOS 26 it is see-through, and it stayed big over the rows instead of collapsing.
 *
 * The header comes after the list in the tree and is laid out above it by column-reverse. iOS
 * finds a screen's scroll view down its chain of first children (tapping the tab again scrolls it
 * to the top, and the tab bar shrinks as it scrolls), so nothing may come before the list.
 */
export function TabScreen({ title, below, children }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [buttons, setButtons] = useState<HeaderButtons | null>(null);
  return (
    <HeaderButtonsContext.Provider value={setButtons}>
      <View style={styles.root}>
        {children}
        <View style={{ paddingTop: insets.top }}>
          <View style={[styles.titleRow, below ? styles.titleRowAbove : null]}>
            <Text numberOfLines={1} style={[type.largeTitle, styles.title]} accessibilityRole="header">
              {title}
            </Text>
            {buttons?.left}
            {buttons?.right}
          </View>
          {below}
        </View>
      </View>
    </HeaderButtonsContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, flexDirection: 'column-reverse', backgroundColor: colors.background },
  // Home's title row, so the tabs match.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  // The pills below bring their own padding.
  titleRowAbove: { paddingBottom: spacing.xs },
  title: { flex: 1, color: colors.label },
}));
