// Reads a real Musicolet (or Melodify) backup zip the way the app does, prints what a restore
// would bring in, then restores it onto a library that has every song where the backup says, backs
// that up again, and checks the result against the original. Local only; the zip stays yours.
// Run: node --import ./scripts/test-hooks.mjs scripts/musicolet-inspect.ts <backup.zip> [out.zip]
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { strToU8, unzipSync } from 'fflate';

const [zipPath, outPath] = process.argv.slice(2);
if (!zipPath) {
  console.error('usage: musicolet-inspect.ts <backup.zip> [out.zip]');
  process.exit(1);
}
const { insertTrack, nodeSqliteFiles, openTestDb } = await import('../src/test-utils/node-sqlite.ts');
const { readBackupZip, withoutWal, writeBackupZip } = await import('../src/backup/musicolet.ts');
const { collectBackupSource, collectMusicoletCarry, listLibraryForMatching, writeRestore } = await import('../src/backup/db.ts');
const { buildBackup, summarize } = await import('../src/backup/format.ts');
const { matchTracks } = await import('../src/backup/match.ts');
const { Blowfish } = await import('../src/backup/blowfish.ts');
const { md5Hex } = await import('../src/backup/md5.ts');

const time = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
  const start = performance.now();
  const out = await fn();
  console.log(`  ${label}: ${Math.round(performance.now() - start)} ms`);
  return out;
};

const zip = readFileSync(zipPath);
console.log(`${zipPath}: ${(zip.length / 1e6).toFixed(1)} MB`);
const { backup, from, carry } = await time('read', () => readBackupZip(zip, nodeSqliteFiles));
const s = summarize(backup);
console.log(`from ${from}, made ${new Date(backup.createdAt).toISOString()}`);
console.log(`  ${s.songs} songs, ${s.favorites} favorites, ${s.played} with plays, ${s.playlists} playlists, ${s.queues} queues`);
for (const p of backup.playlists) console.log(`  playlist ${p.name}: ${p.tracks.length}`);
backup.queues.forEach((q, i) => {
  const t = backup.tracks[q.tracks[q.currentIndex]];
  const mark = i === backup.activeQueue ? '*' : ' ';
  console.log(`  ${mark}queue ${q.name}: ${q.tracks.length}, at ${q.currentIndex + 1} (${t ? `${t.title} – ${t.artist ?? '?'}` : 'empty'}) ${Math.round(q.currentMs / 1000)} s`);
});
console.log(`  excluded: ${backup.excludedFolders.join(', ') || 'none'}`);
console.log(`  recent searches: ${(backup.settings.recentSearches ?? []).join(', ')}`);
console.log(`  carried: ${carry.files.map((f) => f.name).join(', ')}; Musicolet ${carry.meta.v}, ${carry.meta.locale}`);

// A library with every song at the path the backup gives it.
const db = openTestDb();
const paths = new Set<string>();
for (const t of backup.tracks) {
  // Musicolet can have one file under two of its paths; the library has it once.
  if (paths.has(t.path)) continue;
  paths.add(t.path);
  insertTrack(db, t.path, { title: t.title, artist: t.artist ?? null, album: t.album ?? null, duration_ms: t.durationMs ?? null });
}
const match = await time('match', async () => matchTracks(backup.tracks, await listLibraryForMatching(db)));
console.log(`  matched ${match.exact} by path, ${match.remapped} moved, ${match.byTags} by tags, ${match.missing} missing`);
const counts = await time('restore', () => writeRestore(db, backup, match.ids, match.rules, carry, from));
console.log(`  restored ${counts.songs} songs, ${counts.playlists} playlists, ${counts.queues} queues`);

const source = await collectBackupSource(db);
const again = buildBackup(source, 'manual');
const written = await time('write', async () => writeBackupZip(source, again, await collectMusicoletCarry(db), nodeSqliteFiles));
console.log(`  wrote ${(written.length / 1e6).toFixed(1)} MB`);
if (outPath) writeFileSync(outPath, written);

// Musicolet's side of what was written, against the original.
const bf = new Blowfish(strToU8('JSTMUSIC_2'));
const open = (members: Record<string, Uint8Array>, name: string) => bf.decrypt(members[name]);
const before = unzipSync(zip);
const after = unzipSync(written);
const manifest = JSON.parse(new TextDecoder().decode(open(after, '0.musicolet.backup')));
let bad = 0;
for (const [name, sum] of Object.entries(manifest.md5 as Record<string, string>)) {
  if (md5Hex(open(after, name)) !== sum) {
    bad += 1;
    console.log(`  CHECKSUM WRONG: ${name}`);
  }
}
console.log(`  ${Object.keys(manifest.md5).length} members, ${bad} bad checksums`);
const same = (name: string) =>
  before[name] && after[name] && Buffer.compare(Buffer.from(open(before, name)), Buffer.from(open(after, name))) === 0;
const text = (members: Record<string, Uint8Array>, name: string) => JSON.parse(new TextDecoder().decode(open(members, name)));
for (const name of Object.keys(manifest.md5)) {
  if (!before[name]) continue;
  if (same(name)) {
    console.log(`  ${name}: identical`);
  } else if (name === '0.favs' || name.endsWith('.mpl')) {
    const [a, b] = [text(before, name).S_P as string[], text(after, name).S_P as string[]];
    const lost = a.filter((p) => !b.includes(p)).length;
    console.log(`  ${name}: ${a.length} songs before, ${b.length} after, ${lost} gone, same order: ${a.filter((p) => b.includes(p)).join() === b.join()}`);
  } else if (name === '0.qstk') {
    const [a, b] = [text(before, name), text(after, name)];
    const order = (q: any) => (q.S0_PQ_SI as number[]).map((j) => q.S0_PQ_OQS.S_P[j]);
    const sameQueues = a.S0_PQ.every((q: any, i: number) => {
      const was = order(q);
      const now = order(b.S0_PQ[i]);
      const kept = was.filter((p: string) => now.includes(p));
      return kept.join() === now.join() && now[b.S0_PQ[i].S0_PQ_CPS] === was[q.S0_PQ_CPS];
    });
    console.log(`  ${name}: ${b.S0_PQ.length} queues, active ${b.S0_CPQ} (was ${a.S0_CPQ}), play order and current song kept: ${sameQueues}`);
  } else {
    console.log(`  ${name}: differs`);
  }
}
const rows = async (members: Record<string, Uint8Array>) =>
  new Map((await nodeSqliteFiles.rows(withoutWal(open(members, 'DB_SONGS_LOG')), 'SELECT * FROM TABLE_SONGS')).map((r) => [r.COL_PATH, r]));
const [was, now] = [await rows(before), await rows(after)];
let changed = 0;
const columns = new Map<string, number>();
for (const [uri, row] of was) {
  const next = now.get(uri);
  if (!next) {
    changed += 1;
    continue;
  }
  for (const key of Object.keys(row)) {
    if (row[key] !== next[key]) columns.set(key, (columns.get(key) ?? 0) + 1);
  }
}
console.log(`  songs table: ${was.size} rows before, ${now.size} after, ${changed} gone`);
for (const [key, n] of columns) console.log(`    ${key} differs on ${n} rows`);
