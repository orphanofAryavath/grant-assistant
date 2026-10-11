import { normaliseForMatch } from './citations';

export interface RequiredDoc { requirementCode: string; level: 'mandatory' | 'recommended'; document: string }
export interface SupportingDoc { name: string; docType: string; status: 'provided' | 'missing' | 'requested' }
export interface DocStatus extends RequiredDoc {
  status: 'provided' | 'missing' | 'requested';
  matchedName: string | null;
}

const tokens = (s: string) => new Set(normaliseForMatch(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2));

/** Deterministic match between what the guideline asks for and the supporting documents the
 *  applicant listed: name/type contains the other, or they share most significant words. */
export function matches(required: string, doc: SupportingDoc): boolean {
  const r = normaliseForMatch(required);
  for (const candidate of [doc.name, doc.docType].map(normaliseForMatch)) {
    if (!candidate) continue;
    if (candidate.includes(r) || r.includes(candidate)) return true;
    const a = tokens(r), b = tokens(candidate);
    const shared = [...a].filter((t) => b.has(t)).length;
    if (a.size > 0 && shared / a.size >= 0.6) return true;
  }
  return false;
}

export function trackSupportingDocuments(required: RequiredDoc[], supplied: SupportingDoc[]): DocStatus[] {
  return required.map((req) => {
    const hit = supplied.find((d) => matches(req.document, d));
    return { ...req, status: hit ? hit.status : 'missing', matchedName: hit?.name ?? null };
  });
}
