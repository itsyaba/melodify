import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { strToU8 } from 'fflate';
import { crc32, jsCodec, nativeCodec, provesItself, type NativeCodec } from './codec.ts';

test("crc32 matches zlib's", () => {
  for (const bytes of [new Uint8Array(), strToU8('a'), strToU8('Musicolet '.repeat(1000)), Uint8Array.from({ length: 5000 }, (_, i) => (i * 97) & 255)]) {
    assert.equal(crc32(bytes), zlibCrc32(bytes));
  }
});

test('the JS codec gives the right answers', async () => {
  assert.equal(await provesItself(jsCodec), true);
});

test('a codec with any wrong answer is not trusted', async () => {
  const wrong = [
    { ...jsCodec, md5: async () => 'd41d8cd98f00b204e9800998ecf8427e' },
    { ...jsCodec, text: async () => 'ሮፍናን, Beyonce' },
    { ...jsCodec, crc32: async () => 0 },
    { ...jsCodec, blowfish: async (b: Uint8Array) => b },
    { ...jsCodec, deflate: async () => null },
    { ...jsCodec, inflate: async () => { throw new Error('no'); } },
  ];
  for (const codec of wrong) assert.equal(await provesItself(codec), false);
});

test('the native codec is handed whole arrays, never views into a larger buffer', async () => {
  const seen: Uint8Array[] = [];
  const record = <T>(value: T) => async (data: Uint8Array) => {
    seen.push(data);
    return value;
  };
  const fake: NativeCodec = {
    blowfish: async (data) => (seen.push(data), data),
    md5: record('x'),
    utf8: record(''),
    crc32: record(0),
    deflate: record(null),
    inflate: async (data) => (seen.push(data), data),
  };
  const codec = nativeCodec(fake);
  const buffer = new Uint8Array(64);
  const view = buffer.subarray(8, 24);
  await codec.md5(view);
  await codec.crc32(view);
  await codec.blowfish(view, strToU8('JSTMUSIC_2'), true);
  await codec.deflate(buffer);
  for (const data of seen) assert.equal(data.byteLength, data.buffer.byteLength);
  // A whole array goes as it is, uncopied.
  assert.equal(seen.at(-1), buffer);
});
