import { strFromU8, strToU8 } from 'fflate';
import type { Codec } from './codec';

/**
 * Zip files, read and written by entry, with the compression done by a `Codec`. fflate's own zip
 * functions inflate every entry on the way in and deflate every one on the way out. A backup
 * carries megabytes of Musicolet's data that Melodify never looks at, and here those entries pass
 * through as they are, still compressed.
 *
 * No zip64, encryption or multi-disk archives: Musicolet's backups use none of them.
 */
export class ZipError extends Error {}

export interface ZipEntry {
  name: string;
  /** 0 stored, 8 deflated. */
  method: number;
  crc: number;
  /** Uncompressed. */
  size: number;
  /** As stored in the zip. */
  data: Uint8Array;
}

/** An entry for `bytes`: deflated when that helps, stored when it does not or `compress` is off. */
export async function zipEntry(name: string, bytes: Uint8Array, codec: Codec, compress = true): Promise<ZipEntry> {
  const crc = await codec.crc32(bytes);
  const packed = compress && bytes.length > 64 ? await codec.deflate(bytes) : null;
  if (packed && packed.length < bytes.length) return { name, method: 8, crc, size: bytes.length, data: packed };
  return { name, method: 0, crc, size: bytes.length, data: bytes };
}

/** An entry's contents, inflated. Rejects with `ZipError` when they do not check out. */
export async function unzipEntry(entry: ZipEntry, codec: Codec): Promise<Uint8Array> {
  let out: Uint8Array;
  if (entry.method === 0) out = entry.data;
  else if (entry.method === 8) {
    try {
      out = await codec.inflate(entry.data, entry.size);
    } catch {
      throw new ZipError(`${entry.name} is damaged.`);
    }
  } else throw new ZipError(`${entry.name} is compressed in a way Melodify cannot read.`);
  if (out.length !== entry.size || (await codec.crc32(out)) !== entry.crc) throw new ZipError(`${entry.name} is damaged.`);
  return out;
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** The entries of a zip, by name, from its central directory. Directories are left out. */
export function readZip(bytes: Uint8Array): Map<string, ZipEntry> {
  // The end record is the last thing in the file, before a comment of up to 64 KB.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new ZipError('Not a zip file.');
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new ZipError('The zip is damaged.');
    const method = u16(bytes, at + 10);
    const crc = u32(bytes, at + 16);
    const packed = u32(bytes, at + 20);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const skip = nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
    const local = u32(bytes, at + 42);
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + skip;
    if (packed === 0xffffffff || size === 0xffffffff) throw new ZipError('The zip is too large to read.');
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) throw new ZipError('The zip is damaged.');
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (start + packed > bytes.length) throw new ZipError('The zip is damaged.');
    if (name.endsWith('/')) continue;
    entries.set(name, { name, method, crc, size, data: bytes.subarray(start, start + packed) });
  }
  return entries;
}

/** A zip of `entries`, in order, with UTF-8 names, all dated `when`. */
export function writeZip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const year = Math.min(Math.max(when.getFullYear(), 1980), 2107);
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const names = entries.map((e) => strToU8(e.name));
  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  let at = 0;
  const w16 = (v: number) => {
    out[at++] = v & 255;
    out[at++] = (v >>> 8) & 255;
  };
  const w32 = (v: number) => {
    w16(v & 0xffff);
    w16(v >>> 16);
  };
  // What the local and central headers share, from "version needed" to the name's length.
  const common = (e: ZipEntry, name: Uint8Array) => {
    w16(20);
    w16(0x0800); // names are UTF-8
    w16(e.method);
    w16(time);
    w16(date);
    w32(e.crc);
    w32(e.data.length);
    w32(e.size);
    w16(name.length);
    w16(0);
  };

  const offsets: number[] = [];
  entries.forEach((e, i) => {
    offsets.push(at);
    w32(0x04034b50);
    common(e, names[i]);
    out.set(names[i], at);
    at += names[i].length;
    out.set(e.data, at);
    at += e.data.length;
  });
  const central = at;
  entries.forEach((e, i) => {
    w32(0x02014b50);
    w16(20); // made by: MS-DOS attributes, zip 2.0
    common(e, names[i]);
    w16(0); // comment
    w16(0); // disk
    w16(0); // internal attributes
    w32(0); // external attributes
    w32(offsets[i]);
    out.set(names[i], at);
    at += names[i].length;
  });
  const centralLength = at - central;
  w32(0x06054b50);
  w16(0);
  w16(0);
  w16(entries.length);
  w16(entries.length);
  w32(centralLength);
  w32(central);
  w16(0);
  return out;
}
