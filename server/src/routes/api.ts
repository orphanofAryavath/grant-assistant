import { Router, type Request, type Response, type NextFunction } from 'express';
import { and, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client';
import { contentHash } from '../lib/hash';
import { buildSummary } from '../lib/summary';
import { verifyQuote } from '../lib/citations';
import { waitUntil } from '@vercel/functions';
import { startAssessment } from '../ai/pipeline';
import { loadAssessmentView, loadVersionsByIds } from './assessmentView';
import { sampleCase } from '../samples';

export const api = Router();

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const audit = (caseId: string, type: string, payload: Record<string, unknown>) =>
  db.insert(schema.auditEvents).values({ caseId, type, payload });

const MAX_DOC_CHARS = 60_000; // documented limit: keeps prompts within free-tier budgets

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get('/cases', wrap(async (_req, res) => {
  res.json(await db.select().from(schema.cases).orderBy(desc(schema.cases.createdAt)));
}));

api.post('/cases', wrap(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1, 'Name is required').max(120) }).parse(req.body);
  const [row] = await db.insert(schema.cases).values(body).returning();
  await audit(row.id, 'case_created', body);
  res.status(201).json(row);
}));

// One-click demo data for reviewers: a guideline, a draft with deliberate gaps, and supporting docs.
api.post('/cases/sample', wrap(async (_req, res) => {
  const [kase] = await db.insert(schema.cases).values({ name: sampleCase.name }).returning();
  await db.insert(schema.documentVersions).values((['guideline', 'application'] as const).map((kind) => ({
    caseId: kase.id, kind, versionNo: 1, title: sampleCase[kind].title, content: sampleCase[kind].content,
    contentHash: contentHash(sampleCase[kind].content),
  })));
  await db.insert(schema.supportingDocuments).values(sampleCase.supporting.map((d) => ({ caseId: kase.id, ...d })));
  await audit(kase.id, 'sample_case_created', {});
  res.status(201).json(kase);
}));

api.get('/cases/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const [kase] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
  if (!kase) throw httpError(404, 'Case not found');
  const [versions, supporting, assessments] = await Promise.all([
    db.select({
      id: schema.documentVersions.id, kind: schema.documentVersions.kind, versionNo: schema.documentVersions.versionNo,
      title: schema.documentVersions.title, contentHash: schema.documentVersions.contentHash, createdAt: schema.documentVersions.createdAt,
    }).from(schema.documentVersions).where(eq(schema.documentVersions.caseId, id)).orderBy(desc(schema.documentVersions.versionNo)),
    db.select().from(schema.supportingDocuments).where(eq(schema.supportingDocuments.caseId, id)),
    db.select().from(schema.assessments).where(eq(schema.assessments.caseId, id)).orderBy(desc(schema.assessments.createdAt)),
  ]);
  const latestIds = (['guideline', 'application'] as const)
    .map((k) => versions.find((v) => v.kind === k)?.id).filter((x): x is string => !!x);
  const latest = await loadVersionsByIds(latestIds);
  res.json({ case: kase, versions, latest, supporting, assessments });
}));

api.get('/versions/:id', wrap(async (req, res) => {
  const [row] = await db.select().from(schema.documentVersions).where(eq(schema.documentVersions.id, String(req.params.id)));
  if (!row) throw httpError(404, 'Version not found');
  res.json(row);
}));

// Saving a document always appends a version; identical content is a no-op.
api.post('/cases/:id/documents', wrap(async (req, res) => {
  const caseId = String(req.params.id);
  const body = z.object({
    kind: z.enum(['guideline', 'application']),
    title: z.string().trim().min(1, 'Title is required').max(200),
    content: z.string().trim().min(50, 'Document looks too short (min 50 characters)').max(MAX_DOC_CHARS, `Document exceeds ${MAX_DOC_CHARS} characters`),
  }).parse(req.body);
  const hash = contentHash(body.content);
  const [prev] = await db.select().from(schema.documentVersions)
    .where(and(eq(schema.documentVersions.caseId, caseId), eq(schema.documentVersions.kind, body.kind)))
    .orderBy(desc(schema.documentVersions.versionNo)).limit(1);
  if (prev && prev.contentHash === hash && prev.title === body.title) {
    return res.json({ version: prev, unchanged: true });
  }
  const [{ n }] = await db.select({ n: max(schema.documentVersions.versionNo) }).from(schema.documentVersions)
    .where(and(eq(schema.documentVersions.caseId, caseId), eq(schema.documentVersions.kind, body.kind)));
  const [version] = await db.insert(schema.documentVersions)
    .values({ caseId, kind: body.kind, title: body.title, content: body.content, contentHash: hash, versionNo: (n ?? 0) + 1 })
    .returning();
  await audit(caseId, 'document_version_created', { kind: body.kind, versionNo: version.versionNo, hash });
  res.status(201).json({ version, unchanged: false });
}));

const SupportingBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  docType: z.string().trim().min(1, 'Type is required').max(100),
  description: z.string().trim().max(1000).default(''),
  status: z.enum(['provided', 'missing', 'requested']).default('provided'),
});

api.post('/cases/:id/supporting', wrap(async (req, res) => {
  const caseId = String(req.params.id);
  const body = SupportingBody.parse(req.body);
  const [row] = await db.insert(schema.supportingDocuments).values({ caseId, ...body }).returning();
  await audit(caseId, 'supporting_document_added', body);
  res.status(201).json(row);
}));

api.patch('/supporting/:id', wrap(async (req, res) => {
  const body = SupportingBody.partial().parse(req.body);
  const [row] = await db.update(schema.supportingDocuments).set(body)
    .where(eq(schema.supportingDocuments.id, String(req.params.id))).returning();
  if (!row) throw httpError(404, 'Supporting document not found');
  await audit(row.caseId, 'supporting_document_updated', { id: row.id, ...body });
  res.json(row);
}));

api.delete('/supporting/:id', wrap(async (req, res) => {
  const [row] = await db.delete(schema.supportingDocuments)
    .where(eq(schema.supportingDocuments.id, String(req.params.id))).returning();
  if (!row) throw httpError(404, 'Supporting document not found');
  await audit(row.caseId, 'supporting_document_removed', { id: row.id, name: row.name });
  res.status(204).end();
}));

api.post('/cases/:id/assessments', wrap(async (req, res) => {
  const { assessmentId, done } = await startAssessment(String(req.params.id));
  // On Vercel, waitUntil keeps the function alive after the response until the AI work ends.
  // Locally it is a no-op and the promise simply keeps running in the Node process.
  waitUntil(done);
  res.status(202).json(await loadAssessmentView(assessmentId));
}));

api.get('/assessments/:id', wrap(async (req, res) => {
  const view = await loadAssessmentView(String(req.params.id));
  if (!view) throw httpError(404, 'Assessment not found');
  res.json(view);
}));

// Human-in-the-loop: confirm, correct or reject each AI mapping.
api.patch('/mappings/:id', wrap(async (req, res) => {
  const body = z.discriminatedUnion('action', [
    z.object({ action: z.literal('confirm'), note: z.string().max(1000).optional() }),
    z.object({ action: z.literal('correct'), coverage: z.enum(['met', 'weak', 'ambiguous', 'missing']),
      note: z.string().trim().min(1, 'Explain the correction').max(1000),
      evidence: z.string().trim().max(2000).optional() }),
    z.object({ action: z.literal('reject'), note: z.string().trim().min(1, 'Explain why the mapping is wrong').max(1000) }),
    z.object({ action: z.literal('reset') }),
  ]).parse(req.body);
  const id = String(req.params.id);
  const [current] = await db.select().from(schema.mappings).where(eq(schema.mappings.id, id));
  if (!current) throw httpError(404, 'Mapping not found');
  const [a] = await db.select({ caseId: schema.assessments.caseId, applicationVersionId: schema.assessments.applicationVersionId })
    .from(schema.assessments).where(eq(schema.assessments.id, current.assessmentId));

  // A reviewer's replacement citation is checked against the same application version the
  // assessment ran on, exactly like the model's citations.
  let reviewedEvidence: string | null = null;
  let reviewedEvidenceVerified: boolean | null = null;
  if (body.action === 'correct' && body.evidence) {
    const [app] = await db.select({ content: schema.documentVersions.content }).from(schema.documentVersions)
      .where(eq(schema.documentVersions.id, a.applicationVersionId));
    reviewedEvidence = body.evidence;
    reviewedEvidenceVerified = verifyQuote(body.evidence, app?.content ?? '');
  }
  const update = body.action === 'reset'
    ? { reviewStatus: 'pending' as const, reviewedCoverage: null, reviewerNote: null, reviewedEvidence: null,
      reviewedEvidenceVerified: null, reviewedAt: null }
    : {
      reviewStatus: ({ confirm: 'confirmed', correct: 'corrected', reject: 'rejected' } as const)[body.action],
      reviewedCoverage: body.action === 'correct' ? body.coverage : null,
      reviewerNote: body.note ?? null,
      reviewedEvidence, reviewedEvidenceVerified,
      reviewedAt: new Date(),
    };
  const [row] = await db.update(schema.mappings).set(update).where(eq(schema.mappings.id, id)).returning();
  await audit(a.caseId, 'mapping_reviewed', { mappingId: id, from: current.reviewStatus, ...body });
  res.json(row);
}));

api.patch('/findings/:id', wrap(async (req, res) => {
  const body = z.object({ dismissed: z.boolean() }).parse(req.body);
  const [row] = await db.update(schema.findings).set(body).where(eq(schema.findings.id, String(req.params.id))).returning();
  if (!row) throw httpError(404, 'Finding not found');
  res.json(row);
}));

api.get('/assessments/:id/summary', wrap(async (req, res) => {
  const v = await loadAssessmentView(String(req.params.id));
  if (!v) throw httpError(404, 'Assessment not found');
  if (v.assessment.status !== 'ready') throw httpError(409, 'Assessment is not ready');
  const markdown = buildSummary({
    caseName: v.caseName, guidelineVersion: v.guidelineVersion, applicationVersion: v.applicationVersion,
    generatedAt: new Date(), stale: v.stale, completion: v.completion,
    items: v.items.map(({ requirement: r, mapping: m }) => ({
      code: r.code, text: r.text, level: r.level, aiCoverage: m.aiCoverage, reviewStatus: m.reviewStatus,
      reviewedCoverage: m.reviewedCoverage, reviewerNote: m.reviewerNote, evidenceQuote: m.evidenceQuote, evidenceVerified: m.evidenceVerified,
      evidenceSource: m.evidenceSource, reviewedEvidence: m.reviewedEvidence, reviewedEvidenceVerified: m.reviewedEvidenceVerified,
    })),
    documents: v.documents,
    questions: v.findings.filter((f) => f.type === 'clarification' && !f.dismissed).map((f) => f.text),
    unsupportedClaims: v.findings.filter((f) => f.type === 'unsupported_claim' && !f.dismissed).map((f) => f.text),
  });
  res.json({ markdown });
}));

api.get('/cases/:id/history', wrap(async (req, res) => {
  res.json(await db.select().from(schema.auditEvents)
    .where(eq(schema.auditEvents.caseId, String(req.params.id))).orderBy(desc(schema.auditEvents.createdAt)).limit(200));
}));
