// Times the library's real queries against a synthetic library in Node's SQLite, using the app's
// schema and query functions. Run: node --import ./scripts/test-hooks.mjs scripts/bench-library.ts [tracks]
//
// Preferences are stubbed (the real module pulls in React Native); everything else is the app's
// own code, so a slow query here is a slow query on the phone, give or take the phone's speed.
import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/prefs') {
      return { url: 'data:text/javascript,export const getPrefs = () => ({ minDurationMs: 30000 });', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const COUNT = Number(process.argv[2] ?? 10_000);
const { openTestDb } = await import('../src/test-utils/node-sqlite.ts');
const tracks = await import('../src/db/tracks.ts');
const playlists = await import('../src/db/playlists.ts');
const queues = await import('../src/db/queues.ts');

const db = openTestDb();
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

const genres = Array.from({ length: 40 }, (_, i) => `Genre ${i}`);
const artists = Array.from({ length: Math.max(50, Math.round(COUNT / 12)) }, (_, i) => `Artist ${i}`);
const insert = db.raw.prepare(`INSERT INTO tracks (path, folder, filename, ext, size, mtime, title, artist, album,
  album_artist, genre, composer, year, track_no, disc_no, duration_ms, bitrate, sample_rate, art_key, tagged,
  play_count, last_played_at, favorite, added_at) VALUES (?, ?, ?, 'flac', 30000000, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 900000, 44100, ?, 1, ?, ?, ?, ?)`);
db.raw.exec('BEGIN');
let made = 0;
while (made < COUNT) {
  const artist = pick(artists);
  const album = `${artist} Album ${Math.floor(rand() * 5)}`;
  const size = 8 + Math.floor(rand() * 8);
  for (let n = 1; n <= size && made < COUNT; n += 1, made += 1) {
    const folder = `${artist}/${album}`;
    const filename = `${String(n).padStart(2, '0')} Song ${made}.flac`;
    const played = rand() < 0.3;
    insert.run(`${folder}/${filename}`, folder, filename, `Song ${made}`, artist, album, artist, pick(genres),
      rand() < 0.2 ? `Composer ${Math.floor(rand() * 200)}` : null, 1960 + Math.floor(rand() * 64), n,
      120_000 + Math.floor(rand() * 300_000), rand() < 0.8 ? `.artcache/${Math.floor(rand() * 1e9).toString(16)}.jpg` : null,
      played ? Math.floor(rand() * 50) : 0, played ? Date.now() - Math.floor(rand() * 1e10) : null, rand() < 0.05 ? 1 : 0,
      Date.now() - Math.floor(rand() * 1e10));
  }
}
db.raw.exec('COMMIT');
const ids = db.raw.prepare('SELECT id FROM tracks').all().map((r) => Number(r.id));
for (let p = 0; p < 30; p += 1) await playlists.createPlaylist(db, `Playlist ${p}`, ids.slice(p * 100, p * 100 + 150));

const results: { name: string; ms: number; rows: number }[] = [];
async function time(name: string, run: () => Promise<unknown>) {
  await run(); // warm the statement cache, as a second visit to a screen would be
  const runs = 5;
  const start = performance.now();
  let out: unknown;
  for (let i = 0; i < runs; i += 1) out = await run();
  const rows = Array.isArray(out) ? out.length : typeof out === 'object' && out && 'tracks' in out ? (out as { tracks: unknown[] }).tracks.length : 1;
  results.push({ name, ms: (performance.now() - start) / runs, rows });
}

for (const sort of ['title', 'artist', 'album', 'added', 'played', 'plays', 'duration', 'year', 'filename'] as const) {
  await time(`listTracks(${sort})`, () => tracks.listTracks(db, sort));
}
await time('countTracks', () => tracks.countTracks(db));
for (const kind of ['artist', 'album_artist', 'genre', 'composer', 'year'] as const) {
  await time(`listGroups(${kind})`, () => tracks.listGroups(db, kind));
}
for (const sort of ['name', 'artist', 'year', 'tracks', 'added'] as const) await time(`listAlbums(${sort})`, () => tracks.listAlbums(db, sort));
await time('listAlbums(within artist)', () => tracks.listAlbums(db, 'year', { kind: 'artist', value: 'Artist 3' }));
await time('listAlbumTracks', () => tracks.listAlbumTracks(db, 'Artist 3 Album 1', 'Artist 3'));
await time('listGroupTracks(genre)', () => tracks.listGroupTracks(db, 'genre', 'Genre 3'));
await time('listFolder(root)', () => tracks.listFolder(db, ''));
await time('listFolder(artist)', () => tracks.listFolder(db, 'Artist 3'));
await time('listFolderTracksRecursive(artist)', () => tracks.listFolderTracksRecursive(db, 'Artist 3'));
await time('searchTracks("song 12")', () => tracks.searchTracks(db, 'song 12'));
await time('searchAlbums("album 2")', () => tracks.searchAlbums(db, 'album 2'));
await time('searchGroups(artist, "artist 1")', () => tracks.searchGroups(db, 'artist', 'artist 1'));
await time('searchFolders("album")', () => tracks.searchFolders(db, 'album'));
for (const kind of ['favorites', 'recently_added', 'most_played', 'recently_played'] as const) {
  await time(`listAutoPlaylist(${kind})`, () => tracks.listAutoPlaylist(db, kind));
}
await time('listPlaylists', () => playlists.listPlaylists(db));
await time('listPlaylistTracks', () => playlists.listPlaylistTracks(db, 1));
await time(`saveQueueTracks(${ids.length})`, () => queues.saveQueueTracks(db, 1, ids));
await time(`loadQueue(${ids.length})`, () => queues.loadQueue(db, 1));

console.log(`${COUNT} tracks, ${artists.length} artists\n`);
for (const r of results.sort((a, b) => b.ms - a.ms)) {
  console.log(`${r.ms.toFixed(2).padStart(8)} ms  ${String(r.rows).padStart(6)} rows  ${r.name}`);
}
