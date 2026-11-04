// Moodle returns names HTML-escaped ("R&amp;D") and descriptions as HTML. These turn them into plain text.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  shy: '',
  lrm: '',
  rlm: '',
};

/** Decodes named and numeric entities in a single pass (so "&amp;lt;" becomes "&lt;", not "<"). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

/** For short names (course, activity, subject): drop tags, decode entities, tidy spaces. */
export function cleanName(name: string | null | undefined): string {
  if (!name) return '';
  return decodeEntities(name.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** For longer HTML (descriptions, grades): keep line breaks, drop tags, decode entities. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
