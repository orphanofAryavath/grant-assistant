import { describe, it, expect } from 'vitest';
import { staleReasons } from '../src/lib/stale';
import { contentHash } from '../src/lib/hash';

const v = (id: string, text: string) => ({ id, contentHash: contentHash(text) });

describe('staleReasons', () => {
  const assessed = { guideline: v('g1', 'guideline text'), application: v('a1', 'application text') };
  it('is fresh when the latest versions are the assessed ones', () => {
    expect(staleReasons(assessed, assessed)).toEqual([]);
  });
  it('flags a changed application and a changed guideline separately', () => {
    const r = staleReasons(assessed, { guideline: v('g2', 'guideline text v2'), application: v('a2', 'application text v2') });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(/guideline/);
    expect(r[1]).toMatch(/application/);
  });
  it('does not flag a re-save of identical content (only line endings differ)', () => {
    expect(staleReasons(assessed, { guideline: v('g2', 'guideline text\r\n'), application: v('a1', 'application text') })).toEqual([]);
  });
});
