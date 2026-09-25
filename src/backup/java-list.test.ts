import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeModifiedUtf8, encodeModifiedUtf8, JavaListError, readJavaStringList, writeJavaStringList } from './java-list.ts';

// What Java's ObjectOutputStream writes for `new ArrayList<>(List.of("Road", "Mix"))`, byte for
// byte as in Musicolet's `0.names`.
const ROAD_MIX =
  'aced0005' + '7372' + '0013' + Buffer.from('java.util.ArrayList').toString('hex') + '7881d21d99c7619d' +
  '03' + '0001' + '49' + '0004' + Buffer.from('size').toString('hex') + '78' + '70' + '00000002' +
  '7704' + '00000002' + '740004' + Buffer.from('Road').toString('hex') + '740003' + Buffer.from('Mix').toString('hex') + '78';

test("writes an ArrayList of strings exactly as Java's serialization does", () => {
  assert.equal(Buffer.from(writeJavaStringList(['Road', 'Mix'])).toString('hex'), ROAD_MIX);
});

test('reads it back, including names outside ASCII', () => {
  assert.deepEqual(readJavaStringList(Buffer.from(ROAD_MIX, 'hex')), ['Road', 'Mix']);
  const names = ['ዘማሪት', 'Rap 🔥', 'with\u0000nul', ''];
  assert.deepEqual(readJavaStringList(writeJavaStringList(names)), names);
  assert.deepEqual(readJavaStringList(writeJavaStringList([])), []);
});

test("modified UTF-8: NUL takes two bytes, and an emoji is two three-byte surrogates", () => {
  assert.deepEqual(encodeModifiedUtf8('\u0000'), [0xc0, 0x80]);
  assert.equal(encodeModifiedUtf8('🔥').length, 6);
  assert.equal(decodeModifiedUtf8(Uint8Array.from(encodeModifiedUtf8('é🔥'))), 'é🔥');
});

test('a repeated name comes back through its back-reference', () => {
  // The second entry points at the first string, handle 0x7e0002.
  const bytes = Buffer.from(ROAD_MIX.replace('740003' + Buffer.from('Mix').toString('hex'), '71007e0002'), 'hex');
  assert.deepEqual(readJavaStringList(bytes), ['Road', 'Road']);
});

test('refuses anything that is not a serialized list', () => {
  assert.throws(() => readJavaStringList(new TextEncoder().encode('{"S_P":[]}')), JavaListError);
  assert.throws(() => readJavaStringList(Buffer.from(ROAD_MIX.slice(0, 80), 'hex')), JavaListError);
});
