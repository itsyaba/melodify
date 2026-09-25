/** A field a list can be found by: a title, an artist, a year. */
export type FindField = string | number | null | undefined;

/** Lowercased with accents stripped, so "beyonce" finds "Beyoncé". */
export function foldForFind(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// One folded text per item, built on the first find in a list and kept for as long as that
// list is. Each call site passes one list with one set of fields, so the list alone is the key.
const haystacks = new WeakMap<readonly object[], string[]>();

/**
 * The items that match every word of `query` in any of their fields, in their original order.
 * An empty query returns `items` itself, so nothing downstream re-renders for it.
 */
export function findIn<T extends object>(items: T[], query: string, fields: (item: T) => FindField[]): T[] {
  const words = foldForFind(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  let hay = haystacks.get(items);
  if (!hay) {
    hay = items.map((item) =>
      foldForFind(
        fields(item)
          .filter((f) => f != null && f !== '')
          .join('\n'),
      ),
    );
    haystacks.set(items, hay);
  }
  const text = hay;
  return items.filter((_, i) => words.every((w) => text[i].includes(w)));
}
