import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSetting } from '../../db/settings.ts';
import { insertTrack, openTestDb } from '../../test-utils/node-sqlite.ts';
import { shouldOnboard } from './state.ts';

test('a fresh install starts on the welcome pages, and asks again until they are finished', async () => {
  const db = openTestDb();
  assert.equal(await shouldOnboard(db), true);
  assert.equal(await getSetting(db, 'onboardedAt'), null);
  assert.equal(await shouldOnboard(db), true);
});

test('an install that already has music is marked done without being shown the pages', async () => {
  const db = openTestDb();
  insertTrack(db, 'Band/Album/01 One.flac', { hidden: 1 });
  assert.equal(await shouldOnboard(db, 1234), false);
  assert.equal(await getSetting(db, 'onboardedAt'), 1234);
});

test('once finished, the pages stay away even with an empty library', async () => {
  const db = openTestDb();
  db.raw.exec(`INSERT INTO settings VALUES ('onboardedAt', '99')`);
  assert.equal(await shouldOnboard(db), false);
});
