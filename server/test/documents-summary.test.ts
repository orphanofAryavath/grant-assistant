import { describe, it, expect } from 'vitest';
import { trackSupportingDocuments } from '../src/lib/documents';
import { buildSummary } from '../src/lib/summary';
import { calculateCompletion } from '../src/lib/completion';

describe('trackSupportingDocuments', () => {
  const required = [
    { requirementCode: 'R3', level: 'mandatory' as const, document: 'Letter of support from a partner' },
    { requirementCode: 'R5', level: 'mandatory' as const, document: 'Audited financial statements' },
    { requirementCode: 'R7', level: 'recommended' as const, document: 'CV of project lead' },
  ];
  it('matches by name/type and reports missing documents', () => {
    const r = trackSupportingDocuments(required, [
      { name: 'Partner letter of support - City Library', docType: 'letter', status: 'provided' },
      { name: 'Annual accounts 2025', docType: 'Audited financial statements', status: 'requested' },
    ]);
    expect(r.map((d) => d.status)).toEqual(['provided', 'requested', 'missing']);
    expect(r[2].matchedName).toBeNull();
  });
});

describe('buildSummary', () => {
  const items = [
    { code: 'R1', text: 'Registered non-profit', level: 'mandatory' as const, aiCoverage: 'met' as const, reviewStatus: 'confirmed' as const,
      reviewedCoverage: null, reviewerNote: null, evidenceQuote: 'We are a registered trust', evidenceVerified: true },
    { code: 'R2', text: 'Budget under limit', level: 'mandatory' as const, aiCoverage: 'met' as const, reviewStatus: 'pending' as const,
      reviewedCoverage: null, reviewerNote: null, evidenceQuote: 'Total ask 12 lakh', evidenceVerified: false },
  ];
  const base = {
    caseName: 'Demo', guidelineVersion: 1, applicationVersion: 2, generatedAt: new Date('2026-10-12T00:00:00Z'),
    stale: [], items, documents: [], questions: ['What is the overhead rate?'], unsupportedClaims: [],
    completion: calculateCompletion(items.map((i) => ({ level: i.level, aiCoverage: i.aiCoverage, reviewStatus: i.reviewStatus, reviewedCoverage: i.reviewedCoverage }))),
  };
  it('always carries the not-a-decision disclaimer and reviewed counts', () => {
    const md = buildSummary(base);
    expect(md).toMatch(/not\*\* a legal or funding-eligibility decision/);
    expect(md).toMatch(/Mandatory: \*\*1\/2 met \(50%\)/);
  });
  it('shows pending items as awaiting review, not as met, and flags unverified quotes', () => {
    const md = buildSummary(base);
    expect(md).toMatch(/R2.*Awaiting review \(AI suggested: Met\)/);
    expect(md).toMatch(/quote not found in application/);
  });
  it('warns when the assessment is stale', () => {
    expect(buildSummary({ ...base, stale: ['The draft application has changed.'] })).toMatch(/\*\*Stale:\*\*/);
  });
  it('prefers reviewer evidence and flags a status with no citation', () => {
    const extra = [
      { ...items[0], code: 'R3', reviewStatus: 'corrected' as const, reviewedCoverage: 'met' as const, reviewedEvidence: 'Ten partner schools signed MoUs', reviewedEvidenceVerified: true },
      { ...items[0], code: 'R4', evidenceQuote: null, evidenceVerified: false },
    ];
    const md = buildSummary({ ...base, items: extra });
    expect(md).toMatch(/Reviewer evidence: "Ten partner schools signed MoUs"/);
    expect(md).toMatch(/R4[\s\S]*No citation supports this status/);
  });
});
