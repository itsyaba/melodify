import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface MenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Left out of the sheet entirely, so callers can list items unconditionally. */
  hidden?: boolean;
}

/**
 * A native action sheet: the iOS long-press menu idiom that needs no extra dependency. Items
 * run after the sheet has closed, so an item may open another sheet or a prompt.
 *
 * No `tintColor`: ActionSheetIOS insists on a processed number there, and every theme color is a
 * PlatformColor, which processes to an object and trips its invariant.
 */
export function showMenu(opts: { title?: string; message?: string; items: MenuItem[] }): void {
  const items = opts.items.filter((i) => !i.hidden);
  if (items.length === 0) return;
  if (Platform.OS === 'ios') {
    const destructive = items.flatMap((item, i) => (item.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: opts.title,
        message: opts.message,
        options: [...items.map((i) => i.label), 'Cancel'],
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
