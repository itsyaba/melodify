import type { SQLiteDatabase } from 'expo-sqlite';
import { serial } from './serial';

/**
 * Excluded folders. Excluding one hides everything beneath it from the library straight away
 * and stops the scanner walking it, but keeps the rows, so including it again brings the songs
 * back with their play counts and playlist places intact.
 */
export function listExcludedFolders(db: SQLiteDatabase): Promise<string[]> {
  return db.getAllAsync<{ folder: string }>('SELECT folder FROM excluded_folders ORDER BY folder COLLATE NOCASE').then((rows) =>
    rows.map((r) => r.folder),
  );
}

export function excludeFolder(db: SQLiteDatabase, folder: string): Promise<void> {
  return serial(async () => {
    await db.runAsync('INSERT OR IGNORE INTO excluded_folders (folder) VALUES (?)', folder);
  });
}

export function includeFolder(db: SQLiteDatabase, folder: string): Promise<void> {
  return serial(async () => {
    await db.runAsync('DELETE FROM excluded_folders WHERE folder = ?', folder);
  });
}

/** Whether `folder` is an excluded folder or inside one. */
export function isExcluded(folder: string, excluded: Iterable<string>): boolean {
  for (const e of excluded) {
    if (folder === e || folder.startsWith(`${e}/`)) return true;
  }
  return false;
}
