import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { crc32, jsCodec } from './codec.ts';
import { readZip, unzipEntry, writeZip, zipEntry, ZipError } from './zip.ts';

const text = (n: number) => strToU8('Musicolet '.repeat(n));

test("crc32 matches zlib's", () => {
  for (const bytes of [new Uint8Array(), strToU8('a'), text(1000), Uint8Array.from({ length: 5000 }, (_, i) => (i * 97) & 255)]) {
    assert.equal(crc32(bytes), nodeCrc32(bytes));
  }
});

test('reads a zip another zip library wrote, entry by entry', async () => {
  const zip = zipSync({ 'a.txt': text(100), 'Söngs/b.mpl': [text(3), { level: 0 }], empty: new Uint8Array() });
  const entries = readZip(zip);
  assert.deepEqual([...entries.keys()].sort(), ['Söngs/b.mpl', 'a.txt', 'empty']);
  assert.equal(entries.get('a.txt')!.method, 8);
  assert.deepEqual(await unzipEntry(entries.get('a.txt')!, jsCodec), text(100));
  assert.deepEqual(await unzipEntry(entries.get('Söngs/b.mpl')!, jsCodec), text(3));
  assert.equal((await unzipEntry(entries.get('empty')!, jsCodec)).length, 0);
});

test('writes a zip another zip library reads, passing entries through still compressed', async () => {
  const carried = readZip(zipSync({ PP: text(50) })).get('PP')!;
  const entries = [
    await zipEntry('0.favs', text(200), jsCodec),
    await zipEntry('hash', strToU8('c40c64b5'), jsCodec, false),
    carried,
    await zipEntry('ሮፍናን.mpl', text(2), jsCodec),
  ];
  const zip = writeZip(entries, new Date(2026, 8, 16, 21, 11, 42));
  const back = unzipSync(zip);
  assert.deepEqual(back['0.favs'], text(200));
  assert.deepEqual(back.hash, strToU8('c40c64b5'));
  assert.deepEqual(back.PP, text(50));
  assert.deepEqual(back['ሮፍናን.mpl'], text(2));
  // And itself, as it will read Melodify's own backups.
  assert.deepEqual(await unzipEntry(readZip(zip).get('PP')!, jsCodec), text(50));
});

test('the end record points exactly at the central directory, as strict readers insist', async () => {
  const zip = writeZip([await zipEntry('a', text(10), jsCodec), await zipEntry('b', text(20), jsCodec)]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  assert.equal(offset + size, end);
  assert.equal(view.getUint32(offset, true), 0x02014b50);
});

test('what does not compress is stored', async () => {
  let x = 2463534242;
  const noise = Uint8Array.from({ length: 4096 }, () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x & 255;
  });
  assert.equal((await zipEntry('x', noise, jsCodec)).method, 0);
});

test('damage is caught', async () => {
  assert.throws(() => readZip(strToU8('not a zip at all, not even close')), ZipError);
  const zip = zipSync({ a: text(100) });
  const entry = readZip(zip).get('a')!;
  await assert.rejects(unzipEntry({ ...entry, crc: entry.crc ^ 1 }, jsCodec), ZipError);
  await assert.rejects(unzipEntry({ ...entry, data: entry.data.subarray(0, 5) }, jsCodec), ZipError);
});
