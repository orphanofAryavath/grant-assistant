export type Coverage = 'met' | 'weak' | 'ambiguous' | 'missing';
export type ReviewStatus = 'pending' | 'confirmed' | 'corrected' | 'rejected';
export type Level = 'mandatory' | 'recommended';

export interface CompletionInput {
  level: Level;
  aiCoverage: Coverage;
  reviewStatus: ReviewStatus;
  reviewedCoverage: Coverage | null;
}

export interface LevelStats {
  total: number;
  met: number;        // human-confirmed or human-corrected to "met"
  notMet: number;     // reviewed and not met (weak / ambiguous / missing / rejected)
  pending: number;    // not yet reviewed by a human
  percent: number;    // met / total, 0-100, one decimal
}

export interface CompletionResult {
  mandatory: LevelStats;
  recommended: LevelStats;
  reviewComplete: boolean;
}

/**
 * The coverage a human has signed off on. Rules (deterministic, no AI):
 *  - confirmed  -> the AI's coverage stands
 *  - corrected  -> the reviewer's coverage replaces it
 *  - rejected   -> the AI mapping was wrong and nothing replaced it, so treat as missing
 *  - pending    -> no decision yet (null)
 */
export function effectiveCoverage(m: CompletionInput): Coverage | null {
  switch (m.reviewStatus) {
    case 'confirmed': return m.aiCoverage;
    case 'corrected': return m.reviewedCoverage ?? m.aiCoverage;
    case 'rejected': return 'missing';
    default: return null;
  }
}

function stats(items: CompletionInput[]): LevelStats {
  let met = 0, notMet = 0, pending = 0;
  for (const m of items) {
    const c = effectiveCoverage(m);
    if (c === null) pending++;
    else if (c === 'met') met++;
    else notMet++;
  }
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((met / total) * 1000) / 10;
  return { total, met, notMet, pending, percent };
}

/** Checklist completion. Only human-reviewed "met" counts — AI output alone never
 *  moves the percentage, so the number always reflects a reviewer's decision. */
export function calculateCompletion(items: CompletionInput[]): CompletionResult {
  const mandatory = stats(items.filter((i) => i.level === 'mandatory'));
  const recommended = stats(items.filter((i) => i.level === 'recommended'));
  return {
    mandatory,
    recommended,
    reviewComplete: mandatory.pending + recommended.pending === 0 && items.length > 0,
  };
}
