/**
 * Best-effort metadata from a path when tags haven't been read yet.
 * Handles "Artist/Album/01 - Title.flac", "Artist/Album/1-02 Title.mp3", "Title.mp3".
 */
export interface GuessedTags {
  title: string;
  artist: string | null;
  album: string | null;
  track_no: number | null;
  disc_no: number | null;
}

const LEADING_NUMBER = /^(?:(\d{1,2})[-.])?(\d{1,3})\s*[-._)\]]?\s+(.+)$/;

export function guessTags(relativePath: string): GuessedTags {
  const parts = relativePath.split('/');
  const filename = parts.pop() ?? relativePath;
  const stem = filename.replace(/\.[^.]+$/, '');
  const album = parts.length >= 1 ? parts[parts.length - 1] : null;
  const artist = parts.length >= 2 ? parts[parts.length - 2] : null;

  let title = stem.trim();
  let track_no: number | null = null;
  let disc_no: number | null = null;

  const m = LEADING_NUMBER.exec(title);
  if (m) {
    disc_no = m[1] ? Number(m[1]) : null;
    track_no = Number(m[2]);
    title = m[3].trim();
  }

  // "Artist - Title" inside the filename when the folder didn't tell us the artist
  if (!artist && title.includes(' - ')) {
    const [a, ...rest] = title.split(' - ');
    return { title: rest.join(' - ').trim(), artist: a.trim(), album, track_no, disc_no };
  }

  return { title: title || stem, artist, album, track_no, disc_no };
}
