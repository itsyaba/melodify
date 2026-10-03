import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTrack, openTestDb } from '../test-utils/node-sqlite.ts';
import { createPlaylist, listPlaylistCards } from './playlists.ts';

test("Home's playlist cards: changed last first, the cover, and the artists with the most songs", async () => {
  const db = openTestDb();
  const song = (n: number, artist: string | null, art: string | null = null) =>
    insertTrack(db, `Mix/${n}.mp3`, { title: `Song ${n}`, artist, art_key: art });
  const ids = [
    song(1, 'Teddy Afro'),
    song(2, 'Bob Marley', 'cover-b'),
    song(3, 'bob marley'),
    song(4, null),
    song(5, 'Damian Marley'),
    song(6, 'Aster Aweke'),
    song(7, 'Mahmoud Ahmed'),
  ];
  const mix = await createPlaylist(db, 'Reggae Mix', ids);
  db.raw.prepare('UPDATE playlists SET updated_at = 1 WHERE id = ?').run(mix);
  const empty = await createPlaylist(db, 'Empty');
  db.raw.prepare('UPDATE playlists SET updated_at = 2 WHERE id = ?').run(empty);

  const cards = await listPlaylistCards(db, 10);
  assert.deepEqual(cards.map((c) => c.name), ['Empty', 'Reggae Mix']);
  assert.deepEqual(cards[0], { id: empty, name: 'Empty', track_count: 0, art_key: null, artists: [] });
  const [, reggae] = cards;
  assert.equal(reggae.track_count, 7);
  assert.equal(reggae.art_key, 'cover-b');
  // Bob Marley twice (whatever the case), then the rest in playlist order, four at most.
  assert.deepEqual(reggae.artists.map((a) => a.toLowerCase()), ['bob marley', 'teddy afro', 'damian marley', 'aster aweke']);
  assert.equal((await listPlaylistCards(db, 1)).length, 1);
});
