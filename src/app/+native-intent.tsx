import { handleOpenedFile, isOpenedFile } from '@/utils/open-with';

/**
 * Links from the system before expo-router sees them. A song opened with Melodify from another
 * app (Android) is not a route: it is played, and the app stays where it is, or opens on Home.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isOpenedFile(path)) {
    handleOpenedFile(path);
    return initial ? '/' : null;
  }
  return path;
}
