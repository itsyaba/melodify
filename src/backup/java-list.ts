/**
 * Java's object serialization of a `java.util.ArrayList<String>`, which is how Musicolet stores its
 * playlist names (`0.names`). Only that one shape is read and written; anything else is refused.
 *
 * Strings are in Java's "modified UTF-8": NUL is two bytes, and characters outside the BMP are
 * their two UTF-16 surrogates, three bytes each, rather than four bytes of real UTF-8.
 */
export class JavaListError extends Error {}

const MAGIC = [0xac, 0xed, 0x00, 0x05];
const TC_NULL = 0x70;
const TC_REFERENCE = 0x71;
const TC_CLASSDESC = 0x72;
const TC_OBJECT = 0x73;
const TC_STRING = 0x74;
const TC_ENDBLOCKDATA = 0x78;
const TC_BLOCKDATA = 0x77;
const TC_LONGSTRING = 0x7c;
const BASE_HANDLE = 0x7e0000;
const CLASS = 'java.util.ArrayList';
const SERIAL_VERSION_UID = [0x78, 0x81, 0xd2, 0x1d, 0x99, 0xc7, 0x61, 0x9d];

export function encodeModifiedUtf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 1 && c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

export function decodeModifiedUtf8(bytes: Uint8Array): string {
  const units: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const a = bytes[i];
    if (a < 0x80) {
      units.push(a);
      i += 1;
    } else if ((a & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      units.push(((a & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((a & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      units.push(((a & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      throw new JavaListError('Not modified UTF-8.');
    }
  }
  let text = '';
  // In slices: fromCharCode takes its arguments on the stack.
  for (let i = 0; i < units.length; i += 4096) text += String.fromCharCode(...units.slice(i, i + 4096));
  return text;
}

export function writeJavaStringList(items: string[]): Uint8Array {
  const out: number[] = [...MAGIC, TC_OBJECT, TC_CLASSDESC];
  const u16 = (n: number) => out.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const utf = (s: string) => {
    const bytes = encodeModifiedUtf8(s);
    u16(bytes.length);
    out.push(...bytes);
  };
  utf(CLASS);
  out.push(...SERIAL_VERSION_UID);
  // SC_SERIALIZABLE | SC_WRITE_METHOD, one field: int size.
  out.push(0x03);
  u16(1);
  out.push(0x49);
  utf('size');
  out.push(TC_ENDBLOCKDATA, TC_NULL);
  u32(items.length);
  // ArrayList.writeObject writes the capacity as an int, which it sets to the size.
  out.push(TC_BLOCKDATA, 4);
  u32(items.length);
  for (const item of items) {
    const bytes = encodeModifiedUtf8(item);
    if (bytes.length > 0xffff) throw new JavaListError('A name that long cannot be written.');
    out.push(TC_STRING);
    u16(bytes.length);
    for (const b of bytes) out.push(b);
  }
  out.push(TC_ENDBLOCKDATA);
  return Uint8Array.from(out);
}

export function readJavaStringList(bytes: Uint8Array): string[] {
  let at = 0;
  const fail = (why: string): never => {
    throw new JavaListError(`Not a serialized list of names: ${why}.`);
  };
  const byte = () => (at < bytes.length ? bytes[at++] : fail('it ends early'));
  const u16 = () => (byte() << 8) | byte();
  const u32 = () => ((byte() << 24) | (byte() << 16) | (byte() << 8) | byte()) >>> 0;
  const take = (n: number) => {
    if (at + n > bytes.length) fail('it ends early');
    at += n;
    return bytes.subarray(at - n, at);
  };
  const utf = () => decodeModifiedUtf8(take(u16()));

  for (const b of MAGIC) if (byte() !== b) fail('no serialization header');
  if (byte() !== TC_OBJECT || byte() !== TC_CLASSDESC) fail('no object');
  if (utf() !== CLASS) fail('not an ArrayList');
  take(8);
  byte();
  const fields = u16();
  for (let i = 0; i < fields; i += 1) {
    const typeCode = byte();
    utf();
    // Object and array fields name their class too, as a string or a back-reference.
    if (typeCode === 0x4c || typeCode === 0x5b) {
      const tag = byte();
      if (tag === TC_STRING) utf();
      else if (tag === TC_REFERENCE) take(4);
      else fail('an odd field');
    }
  }
  if (byte() !== TC_ENDBLOCKDATA || byte() !== TC_NULL) fail('an unexpected class');
  const size = u32();
  if (byte() !== TC_BLOCKDATA) fail('no capacity');
  take(byte());

  // Handles: 0 is the class description, 1 the list, then each new string in turn.
  const strings = new Map<number, string>();
  let next = BASE_HANDLE + 2;
  const items: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const tag = byte();
    if (tag === TC_STRING || tag === TC_LONGSTRING) {
      let length = u16();
      if (tag === TC_LONGSTRING) {
        // A 64-bit length: the high half, then the low.
        const high = (length << 16) | u16();
        if (high !== 0) fail('a string too long');
        length = u32();
      }
      const text = decodeModifiedUtf8(take(length));
      strings.set(next, text);
      next += 1;
      items.push(text);
    } else if (tag === TC_REFERENCE) {
      const text = strings.get(u32());
      if (text === undefined) fail('a reference to nothing');
      items.push(text!);
    } else if (tag === TC_NULL) {
      continue;
    } else {
      fail('an entry that is not a string');
    }
  }
  return items;
}
