/** Normalise text for quote matching: case, whitespace and smart quotes vary between the
 *  LLM's echo and the source document, but the words must be the same. */
export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A citation is verified only if the quoted text really appears in the source.
 *  This is the guard against the model inventing evidence. */
export function verifyQuote(quote: string | null | undefined, source: string): boolean {
  if (!quote) return false;
  const q = normaliseForMatch(quote).replace(/^\.\.\.|\.\.\.$/g, '').trim();
  if (q.length < 8) return false; // too short to be meaningful evidence
  return normaliseForMatch(source).includes(q);
}
