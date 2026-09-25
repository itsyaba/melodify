import { ScrollView } from 'react-native';
import { OrderedToggles } from '@/components/ordered-toggles';
import {
  ALL_LIBRARY_VIEWS,
  ALL_TABS,
  REQUIRED_TABS,
  setPref,
  usePrefs,
  type LibraryViewKey,
  type TabKey,
} from '@/prefs';
import { makeStyles } from '@/theme';

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

/** Which bottom tabs and library views show, and their order. */
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

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
