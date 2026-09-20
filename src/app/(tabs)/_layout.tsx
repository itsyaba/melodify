import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { MiniPlayer } from '@/components/mini-player';
import { useCurrentTrack } from '@/player/queue-store';

export default function TabsLayout() {
  // The accessory is only mounted while something is loaded, so an empty queue leaves no bar
  // behind. This reads the current track through a selector rather than the full queue snapshot:
  // the snapshot changes four times a second while playing, and re-rendering NativeTabs at that
  // rate would be wasteful.
  const current = useCurrentTrack();
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      {current ? (
        <NativeTabs.BottomAccessory>
          <MiniPlayer />
        </NativeTabs.BottomAccessory>
      ) : null}
      <NativeTabs.Trigger name="(library)">
        <NativeTabs.Trigger.Icon sf="music.note.list" md="library_music" />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(folders)">
        <NativeTabs.Trigger.Icon sf="folder" md="folder" />
        <NativeTabs.Trigger.Label>Folders</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(queue)">
        <NativeTabs.Trigger.Icon sf="list.number" md="queue_music" />
        <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Icon sf="gear" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(search)" role="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
