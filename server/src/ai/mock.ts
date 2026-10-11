import type { LlmProvider, LlmResult } from './provider';

/**
 * Offline, deterministic stand-in for the LLM (AI_PROVIDER=mock). Used by tests and for
 * demos when the free Gemini quota is exhausted. Keyword heuristics only — clearly worse
 * than the real model, but it exercises the same pipeline, validation and UI.
 */
const STOP = new Set('the a an and or of to in for on with by be is are must should will your you this that from at as it any all not may can their our have has'.split(' '));
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 3 && !STOP.has(w)) ?? [];
const block = (prompt: string, open: string, close: string) => {
  const i = prompt.indexOf(open);
  const j = prompt.indexOf(close, i);
  return i === -1 || j === -1 ? '' : prompt.slice(i + open.length, j).trim();
};
const sentences = (s: string) => s.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 15);

export class MockProvider implements LlmProvider {
  model = 'mock-heuristic-v1';

  async generateJson(prompt: string, _schema: unknown, step: string): Promise<LlmResult> {
    return { text: JSON.stringify(step === 'extract' ? this.extract(prompt) : this.map(prompt)) };
  }

  private extract(prompt: string) {
    const guideline = block(prompt, '<document name="guideline">', '</document>');
    const reqs = sentences(guideline)
      .filter((s) => /\b(must|required|shall|should|encouraged|recommended|preferred)\b/i.test(s))
      .map((s, i) => {
        const doc = s.match(/\b(letter of support|budget|cv|résumé|resume|certificate|financial statements?)\b/i);
        return {
          code: `R${i + 1}`,
          text: s,
          category: /eligib|registered|based in|applicants/i.test(s) ? 'eligibility' : 'submission',
          level: /\b(must|required|shall)\b/i.test(s) ? 'mandatory' : 'recommended',
          sourceQuote: s,
          requiredDocument: doc ? doc[0] : null,
        };
      });
    return { requirements: reqs };
  }

  private map(prompt: string) {
    const reqLines = block(prompt, '<requirements>', '</requirements>').split('\n').filter(Boolean);
    const app = sentences(block(prompt, '<document name="application">', '</document>'));
    const mappings = reqLines.map((line) => {
      const code = line.split(' ')[0];
      const want = new Set(words(line));
      let best = { s: '', score: 0 };
      for (const s of app) {
        const score = words(s).filter((w) => want.has(w)).length;
        if (score > best.score) best = { s, score };
      }
      const coverage = best.score >= 3 ? 'met' : best.score >= 1 ? 'weak' : 'missing';
      return {
        requirementCode: code,
        coverage,
        rationale: `Mock heuristic: ${best.score} shared keyword(s) with the closest application sentence.`,
        evidenceQuote: best.score ? best.s : null,
        evidenceSource: best.score ? 'application' : null,
      };
    });
    return {
      mappings,
      clarificationQuestions: mappings
        .filter((m) => m.coverage !== 'met')
        .map((m) => ({ question: `Can you provide more detail addressing ${m.requirementCode}?`, requirementCode: m.requirementCode })),
      unsupportedClaims: app
        .filter((s) => /\b\d{2,}%|\b\d{3,}\b/.test(s))
        .slice(0, 3)
        .map((s) => ({ claim: s, quote: s, reason: 'Mock heuristic: numeric claim with no supporting document.' })),
    };
  }
}
