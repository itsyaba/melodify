import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Blowfish, BlowfishError } from './blowfish.ts';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const utf8 = (s: string) => new TextEncoder().encode(s);

test('matches the published Blowfish test vectors', () => {
  const vectors: [key: string, plain: string, cipher: string][] = [
    ['0000000000000000', '0000000000000000', '4ef997456198dd78'],
    ['ffffffffffffffff', 'ffffffffffffffff', '51866fd5b85ecb8a'],
    ['3000000000000000', '1000000000000001', '7d856f9a613063f2'],
    ['0123456789abcdef', '1111111111111111', '61f9c3802281b096'],
    ['fedcba9876543210', '0123456789abcdef', '0aceab0fc6a0a28d'],
  ];
  for (const [key, plain, cipher] of vectors) {
    assert.equal(toHex(new Blowfish(hex(key)).encryptRaw(hex(plain))), cipher, `key ${key}`);
  }
});

test("matches blocks from a real Musicolet backup, under Musicolet's key", () => {
  const bf = new Blowfish(utf8('JSTMUSIC_2'));
  // An empty file is one block of padding.
  assert.equal(toHex(bf.encrypt(new Uint8Array())), '6866062b3be4cd3c');
  // Every preferences file starts `[{"key":`.
  assert.equal(toHex(bf.encryptRaw(utf8('[{"key":'))), '29d4243bbb8b771a');
  assert.equal(bf.decrypt(hex('6866062b3be4cd3c')).length, 0);
});

test('pads to whole blocks and round-trips any length', () => {
  const bf = new Blowfish(utf8('JSTMUSIC_2'));
  for (const n of [0, 1, 7, 8, 9, 15, 16, 1000]) {
    const plain = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
    const cipher = bf.encrypt(plain);
    assert.equal(cipher.length, (Math.floor(n / 8) + 1) * 8);
    assert.deepEqual(bf.decrypt(cipher), plain);
  }
});

test('a wrong key or a damaged file fails on the padding', () => {
  const cipher = new Blowfish(utf8('JSTMUSIC_2')).encrypt(utf8('{"S_P":[]}'));
  assert.throws(() => new Blowfish(utf8('other key')).decrypt(cipher), BlowfishError);
  assert.throws(() => new Blowfish(utf8('JSTMUSIC_2')).decrypt(cipher.subarray(0, 5)), BlowfishError);
});
