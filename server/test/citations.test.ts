import { describe, it, expect } from 'vitest';
import { verifyQuote } from '../src/lib/citations';

const source = `Applicants must be registered non-profits based in Karnataka.\nThe budget—including overheads—must not exceed ₹10,00,000.`;

describe('verifyQuote', () => {
  it('accepts an exact quote', () => {
    expect(verifyQuote('Applicants must be registered non-profits based in Karnataka.', source)).toBe(true);
  });
  it('tolerates case, whitespace and dash differences', () => {
    expect(verifyQuote('the BUDGET-including overheads-must not   exceed', source)).toBe(true);
  });
  it('rejects text the model invented or paraphrased', () => {
    expect(verifyQuote('Applicants must be charities registered in Karnataka', source)).toBe(false);
  });
  it('rejects empty or trivially short quotes', () => {
    expect(verifyQuote(null, source)).toBe(false);
    expect(verifyQuote('must', source)).toBe(false);
  });
});
