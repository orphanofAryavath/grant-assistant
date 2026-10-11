export interface VersionRef { id: string; contentHash: string }

/** An assessment is stale when the latest version of either document is not the one it
 *  was run against. Compared by hash, so a re-save of identical text is not a change. */
export function staleReasons(
  assessed: { guideline: VersionRef; application: VersionRef },
  latest: { guideline: VersionRef | null; application: VersionRef | null },
): string[] {
  const reasons: string[] = [];
  if (latest.guideline && latest.guideline.contentHash !== assessed.guideline.contentHash) {
    reasons.push('The grant guideline has changed since this assessment was run.');
  }
  if (latest.application && latest.application.contentHash !== assessed.application.contentHash) {
    reasons.push('The draft application has changed since this assessment was run.');
  }
  return reasons;
}
