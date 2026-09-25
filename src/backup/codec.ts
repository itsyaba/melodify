import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Blowfish } from './blowfish';
import { md5Hex } from './md5';

/**
 * The byte work of a backup: Musicolet's cipher, its checksums, and the zip's compression. On the
 * phone this goes to the native module, which does it off the JS thread and many times faster;
 * this file's own JS implementation is for tests, and for builds from before the module had it.
 */
export interface Codec {
  /** Blowfish in ECB mode with PKCS5 padding, under `key`. Rejects on bad padding. */
  blowfish(bytes: Uint8Array, key: Uint8Array, encrypt: boolean): Promise<Uint8Array>;
  /** Lowercase hex. */
  md5(bytes: Uint8Array): Promise<string>;
  /** UTF-8 to a string. Hermes has no TextDecoder, and the JS one is slow on megabytes. */
  text(bytes: Uint8Array): Promise<string>;
  /** Zip's CRC-32. */
  crc32(bytes: Uint8Array): Promise<number>;
  /** Raw DEFLATE, or null when it would not come out smaller. */
  deflate(bytes: Uint8Array): Promise<Uint8Array | null>;
  /** Raw DEFLATE back to `size` bytes. Rejects when it does not come out so. */
  inflate(bytes: Uint8Array, size: number): Promise<Uint8Array>;
}

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

export function crc32(bytes: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const ciphers = new Map<string, Blowfish>();
function cipherFor(key: Uint8Array): Blowfish {
  const id = Array.from(key).join(',');
  let cipher = ciphers.get(id);
  if (!cipher) ciphers.set(id, (cipher = new Blowfish(key)));
  return cipher;
}

export const jsCodec: Codec = {
  async blowfish(bytes, key, encrypt) {
    const cipher = cipherFor(key);
    return encrypt ? cipher.encrypt(bytes) : cipher.decrypt(bytes);
  },
  async md5(bytes) {
    return md5Hex(bytes);
  },
  async text(bytes) {
    return strFromU8(bytes);
  },
  async crc32(bytes) {
    return crc32(bytes);
  },
  async deflate(bytes) {
    if (bytes.length === 0) return null;
    const packed = deflateSync(bytes, { level: 6 });
    return packed.length < bytes.length ? packed : null;
  },
  async inflate(bytes, size) {
    const out = inflateSync(bytes, { out: new Uint8Array(size) });
    if (out.length !== size) throw new Error('the data is damaged');
    return out;
  },
};

/** The native module's functions, as `MelodifyAudioModule` declares them from 0.10.0. */
export interface NativeCodec {
  blowfish(data: Uint8Array, key: Uint8Array, encrypt: boolean): Promise<Uint8Array>;
  md5(data: Uint8Array): Promise<string>;
  utf8(data: Uint8Array): Promise<string>;
  crc32(data: Uint8Array): Promise<number>;
  deflate(data: Uint8Array): Promise<Uint8Array | null>;
  inflate(data: Uint8Array, size: number): Promise<Uint8Array>;
}

/** The bytes as an array of their own: a view into a larger buffer is copied out. */
const whole = (b: Uint8Array) => (b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b : b.slice());

export function nativeCodec(mod: NativeCodec): Codec {
  return {
    blowfish: (bytes, key, encrypt) => mod.blowfish(whole(bytes), whole(key), encrypt),
    md5: (bytes) => mod.md5(whole(bytes)),
    text: (bytes) => mod.utf8(whole(bytes)),
    crc32: (bytes) => mod.crc32(whole(bytes)),
    deflate: (bytes) => mod.deflate(whole(bytes)),
    inflate: (bytes, size) => mod.inflate(whole(bytes), size),
  };
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Whether `codec` gives the right answers: blocks from a real Musicolet backup, the RFC 1321 and
 * zip test values, and deflate both ways against fflate's. A codec that fails is not used, so a
 * slip in the native code shows as slow backups rather than broken ones.
 */
export async function provesItself(codec: Codec): Promise<boolean> {
  try {
    const key = strToU8('JSTMUSIC_2');
    if (hex(await codec.blowfish(new Uint8Array(), key, true)) !== '6866062b3be4cd3c') return false;
    const prefs = strToU8('[{"key":"QANP_LRC"}]');
    const sealed = await codec.blowfish(prefs, key, true);
    if (hex(sealed.subarray(0, 8)) !== '29d4243bbb8b771a') return false;
    if (!same(await codec.blowfish(sealed, key, false), prefs)) return false;
    if ((await codec.md5(strToU8('abc'))) !== '900150983cd24fb0d6963f7d28e17f72') return false;
    const words = 'ሮፍናን, Beyoncé 🔥';
    if ((await codec.text(strToU8(words))) !== words) return false;
    if ((await codec.crc32(strToU8('123456789'))) !== 0xcbf43926) return false;
    const text = strToU8('Musicolet, then Melodify. '.repeat(200));
    const packed = await codec.deflate(text);
    if (!packed || !same(inflateSync(packed), text)) return false;
    if (!same(await codec.inflate(deflateSync(text), text.length), text)) return false;
    return true;
  } catch {
    return false;
  }
}
