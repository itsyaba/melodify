import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

export interface MenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Left out of the sheet entirely, so callers can list items unconditionally. */
  hidden?: boolean;
  /** Drawn before the label, as Spotify's menu rows are. */
  icon?: SFSymbol;
  /** The option in force (the current sort order), marked with a check. */
  selected?: boolean;
}

export interface MenuRequest {
  title?: string;
  message?: string;
  /** Cover art beside the title: the song, album or playlist the menu is for. */
  artKey?: string | null;
  /** Round art, for an artist. */
  round?: boolean;
  items: MenuItem[];
}

let host: ((request: MenuRequest) => void) | null = null;

/** The sheet mounted at the root registers here; `showMenu` then goes to it. */
export function setMenuHost(fn: ((request: MenuRequest) => void) | null): void {
  host = fn;
}

/**
 * Spotify's menu: a sheet from the bottom with the item's cover and name on top, then a row
 * per action with its icon (see `MenuHost`). Items run after the sheet has closed, so an item
 * may open another sheet or a prompt.
 */
export function showMenu(opts: MenuRequest): void {
  const items = opts.items.filter((i) => !i.hidden);
  if (items.length === 0) return;
  if (host) {
    host({ ...opts, items });
    return;
  }
  // Before the host has mounted: a native action sheet. No `tintColor`: ActionSheetIOS insists on
  // a processed number there, and every theme color is a PlatformColor, which processes to an object.
  if (Platform.OS === 'ios') {
    const destructive = items.flatMap((item, i) => (item.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: opts.title,
        message: opts.message,
        options: [...items.map((i) => (i.selected ? `✓ ${i.label}` : i.label)), 'Cancel'],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: destructive.length ? destructive : undefined,
      },
      (index) => items[index]?.onPress(),
    );
    return;
  }
  // Elsewhere (the web build used for UI work) an alert is the closest built-in.
  Alert.alert(opts.title ?? '', opts.message, [
    ...items.map((i) => ({ text: i.label, onPress: i.onPress, style: i.destructive ? ('destructive' as const) : undefined })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

/** Resolves with the trimmed text (possibly empty), or null when cancelled. */
export function promptText(title: string, opts: { message?: string; defaultValue?: string; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      resolve(opts.defaultValue?.trim() ?? '');
      return;
    }
    Alert.prompt(
      title,
      opts.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: opts.ok ?? 'OK', onPress: (value?: string) => resolve(value?.trim() ?? '') },
      ],
      'plain-text',
      opts.defaultValue,
    );
  });
}

export function confirm(title: string, message: string | undefined, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
