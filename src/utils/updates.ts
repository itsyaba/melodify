import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Which code this copy of the app is running, for Settings. Release builds check Expo's servers
 * for an update at launch, in the background (see `updates` in app.json), and run it from the
 * next launch; this says whether that has happened, and when the update was published.
 */
export function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? '?';
  if (!Updates.isEnabled) return `Melodify ${version}, development build: the code comes from the dev server`;
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `Melodify ${version}, the code this build shipped with`;
  const when = Updates.createdAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `Melodify ${version}, update of ${when} (${Updates.updateId?.slice(0, 8) ?? '?'})`;
}
