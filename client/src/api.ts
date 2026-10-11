export type Coverage = 'met' | 'weak' | 'ambiguous' | 'missing';
export type ReviewStatus = 'pending' | 'confirmed' | 'corrected' | 'rejected';
export type Level = 'mandatory' | 'recommended';
export type DocKind = 'guideline' | 'application';
export type SupportStatus = 'provided' | 'missing' | 'requested';

export interface Case { id: string; name: string; createdAt: string }
export interface VersionMeta { id: string; kind: DocKind; versionNo: number; title: string; contentHash: string; createdAt: string }
export interface Version extends VersionMeta { content: string; caseId: string }
export interface SupportingDoc { id: string; caseId: string; name: string; docType: string; description: string; status: SupportStatus }
export interface Assessment { id: string; caseId: string; status: 'running' | 'ready' | 'failed'; model: string; error: string | null; createdAt: string;
  guidelineVersionId: string; applicationVersionId: string }
export interface CaseDetail { case: Case; versions: VersionMeta[]; latest: Version[]; supporting: SupportingDoc[]; assessments: Assessment[] }

export interface Requirement { id: string; code: string; text: string; category: string; level: Level; sourceQuote: string;
  sourceVerified: boolean; requiredDocument: string | null }
export interface Mapping { id: string; aiCoverage: Coverage; rationale: string; evidenceQuote: string | null; evidenceVerified: boolean;
  evidenceSource: string | null; reviewStatus: ReviewStatus; reviewedCoverage: Coverage | null; reviewerNote: string | null; reviewedEvidence: string | null; reviewedEvidenceVerified: boolean | null; reviewedAt: string | null }
export interface Finding { id: string; type: 'clarification' | 'unsupported_claim'; text: string; quote: string | null; quoteVerified: boolean;
  requirementCode: string | null; dismissed: boolean }
export interface AiRun { id: string; step: string; model: string; promptChars: number; inputTokens: number | null; outputTokens: number | null;
  durationMs: number; attempt: number; ok: boolean; error: string | null; createdAt: string }
export interface LevelStats { total: number; met: number; notMet: number; pending: number; percent: number }
export interface DocStatus { requirementCode: string; level: Level; document: string; status: SupportStatus; matchedName: string | null }
export interface AssessmentView {
  assessment: Assessment; caseName: string; items: { requirement: Requirement; mapping: Mapping }[];
  findings: Finding[]; aiRuns: AiRun[]; stale: string[]; documents: DocStatus[];
  completion: { mandatory: LevelStats; recommended: LevelStats; reviewComplete: boolean };
  guidelineVersion: number; applicationVersion: number;
}
export interface AuditEvent { id: string; type: string; payload: Record<string, unknown>; createdAt: string }

export class ApiError extends Error {
  status: number;
  requestId?: string;
  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.requestId);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  listCases: () => request<Case[]>('/cases'),
  createCase: (name: string) => request<Case>('/cases', json('POST', { name })),
  createSampleCase: () => request<Case>('/cases/sample', json('POST')),
  getCase: (id: string) => request<CaseDetail>(`/cases/${id}`),
  getVersion: (id: string) => request<Version>(`/versions/${id}`),
  saveDocument: (caseId: string, d: { kind: DocKind; title: string; content: string }) =>
    request<{ version: Version; unchanged: boolean }>(`/cases/${caseId}/documents`, json('POST', d)),
  addSupporting: (caseId: string, d: Omit<SupportingDoc, 'id' | 'caseId'>) => request<SupportingDoc>(`/cases/${caseId}/supporting`, json('POST', d)),
  updateSupporting: (id: string, d: Partial<SupportingDoc>) => request<SupportingDoc>(`/supporting/${id}`, json('PATCH', d)),
  deleteSupporting: (id: string) => request<void>(`/supporting/${id}`, json('DELETE')),
  runAssessment: (caseId: string) => request<AssessmentView>(`/cases/${caseId}/assessments`, json('POST')),
  getAssessment: (id: string) => request<AssessmentView>(`/assessments/${id}`),
  reviewMapping: (id: string, body: { action: 'confirm' | 'reject' | 'reset' | 'correct'; coverage?: Coverage; note?: string; evidence?: string }) =>
    request<Mapping>(`/mappings/${id}`, json('PATCH', body)),
  setFindingDismissed: (id: string, dismissed: boolean) => request<Finding>(`/findings/${id}`, json('PATCH', { dismissed })),
  getSummary: (id: string) => request<{ markdown: string }>(`/assessments/${id}/summary`),
  getHistory: (caseId: string) => request<AuditEvent[]>(`/cases/${caseId}/history`),
};

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message + (e.requestId ? ` (ref ${e.requestId.slice(0, 8)})` : '') : 'Something went wrong.';
