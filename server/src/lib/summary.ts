import { effectiveCoverage, type CompletionResult, type Coverage, type ReviewStatus } from './completion';
import type { DocStatus } from './documents';

export interface SummaryInput {
  caseName: string;
  guidelineVersion: number;
  applicationVersion: number;
  generatedAt: Date;
  stale: string[];
  completion: CompletionResult;
  items: {
    code: string; text: string; level: 'mandatory' | 'recommended';
    aiCoverage: Coverage; reviewStatus: ReviewStatus; reviewedCoverage: Coverage | null;
    reviewerNote: string | null; evidenceQuote: string | null; evidenceVerified: boolean;
  }[];
  documents: DocStatus[];
  questions: string[];
  unsupportedClaims: string[];
}

const label: Record<Coverage, string> = { met: 'Met', weak: 'Weak', ambiguous: 'Ambiguous', missing: 'Missing' };

/** Builds the reviewed completeness summary as Markdown. Pure function: the same reviewed
 *  data always produces the same report. Only human-reviewed statuses are reported as final. */
export function buildSummary(s: SummaryInput): string {
  const out: string[] = [];
  out.push(`# Completeness summary — ${s.caseName}`);
  out.push(`Guideline v${s.guidelineVersion} · Application v${s.applicationVersion} · Generated ${s.generatedAt.toISOString()}`);
  out.push('');
  out.push('> This is a completeness review to support a human reviewer. It is **not** a legal or funding-eligibility decision.');
  if (s.stale.length) out.push('', `> **Stale:** ${s.stale.join(' ')} Re-run the assessment before relying on this summary.`);
  const m = s.completion.mandatory, r = s.completion.recommended;
  out.push('', '## Checklist completion');
  out.push(`- Mandatory: **${m.met}/${m.total} met (${m.percent}%)** — ${m.notMet} not met, ${m.pending} awaiting review`);
  out.push(`- Recommended: ${r.met}/${r.total} met (${r.percent}%) — ${r.notMet} not met, ${r.pending} awaiting review`);
  if (!s.completion.reviewComplete) out.push('- Review is **incomplete**: items awaiting review are not counted as met.');

  for (const level of ['mandatory', 'recommended'] as const) {
    const rows = s.items.filter((i) => i.level === level);
    if (!rows.length) continue;
    out.push('', `## ${level === 'mandatory' ? 'Mandatory requirements' : 'Recommendations'}`);
    for (const i of rows) {
      const eff = effectiveCoverage(i);
      const status = eff ? label[eff] : `Awaiting review (AI suggested: ${label[i.aiCoverage]})`;
      out.push(`- **${i.code}** ${i.text} — ${status}${i.reviewStatus === 'corrected' ? ' (corrected by reviewer)' : ''}`);
      if (i.evidenceQuote) out.push(`  - Evidence${i.evidenceVerified ? '' : ' (⚠ quote not found in application)'}: "${i.evidenceQuote}"`);
      if (i.reviewerNote) out.push(`  - Reviewer note: ${i.reviewerNote}`);
    }
  }
  if (s.documents.length) {
    out.push('', '## Supporting documents');
    for (const d of s.documents) {
      out.push(`- ${d.document} (${d.level}, ${d.requirementCode}): ${d.status}${d.matchedName ? ` — "${d.matchedName}"` : ''}`);
    }
  }
  if (s.questions.length) out.push('', '## Clarification questions', ...s.questions.map((q) => `- ${q}`));
  if (s.unsupportedClaims.length) out.push('', '## Claims without supporting evidence', ...s.unsupportedClaims.map((c) => `- ${c}`));
  return out.join('\n') + '\n';
}
