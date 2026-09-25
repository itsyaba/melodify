import type { Track } from '@/db/types';

/**
 * The fields the tag editor edits, and how each maps to TagLib's property names. Pure, so the
 * mapping and the batch "keep different values" logic are tested without the native side.
 */
export interface TagEdit {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  composer?: string;
  year?: string;
  track?: string;
  disc?: string;
  comment?: string;
}

export type TagField = keyof TagEdit;

export const PROPERTY: Record<TagField, string> = {
  title: 'TITLE',
  artist: 'ARTIST',
  album: 'ALBUM',
  albumArtist: 'ALBUMARTIST',
  genre: 'GENRE',
  composer: 'COMPOSER',
  year: 'DATE',
  track: 'TRACKNUMBER',
  disc: 'DISCNUMBER',
  comment: 'COMMENT',
};

/** Only the fields present in `edit`, trimmed. An empty string stays, meaning "clear it". */
export function propertiesFor(edit: TagEdit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(edit) as [TagField, string | undefined][]) {
    if (value === undefined) continue;
    out[PROPERTY[field]] = value.trim();
  }
  return out;
}

/** What the editor starts from for one song: its row, as text. */
export function fieldsOf(track: Track): Required<Omit<TagEdit, 'comment'>> {
  const text = (v: string | number | null) => (v == null ? '' : String(v));
  return {
    title: track.title,
    artist: text(track.artist),
    album: text(track.album),
    albumArtist: text(track.album_artist),
    genre: text(track.genre),
    composer: text(track.composer),
    year: text(track.year),
    track: text(track.track_no),
    disc: text(track.disc_no),
  };
}

/**
 * For several songs: each field's value where they all agree, or null where they differ, which
 * the editor shows as "different values" and leaves alone unless it is typed over.
 */
export function commonFields(tracks: Track[]): Record<Exclude<TagField, 'comment'>, string | null> {
  const all = tracks.map(fieldsOf);
  const keys = Object.keys(all[0] ?? fieldsOf({ title: '' } as Track)) as Exclude<TagField, 'comment'>[];
  const out = {} as Record<Exclude<TagField, 'comment'>, string | null>;
  for (const key of keys) {
    const first = all[0]?.[key] ?? '';
    out[key] = all.every((f) => f[key] === first) ? first : null;
  }
  return out;
}

/** Year and numbers must be numbers, or empty to clear; "3/12" is accepted for track and disc. */
export function validate(edit: TagEdit): string | null {
  if (edit.year && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(edit.year.trim())) return 'The year should look like 2011.';
  for (const field of ['track', 'disc'] as const) {
    const v = edit[field]?.trim();
    if (v && !/^\d{1,4}(\/\d{1,4})?$/.test(v)) return `The ${field} number should be a number, like 3 or 3/12.`;
  }
  return null;
}
