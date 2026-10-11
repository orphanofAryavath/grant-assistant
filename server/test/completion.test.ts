import { describe, it, expect } from 'vitest';
import { calculateCompletion, effectiveCoverage, type CompletionInput } from '../src/lib/completion';

const item = (o: Partial<CompletionInput>): CompletionInput =>
  ({ level: 'mandatory', aiCoverage: 'met', reviewStatus: 'pending', reviewedCoverage: null, ...o });

describe('effectiveCoverage', () => {
  it('ignores the AI suggestion until a human reviews it', () => {
    expect(effectiveCoverage(item({ aiCoverage: 'met' }))).toBeNull();
  });
  it('uses the AI value when confirmed and the reviewer value when corrected', () => {
    expect(effectiveCoverage(item({ reviewStatus: 'confirmed', aiCoverage: 'weak' }))).toBe('weak');
    expect(effectiveCoverage(item({ reviewStatus: 'corrected', aiCoverage: 'missing', reviewedCoverage: 'met' }))).toBe('met');
  });
  it('treats a rejected mapping as missing evidence', () => {
    expect(effectiveCoverage(item({ reviewStatus: 'rejected', aiCoverage: 'met' }))).toBe('missing');
  });
});

describe('calculateCompletion', () => {
  it('counts only reviewed "met" items and separates mandatory from recommended', () => {
    const r = calculateCompletion([
      item({ reviewStatus: 'confirmed' }),                                        // met
      item({ reviewStatus: 'corrected', reviewedCoverage: 'weak' }),              // not met
      item({ reviewStatus: 'pending' }),                                          // pending
      item({ reviewStatus: 'rejected' }),                                         // not met
      item({ level: 'recommended', reviewStatus: 'confirmed' }),
    ]);
    expect(r.mandatory).toEqual({ total: 4, met: 1, notMet: 2, pending: 1, percent: 25 });
    expect(r.recommended).toEqual({ total: 1, met: 1, notMet: 0, pending: 0, percent: 100 });
    expect(r.reviewComplete).toBe(false);
  });
  it('is complete only when nothing is pending', () => {
    expect(calculateCompletion([item({ reviewStatus: 'confirmed' })]).reviewComplete).toBe(true);
    expect(calculateCompletion([]).reviewComplete).toBe(false);
  });
  it('rounds to one decimal and handles empty input', () => {
    const r = calculateCompletion([item({ reviewStatus: 'confirmed' }), item({ reviewStatus: 'rejected' }), item({ reviewStatus: 'rejected' })]);
    expect(r.mandatory.percent).toBe(33.3);
    expect(calculateCompletion([]).mandatory.percent).toBe(0);
  });
});
