import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { insertTrack, nodeSqliteFiles, openTestDb } from '../test-utils/node-sqlite.ts';
import { Blowfish } from './blowfish.ts';
import { collectBackupSource, collectMusicoletCarry, listLibraryForMatching, writeRestore } from './db.ts';
import { BackupError, buildBackup } from './format.ts';
import { writeJavaStringList } from './java-list.ts';
import { matchTracks } from './match.ts';
import { md5Hex } from './md5.ts';
import { getSetting, setSetting } from '../db/settings.ts';
import { listMostPlayed, summarizeMostPlayed } from '../db/plays.ts';
import { androidToPath, datePlays, pathToAndroid, readBackupZip, SONGS_TABLE, writeBackupZip, type SongRow } from './musicolet.ts';

const bf = new Blowfish(strToU8('JSTMUSIC_2'));
const json = (v: unknown) => strToU8(JSON.stringify(v));
const mc = (folder: string, file: string, id: number) =>
  `musicolet://media-store?p_v=primary&p_rp=${encodeURIComponent(folder)}&p_dn=${encodeURIComponent(file)}&p_id=${id}&p_mt=1`;

/** A Musicolet backup laid out as Musicolet writes one, from plain members. */
function musicoletZip(plain: Record<string, Uint8Array>, opts: { tamper?: string } = {}): Uint8Array {
  const zip: Record<string, Uint8Array> = {};
  const md5: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(plain)) {
    md5[name] = md5Hex(bytes);
    zip[name] = bf.encrypt(opts.tamper === name ? strToU8('changed') : bytes);
  }
  const manifest = json({ v: 540, time: 1_789_582_308_699, md5, equalizer: { numberOfBands: 5 }, db_file: 'DB_SONGS_LOG', DB_BDN: 'DB_BDN', pcs: ['PCs_Y_2025'] });
  zip['0.musicolet.backup'] = bf.encrypt(manifest);
  zip.hash = strToU8(md5Hex(manifest));
  return zipSync(zip);
}

async function songsDb(rows: SongRow[]): Promise<Uint8Array> {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return nodeSqliteFiles.build([
    { sql: 'CREATE TABLE android_metadata (locale TEXT)' },
    { sql: 'INSERT INTO android_metadata VALUES (?)', params: ['en_GB'] },
    { sql: SONGS_TABLE },
    ...rows.map((r) => ({
      sql: `INSERT INTO TABLE_SONGS (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      params: cols.map((c) => r[c] ?? null),
    })),
    { sql: 'PRAGMA user_version = 8' },
  ]);
}

const ONE = mc('Music/Band', 'One.mp3', 11);
const TWO = mc('Music/Band', 'Two.mp3', 12);
const AWAY = mc('Download', 'Away.m4a', 13);
const OLD = 'file:///storage/emulated/0/Music/Old%20Song%20(1).mp3';
const DAY = 86_400_000;

async function sampleBackup(opts: { tamper?: string } = {}) {
  const row = (uri: string, logPath: string, extra: SongRow): SongRow => ({
    COL_PATH: uri, COL_LOGPATH: logPath, COL_ARTIST: 'Band', COL_ALBUM: 'Album', COL_DURATION: 200_000,
    COL_DATE_ADDED: 1_700_000_000_000, COL_NUM_PLAYED_W: 1, COL_VIS_FLAGS: 3073, ...extra,
  });
  const list = (paths: string[], titles: string[] = paths.map(() => '')) => ({
    S_P: paths, S_T: titles, S_AL: paths.map(() => '<unknown>'), S_AR: paths.map(() => 'Band'), S_D: paths.map(() => 180_000),
  });
  return musicoletZip(
    {
      '0.names': writeJavaStringList(['Road', 'Mix']),
      '0.favs': json(list([TWO, OLD], ['Two', 'Old Song'])),
      'Mix.mpl': json(list([ONE, TWO])),
      'Road.mpl': json(list([TWO, AWAY])),
      PP: json([{ key: 'S_PTH_SCN_J', value: '["Storage\\/primary\\/Ringtones","Storage\\/D15E-FC85\\/Voice"]', type: 'String' }, { key: 'k_s_ffd', value: 30, type: 'Integer' }]),
      SSP: json([{ key: 'SQH', value: '["band","two"]', type: 'String' }]),
      PCs_Y_2025: strToU8('play counts, carried as they are'),
      DB_SONGS_LOG: await songsDb([
        row(ONE, 'Storage/primary/Music/Band/One.mp3', { COL_TITLE: 'One', COL_NUM_PLAYED: 7, COL_LAST_PLAYED: 5000, COL_LASTPOS: 42_000 }),
        row(TWO, 'Storage/primary/Music/Band/Two.mp3', { COL_TITLE: 'Two', COL_ARTIST: '<unknown>', COL_NUM_PLAYED: 2 }),
        row(AWAY, 'Storage/primary/Download/Away.m4a', { COL_TITLE: 'Away', COL_NUM_PLAYED: 1 }),
      ]),
      '0.qstk': json({
        S0_CPQ: 1,
        S0_PQ: [
          // Plays Two, Away, One: the shuffle order over the original one. On its second song.
          { S0_PQ_T: 'Queue A', S0_PQ_CPS: 1, S0_PQ_LKP: 63_925, S0_PQ_OQS: { S_P: [ONE, TWO, AWAY] }, S0_PQ_SI: [1, 2, 0] },
          { S0_PQ_T: 'Queue B', S0_PQ_CPS: 0, S0_PQ_LKP: 0, S0_PQ_OQS: { S_P: [AWAY] }, S0_PQ_SI: [0] },
        ],
      }),
    },
    opts,
  );
}

test('Musicolet paths become paths inside the music folder', () => {
  assert.equal(androidToPath(ONE, 'Storage/primary/Music/Band/One.mp3'), 'Music/Band/One.mp3');
  assert.equal(androidToPath(ONE), 'Music/Band/One.mp3');
  assert.equal(androidToPath('x', 'Storage/D15E-FC85/Card/Song.mp3'), 'Card/Song.mp3');
  assert.equal(androidToPath(OLD), 'Music/Old Song (1).mp3');
  assert.equal(androidToPath('file:///storage/D15E-FC85/Jack%20%26%20Jill.mp3'), 'Jack & Jill.mp3');
  assert.equal(androidToPath(mc('', 'Top.mp3', 1)), 'Top.mp3');
});

test('a path Musicolet never had is written as the file in main storage, as its older backups did', () => {
  const made = pathToAndroid('Music/New Recording 12, Jan/ሮፍናን (0).m4a');
  assert.equal(made.uri, 'file:///storage/emulated/0/Music/New%20Recording%2012%2C%20Jan/%E1%88%AE%E1%8D%8D%E1%8A%93%E1%8A%95%20(0).m4a');
  assert.equal(made.logPath, 'Storage/primary/Music/New Recording 12, Jan/ሮፍናን (0).m4a');
  assert.equal(androidToPath(made.uri), 'Music/New Recording 12, Jan/ሮፍናን (0).m4a');
});

test("Musicolet's week, month and year counts become plays dated inside those spans", () => {
  const until = 1000 * DAY;
  const ago = (at: number[]) => at.map((t) => (until - t) / DAY);
  // Played 3 times this week (last 2 days ago), 5 this month, 9 this year, 20 in all.
  const at = datePlays({ COL_NUM_PLAYED: 20, COL_NUM_PLAYED_W: 3, COL_NUM_PLAYED_M: 5, COL_NUM_PLAYED_Y: 9, COL_LAST_PLAYED: until - 2 * DAY }, until);
  assert.equal(at.length, 9);
  assert.equal(ago(at).filter((d) => d >= 2 && d <= 7).length, 3);
  assert.equal(ago(at).filter((d) => d > 7 && d <= 30).length, 2);
  assert.equal(ago(at).filter((d) => d > 30 && d <= 365).length, 4);
  // A week counter ahead of a month that just began still counts toward the month; never past the total.
  assert.equal(ago(datePlays({ COL_NUM_PLAYED: 4, COL_NUM_PLAYED_W: 3, COL_NUM_PLAYED_M: 1 }, until)).filter((d) => d <= 30).length, 3);
  assert.equal(datePlays({ COL_NUM_PLAYED: 2, COL_NUM_PLAYED_Y: 9 }, until).length, 2);
  assert.deepEqual(datePlays({ COL_NUM_PLAYED: 5, COL_NUM_PLAYED_W: 1 }, 0), []);
});

test('reads a Musicolet backup: songs, favorites, playlists in order, queues in play order, settings', async () => {
  const { backup, from, carry } = await readBackupZip(await sampleBackup(), nodeSqliteFiles);
  assert.equal(from, 'musicolet');
  assert.equal(backup.createdAt, 1_789_582_308_699);
  const byPath = new Map(backup.tracks.map((t, i) => [t.path, { ...t, i }]));
  assert.deepEqual(
    { ...byPath.get('Music/Band/One.mp3') },
    { path: 'Music/Band/One.mp3', title: 'One', artist: 'Band', album: 'Album', durationMs: 200_000, playCount: 7, lastPlayedAt: 5000, resumeMs: 42_000, addedAt: 1_700_000_000_000, android: ONE, playedAt: [1_789_582_308_699 - 3.5 * DAY], i: 0 },
  );
  // "<unknown>" is no artist; a favorite the songs table lacks comes in with the list's tags.
  assert.equal(byPath.get('Music/Band/Two.mp3')!.artist, undefined);
  assert.equal(byPath.get('Music/Band/Two.mp3')!.favorite, true);
  assert.deepEqual(
    { ...byPath.get('Music/Old Song (1).mp3') },
    { path: 'Music/Old Song (1).mp3', title: 'Old Song', artist: 'Band', durationMs: 180_000, android: OLD, favorite: true, i: 3 },
  );
  assert.equal(backup.tracks.filter((t) => t.favorite).length, 2);

  const name = (i: number) => backup.tracks[i].title;
  assert.deepEqual(backup.playlists.map((p) => [p.name, p.tracks.map(name)]), [['Road', ['Two', 'Away']], ['Mix', ['One', 'Two']]]);
  assert.deepEqual(backup.queues.map((q) => [q.name, q.tracks.map(name), q.currentIndex, q.currentMs]), [
    ['Queue A', ['Two', 'Away', 'One'], 1, 63_925],
    ['Queue B', ['Away'], 0, 0],
  ]);
  assert.equal(backup.activeQueue, 1);
  assert.deepEqual(backup.excludedFolders, ['Ringtones', 'Voice']);
  assert.deepEqual(backup.settings, { recentSearches: ['band', 'two'] });

  assert.equal(carry.songs.length, 3);
  assert.equal(carry.songs[0].row.COL_NUM_PLAYED_W, 1);
  assert.deepEqual(carry.files.map((f) => f.name), ['PCs_Y_2025', 'PP']);
  assert.deepEqual(carry.meta, { v: 540, equalizer: { numberOfBands: 5 }, locale: 'en_GB' });
});

test('a damaged member or manifest is refused', async () => {
  await assert.rejects(readBackupZip(await sampleBackup({ tamper: 'Mix.mpl' }), nodeSqliteFiles), (err: unknown) => {
    return err instanceof BackupError && /Mix\.mpl does not match/.test(err.message);
  });
  const members = unzipSync(await sampleBackup());
  members.hash = strToU8('0'.repeat(32));
  await assert.rejects(readBackupZip(zipSync(members), nodeSqliteFiles), /manifest does not match/);
  await assert.rejects(readBackupZip(strToU8('not a zip'), nodeSqliteFiles), BackupError);
  await assert.rejects(readBackupZip(zipSync({ 'other.txt': strToU8('x') }), nodeSqliteFiles), /not a Musicolet or Melodify backup/);
});

/** Every member decrypted and checked against the manifest, as Musicolet would. */
function openWritten(zip: Uint8Array) {
  const members = unzipSync(zip);
  const manifestBytes = bf.decrypt(members['0.musicolet.backup']);
  assert.equal(strFromU8(members.hash), md5Hex(manifestBytes));
  const manifest = JSON.parse(strFromU8(manifestBytes));
  const plain: Record<string, Uint8Array> = {};
  for (const [name, sum] of Object.entries(manifest.md5 as Record<string, string>)) {
    plain[name] = bf.decrypt(members[name]);
    assert.equal(md5Hex(plain[name]), sum, name);
  }
  return { members, manifest, plain };
}

function seedLibrary() {
  const db = openTestDb();
  const a = insertTrack(db, 'Band/Album/01 One.flac', { title: 'One', artist: 'Band', album: 'Album', genre: 'Rock', duration_ms: 200_000, favorite: 1, play_count: 7, last_played_at: 5000 });
  const b = insertTrack(db, 'Band/Album/02 Two.flac', { title: 'Two', duration_ms: 210_000 });
  db.raw.exec(`
    INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'Mix', 10, 20), (2, 'A/B', 10, 20), (3, 'mix', 10, 20);
    INSERT INTO playlist_tracks VALUES (1, ${b}, 0), (1, ${a}, 1), (2, ${a}, 0);
    INSERT INTO queue_tracks VALUES (1, ${a}, 0), (1, ${b}, 1);
    UPDATE queues SET current_index = 1, current_ms = 9000 WHERE id = 1;
    INSERT INTO bookmarks (track_id, position_ms, label, created_at) VALUES (${b}, 60000, 'Solo', 30);
    INSERT INTO settings VALUES ('recentSearches', '["band"]');
  `);
  return db;
}

async function backUp(db: ReturnType<typeof openTestDb>) {
  const source = await collectBackupSource(db);
  const backup = buildBackup(source, 'manual', 1234);
  return writeBackupZip(source, backup, await collectMusicoletCarry(db), nodeSqliteFiles);
}

test("Melodify's backup is a Musicolet backup: every member checks out as Musicolet reads them", async () => {
  const zip = await backUp(seedLibrary());
  const { members, manifest, plain } = openWritten(zip);
  assert.equal(manifest.v, 540);
  assert.equal(manifest.time, 1234);
  assert.equal(manifest.db_file, 'DB_SONGS_LOG');
  assert.deepEqual(Object.keys(manifest.md5), ['0.names', '0.favs', 'Mix.mpl', 'A_B.mpl', 'mix 2.mpl', 'PP', 'RPN', 'SSP', 'USP', 'OMV', 'DB_SONGS_LOG', 'DB_BDN', '0.qstk']);
  // Melodify's own copy rides along, outside the manifest and unencrypted.
  assert.ok(members['melodify.json'] && !('melodify.json' in manifest.md5));

  const rows = await nodeSqliteFiles.rows(plain.DB_SONGS_LOG, 'SELECT * FROM TABLE_SONGS ORDER BY COL_PATH');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].COL_PATH, 'file:///storage/emulated/0/Band/Album/01%20One.flac');
  assert.equal(rows[0].COL_LOGPATH, 'Storage/primary/Band/Album/01 One.flac');
  assert.equal(rows[0].COL_NUM_PLAYED, 7);
  assert.equal(rows[0].COL_GENRE, 'Rock');
  assert.equal(rows[1].COL_ARTIST, '<unknown>');
  const [{ user_version }] = await nodeSqliteFiles.rows(plain.DB_SONGS_LOG, 'PRAGMA user_version');
  assert.equal(user_version, 8);

  const queues = JSON.parse(strFromU8(plain['0.qstk']));
  assert.deepEqual(queues.S0_PQ[0].S0_PQ_SI, [0, 1]);
  assert.equal(queues.S0_PQ[0].S0_PQ_CPS, 1);
  assert.equal(JSON.parse(strFromU8(plain['0.favs'])).S_T[0], 'One');
  assert.equal(JSON.parse(strFromU8(plain.SSP))[0].value, '["band"]');
});

test('Melodify reads its own zip back whole, and the Musicolet half alone when that is all there is', async () => {
  const db = seedLibrary();
  const zip = await backUp(db);
  const own = await readBackupZip(zip, nodeSqliteFiles);
  assert.equal(own.from, 'melodify');
  assert.deepEqual(own.backup.bookmarks.map((b) => b.label), ['Solo']);
  assert.ok(own.backup.tracks.every((t) => t.android?.startsWith('file:///storage/emulated/0/')));

  // As Musicolet would hand it back: no melodify.json.
  const members = unzipSync(zip);
  delete members['melodify.json'];
  const { backup, from } = await readBackupZip(zipSync(members), nodeSqliteFiles);
  assert.equal(from, 'musicolet');
  assert.deepEqual(backup.tracks.map((t) => t.path).sort(), ['Band/Album/01 One.flac', 'Band/Album/02 Two.flac']);
  assert.deepEqual(backup.playlists.map((p) => [p.name, p.tracks.length]), [['Mix', 2], ['A_B', 1], ['mix 2', 0]]);
  assert.equal(backup.queues[0].currentIndex, 1);
  assert.equal(backup.tracks.find((t) => t.title === 'One')!.favorite, true);
});

test("restoring a Musicolet backup keeps Musicolet's own data, and the next backup gives it back", async () => {
  const loaded = await readBackupZip(await sampleBackup(), nodeSqliteFiles);
  const db = openTestDb();
  // On the iPhone, the band's folder sits at the top; the download is not there.
  insertTrack(db, 'Band/One.mp3', { title: 'One', artist: 'Band', album: 'Album', duration_ms: 200_000 });
  insertTrack(db, 'Band/Two.mp3', { title: 'Two', duration_ms: 200_000 });
  const match = matchTracks(loaded.backup.tracks, await listLibraryForMatching(db));
  assert.equal(match.remapped, 2);
  await setSetting(db, 'choices', { 'played.period': 'month', 'sort.songs': 'artist' });
  await writeRestore(db, loaded.backup, match.ids, match.rules, loaded.carry, loaded.from);
  assert.deepEqual(await getSetting(db, 'choices'), { 'played.period': 'all', 'sort.songs': 'artist' });
  const ranking = await listMostPlayed(db, '1', null);
  assert.deepEqual(ranking.tracks.map((t) => t.title), ['One', 'Two']);
  assert.deepEqual(ranking.plays, [7, 2]);
  assert.equal((await summarizeMostPlayed(db, '1')).counts.all, 2);
  // Each song's play this week is dated inside the week before the backup; the rest only count in All time.
  const week = await listMostPlayed(db, '1', 7, loaded.backup.createdAt);
  assert.deepEqual(week.tracks.map((t) => t.title), ['One', 'Two']);
  assert.deepEqual(week.plays, [1, 1]);
  assert.equal((await summarizeMostPlayed(db, '1', loaded.backup.createdAt)).counts.week, 2);

  const kept = db.raw.prepare('SELECT uri, path FROM musicolet_songs ORDER BY uri').all().map((r) => ({ ...r }));
  assert.deepEqual(kept, [
    { uri: AWAY, path: null },
    { uri: ONE, path: 'Band/One.mp3' },
    { uri: TWO, path: 'Band/Two.mp3' },
  ]);
  const one = db.raw.prepare("SELECT play_count, resume_ms FROM tracks WHERE path = 'Band/One.mp3'").get() as Record<string, number>;
  assert.deepEqual({ ...one }, { play_count: 7, resume_ms: 42_000 });

  // Played once more on the iPhone, then backed up for Musicolet.
  db.raw.exec("UPDATE tracks SET play_count = 8 WHERE path = 'Band/One.mp3'");
  const zip = await backUp(db);
  const { members, manifest, plain } = openWritten(zip);
  assert.deepEqual(manifest.pcs, ['PCs_Y_2025']);
  assert.equal(manifest.equalizer.numberOfBands, 5);
  const original = unzipSync(await sampleBackup());
  assert.deepEqual(members.PCs_Y_2025, original.PCs_Y_2025);
  assert.deepEqual(members.PP, original.PP);

  const rows = new Map((await nodeSqliteFiles.rows(plain.DB_SONGS_LOG, 'SELECT * FROM TABLE_SONGS')).map((r) => [r.COL_PATH, r]));
  assert.equal(rows.size, 3);
  // The same Musicolet path, Musicolet's own columns, Melodify's count.
  assert.equal(rows.get(ONE)!.COL_NUM_PLAYED, 8);
  assert.equal(rows.get(ONE)!.COL_NUM_PLAYED_W, 1);
  assert.equal(rows.get(ONE)!.COL_VIS_FLAGS, 3073);
  assert.equal(rows.get(ONE)!.COL_LOGPATH, 'Storage/primary/Music/Band/One.mp3');
  // The song not on the iPhone goes back as it came.
  assert.equal(rows.get(AWAY)!.COL_NUM_PLAYED, 1);
  assert.equal(rows.get(AWAY)!.COL_TITLE, 'Away');
  const [locale] = await nodeSqliteFiles.rows(plain.DB_SONGS_LOG, 'SELECT locale FROM android_metadata');
  assert.equal(locale.locale, 'en_GB');
});
