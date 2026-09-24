import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { MiniPlayer } from '@/components/mini-player';
import { useCurrentTrack } from '@/player/queue-store';
import { ALL_TABS, usePrefs, type TabKey } from '@/prefs';
import { useTheme } from '@/theme';

function trigger(key: TabKey, hidden: boolean) {
  switch (key) {
    case 'library':
      return (
        <NativeTabs.Trigger key={key} name="(library)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="music.note.list" md="library_music" />
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
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
    case 'settings':
      return (
        <NativeTabs.Trigger key={key} name="(settings)" hidden={hidden}>
          <NativeTabs.Trigger.Icon sf="gear" md="settings" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
    case 'search':
      return (
        <NativeTabs.Trigger key={key} name="(search)" role="search" hidden={hidden}>
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      );
  }
}

export default function TabsLayout() {
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
