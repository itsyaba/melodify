import { Platform } from 'react-native';
import { Tabs } from 'expo-router/tabs';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { AndroidTabBar } from '@/components/android-tab-bar';
import { MiniPlayer } from '@/components/mini-player';
import { useCurrentTrack } from '@/player/queue-store';
import { ALL_TABS, usePrefs, type TabKey } from '@/prefs';
import { useTheme } from '@/theme';
import { searchEvents } from '@/utils/events';

function trigger(key: TabKey, hidden: boolean) {
  switch (key) {
    case 'home':
      return (
        <NativeTabs.Trigger key={key} name="(home)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="house" md="home" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'library':
      return (
        <NativeTabs.Trigger key={key} name="(library)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="music.note.list" md="library_music" />
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'artists':
      return (
        <NativeTabs.Trigger key={key} name="(artists)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="music.mic" md="mic" />
          <NativeTabs.Trigger.Label>Artists</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'folders':
      return (
        <NativeTabs.Trigger key={key} name="(folders)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="folder" md="folder" />
          <NativeTabs.Trigger.Label>Folders</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'queue':
      return (
        <NativeTabs.Trigger key={key} name="(queue)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="list.number" md="queue_music" />
          <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'search':
      return (
        // Tapping Search, or tapping it again, puts the cursor in its field, as iOS search tabs do.
        <NativeTabs.Trigger
          key={key}
          name="(search)"
          role="search"
          hidden={hidden}
          listeners={{ tabPress: () => searchEvents.emit('focus', undefined) }}
        >
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
  }
}

const TITLES: Record<TabKey, string> = {
  home: 'Home',
  queue: 'Queue',
  artists: 'Artists',
  folders: 'Folders',
  library: 'Library',
  search: 'Search',
};

export default function TabsLayout() {
  return Platform.OS === 'android' ? <AndroidTabs /> : <IosTabs />;
}

/**
 * Android: JavaScript tabs, so the mini player can sit above the bar (AndroidTabBar); the
 * native bar there has no slot for one. The order and the hidden tabs follow Settings as on iOS.
 */
function AndroidTabs() {
  const { tabs } = usePrefs();
  const order = [...tabs, ...ALL_TABS.filter((t) => !tabs.includes(t))];
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AndroidTabBar {...props} />}>
      {order.map((key) => (
        <Tabs.Screen
          key={key}
          name={`(${key})`}
          options={{ title: TITLES[key], href: tabs.includes(key) ? undefined : null }}
          listeners={key === 'search' ? { tabPress: () => searchEvents.emit('focus', undefined) } : undefined}
        />
      ))}
    </Tabs>
  );
}

function IosTabs() {
  // The accessory is only mounted while something is loaded, so an empty queue leaves no bar
  // behind. This reads the current track through a selector rather than the full queue snapshot:
  // the snapshot changes four times a second while playing, and re-rendering NativeTabs at that
  // rate would be wasteful.
  const current = useCurrentTrack();
  const colors = useTheme();
  const { tabs } = usePrefs();
  // Every tab is declared, the switched-off ones hidden: a route with no trigger at all would be
  // unreachable in a way the router reports as an error rather than just not showing.
  const order = [...tabs, ...ALL_TABS.filter((t) => !tabs.includes(t))];
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={colors.tint}>
      {current ? (
        <NativeTabs.BottomAccessory>
          <MiniPlayer />
        </NativeTabs.BottomAccessory>
      ) : null}
      {order.map((key) => trigger(key, !tabs.includes(key)))}
    </NativeTabs>
  );
}
