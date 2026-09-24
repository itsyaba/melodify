import { ScrollView, Switch, Text, View } from 'react-native';
import { IconButton } from '@/components/icon-button';
import {
  ALL_LIBRARY_VIEWS,
  ALL_TABS,
  REQUIRED_TABS,
  setPref,
  usePrefs,
  type LibraryViewKey,
  type TabKey,
} from '@/prefs';
import { makeStyles, spacing, type, useTheme } from '@/theme';

const TAB_LABELS: Record<TabKey, string> = {
  library: 'Library',
  folders: 'Folders',
  queue: 'Queue',
  search: 'Search',
  settings: 'Settings',
};
const VIEW_LABELS: Record<LibraryViewKey, string> = {
  songs: 'Songs',
  albums: 'Albums',
  artists: 'Artists',
  album_artists: 'Album artists',
  genres: 'Genres',
  composers: 'Composers',
  years: 'Years',
  playlists: 'Playlists',
};

/**
 * Which bottom tabs and library views show, and their order. Arrows rather than dragging: the
 * lists are short, and a tab bar change remounts the tabs, which a drag would do mid-gesture.
 */
export function TabsSettingsScreen() {
  const styles = useStyles();
  const prefs = usePrefs();
  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic">
      <OrderedToggles
        title="Tabs"
        footer="Library and Settings always stay. Changing the tabs returns each tab to its first screen."
        all={ALL_TABS}
        shown={prefs.tabs}
        required={REQUIRED_TABS}
        labels={TAB_LABELS}
        onChange={(tabs) => setPref('tabs', tabs)}
      />
      <OrderedToggles
        title="Library views"
        footer="At least one view stays on."
        all={ALL_LIBRARY_VIEWS}
        shown={prefs.libraryViews}
        required={prefs.libraryViews.length === 1 ? prefs.libraryViews : []}
        labels={VIEW_LABELS}
        onChange={(views) => setPref('libraryViews', views)}
      />
    </ScrollView>
  );
}

function OrderedToggles<K extends string>({
  title,
  footer,
  all,
  shown,
  required,
  labels,
  onChange,
}: {
  title: string;
  footer: string;
  all: readonly K[];
  shown: K[];
  required: readonly K[];
  labels: Record<K, string>;
  onChange: (next: K[]) => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const hidden = all.filter((k) => !shown.includes(k));
  const move = (key: K, by: -1 | 1) => {
    const i = shown.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const next = shown.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      {[...shown, ...hidden].map((key) => {
        const on = shown.includes(key);
        const i = shown.indexOf(key);
        return (
          <View key={key} style={styles.row}>
            <Text style={[type.body, { flex: 1, color: on ? colors.label : colors.secondaryLabel }]}>{labels[key]}</Text>
            <IconButton
              name="chevron.up"
              size={16}
              disabled={!on || i === 0}
              onPress={() => move(key, -1)}
              accessibilityLabel={`Move ${labels[key]} up`}
            />
            <IconButton
              name="chevron.down"
              size={16}
              disabled={!on || i === shown.length - 1}
              onPress={() => move(key, 1)}
              accessibilityLabel={`Move ${labels[key]} down`}
            />
            <Switch
              value={on}
              disabled={required.includes(key)}
              trackColor={{ true: colors.tint }}
              onValueChange={(v) => onChange(v ? [...shown, key] : shown.filter((k) => k !== key))}
              accessibilityLabel={`Show ${labels[key]}`}
            />
          </View>
        );
      })}
      <Text style={[type.footnote, styles.footer]}>{footer}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  section: { paddingTop: spacing.xl },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  footer: { color: colors.secondaryLabel, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
}));
