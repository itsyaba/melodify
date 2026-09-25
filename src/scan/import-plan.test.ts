import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportProgress } from '@/utils/events';
import {
  cloudPlaceholderFor,
  freeName,
  importFolderName,
  importKind,
  importSummary,
  isInside,
  planFolderImport,
} from './import-plan.ts';

test('songs, and the covers, lyrics and playlists beside them', () => {
  assert.equal(importKind('01 Song.FLAC'), 'song');
  assert.equal(importKind('book.m4b'), 'song');
  assert.equal(importKind('cover.jpg'), 'extra');
  assert.equal(importKind('Folder.PNG'), 'extra');
  assert.equal(importKind('01 Song.lrc'), 'extra');
  assert.equal(importKind('Mix.m3u8'), 'extra');
});

test('leaves other files behind', () => {
  assert.equal(importKind('booklet.jpg'), null);
  assert.equal(importKind('rip.log'), null);
  assert.equal(importKind('song.ogg'), null);
  assert.equal(importKind('README'), null);
});

test('leaves hidden files behind, macOS shadow files too', () => {
  assert.equal(importKind('._01 Song.mp3'), null);
  assert.equal(importKind('.DS_Store'), null);
});

test('iCloud placeholders name the file they stand for', () => {
  assert.equal(cloudPlaceholderFor('.01 Song.mp3.icloud'), '01 Song.mp3');
  assert.equal(cloudPlaceholderFor('01 Song.mp3'), null);
  assert.equal(cloudPlaceholderFor('.icloud'), null);
});

test('free names count up before the extension', () => {
  const taken = new Set(['Song.mp3', 'Song 2.mp3']);
  assert.equal(freeName('Other.mp3', (n) => taken.has(n)), 'Other.mp3');
  assert.equal(freeName('Song.mp3', (n) => taken.has(n)), 'Song 3.mp3');
  assert.equal(freeName('noext', (n) => n === 'noext'), 'noext 2');
});

test('a picked folder keeps its name, unless it would be hidden or merge into Melodify/', () => {
  assert.equal(importFolderName('Music'), 'Music');
  assert.equal(importFolderName(' Music '), 'Music');
  assert.equal(importFolderName('.hidden'), 'hidden');
  assert.equal(importFolderName('...'), 'Imported');
  assert.equal(importFolderName('melodify'), 'melodify (imported)');
});

test('inside, across /private/var and percent-encoding', () => {
  const docs = 'file:///var/mobile/Containers/Data/Application/ABC/Documents/';
  assert.ok(isInside('file:///private/var/mobile/Containers/Data/Application/ABC/Documents/My%20Music/', docs));
  assert.ok(isInside(docs, docs));
  assert.ok(!isInside('file:///var/mobile/Containers/Data/Application/ABC/Documents2/', docs));
  assert.ok(!isInside('file:///private/var/mobile/Library/Mobile%20Documents/Music/', docs));
});

test('a folder plan copies what is new and counts the rest', () => {
  const entries = [
    { rel: 'A/01 One.mp3', name: '01 One.mp3' },
    { rel: 'A/02 Two.mp3', name: '02 Two.mp3' },
    { rel: 'A/cover.jpg', name: 'cover.jpg' },
    { rel: 'A/.03 Three.flac.icloud', name: '.03 Three.flac.icloud' },
    { rel: 'A/.cover.jpg.icloud', name: '.cover.jpg.icloud' },
    { rel: 'A/notes.txt', name: 'notes.txt' },
    { rel: 'A/._02 Two.mp3', name: '._02 Two.mp3' },
  ];
  const plan = planFolderImport(entries, (rel) => rel === 'A/01 One.mp3');
  assert.deepEqual(plan.copy.map((e) => e.rel), ['A/02 Two.mp3', 'A/cover.jpg']);
  assert.equal(plan.songs, 1);
  assert.equal(plan.skipped, 1);
  assert.equal(plan.notDownloaded, 1);
});

function progress(over: Partial<ImportProgress>): ImportProgress {
  return { phase: 'done', folder: 'Music', total: 0, copied: 0, skipped: 0, failed: 0, notDownloaded: 0, unsupported: 0, ...over };
}

test('summaries', () => {
  assert.equal(importSummary(progress({ copied: 1, total: 1 })), 'Imported 1 song');
  assert.equal(
    importSummary(progress({ copied: 12, skipped: 3, failed: 1 })),
    'Imported 12 songs (3 already there, 1 failed)',
  );
  assert.equal(importSummary(progress({ copied: 4, stopped: true })), 'Stopped after importing 4 songs');
  assert.equal(importSummary(progress({ skipped: 8 })), 'All 8 songs were already imported');
  assert.equal(importSummary(progress({ skipped: 1 })), 'That song was already imported');
  assert.equal(importSummary(progress({ unsupported: 2 })), 'Nothing imported (2 not playable)');
  assert.equal(importSummary(progress({ notDownloaded: 5 })), 'Nothing imported (5 not downloaded from iCloud)');
  assert.equal(importSummary(progress({ message: 'No songs Melodify can play are in X' })), 'No songs Melodify can play are in X');
  assert.equal(importSummary(progress({ phase: 'error', message: 'Not enough space' })), 'Not enough space');
});
