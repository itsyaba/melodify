import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5Hex } from './md5.ts';

test('matches the RFC 1321 examples', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s);
  assert.equal(md5Hex(utf8('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5Hex(utf8('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5Hex(utf8('message digest')), 'f96b697d7cb7938d525a2f31aaf161d0');
});

test("matches Node's MD5 across block boundaries", () => {
  for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 4097, 100_000]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) & 255);
    assert.equal(md5Hex(bytes), createHash('md5').update(bytes).digest('hex'), `length ${n}`);
  }
});
