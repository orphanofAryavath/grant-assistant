import { createHash } from 'node:crypto';

/** Content hash used for version identity and stale detection. Whitespace-normalised so
 *  re-saving the same text with different line endings does not create a "change". */
export function contentHash(text: string): string {
  const normalised = text.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalised).digest('hex');
}
