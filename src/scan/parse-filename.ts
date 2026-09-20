/**
 * Best-effort metadata from a path when tags haven't been read yet.
 * Handles "Artist/Album/01 - Title.flac", "Artist/Album/1-02 Title.mp3", "Title.mp3",
 * and underscore-joined downloads like "10_Artist_-_Title.mp3".
 */
export interface GuessedTags {
  title: string;
  artist: string | null;
  album: string | null;
  track_no: number | null;
  disc_no: number | null;
}

const LEADING_NUMBER = /^(?:(\d{1,2})[-.])?(\d{1,3})\s*[-._)\]]?\s+(.+)$/;
/** "Artist - Title", with an ASCII hyphen, en dash or em dash. */
const ARTIST_SPLIT = /\s[-–—]\s/;

/**
 * Downloaders join words with underscores ("10_Artist_-_Title"), which hides both the
 * track number and the artist separator from the patterns below. Treat them as spaces.
 */
function normalize(segment: string): string {
  return segment.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function guessTags(relativePath: string): GuessedTags {
  const parts = relativePath.split('/');
  const filename = parts.pop() ?? relativePath;
  const stem = normalize(filename.replace(/\.[^.]+$/, ''));
  const album = parts.length >= 1 ? normalize(parts[parts.length - 1]) : null;
  const artist = parts.length >= 2 ? normalize(parts[parts.length - 2]) : null;

  let title = stem;
  let track_no: number | null = null;
  let disc_no: number | null = null;

  const m = LEADING_NUMBER.exec(title);
  if (m) {
    disc_no = m[1] ? Number(m[1]) : null;
    track_no = Number(m[2]);
    title = m[3].trim();
  }

  // "Artist - Title" inside the filename when the folder didn't tell us the artist.
  // Split on the first separator only; any later dash belongs to the title.
  if (!artist) {
    const split = ARTIST_SPLIT.exec(title);
    if (split) {
      return {
        title: title.slice(split.index + split[0].length).trim(),
        artist: title.slice(0, split.index).trim(),
        album,
        track_no,
        disc_no,
      };
    }
  }

  return { title: title || stem, artist, album, track_no, disc_no };
}
