import {
  pgTable, uuid, text, integer, timestamp, boolean, jsonb, pgEnum, index,
} from 'drizzle-orm/pg-core';

export const docKind = pgEnum('doc_kind', ['guideline', 'application']);
export const reqLevel = pgEnum('req_level', ['mandatory', 'recommended']);
export const reqCategory = pgEnum('req_category', ['eligibility', 'submission', 'content']);
export const coverage = pgEnum('coverage', ['met', 'weak', 'ambiguous', 'missing']);
export const reviewStatus = pgEnum('review_status', ['pending', 'confirmed', 'corrected', 'rejected']);
export const assessmentStatus = pgEnum('assessment_status', ['running', 'ready', 'failed']);
export const findingType = pgEnum('finding_type', ['clarification', 'unsupported_claim']);
export const supportStatus = pgEnum('support_status', ['provided', 'missing', 'requested']);

// A review case = one guideline + one draft application (+ optional supporting docs).
export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Every edit creates a new immutable version; nothing is overwritten.
export const documentVersions = pgTable('document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  kind: docKind('kind').notNull(),
  versionNo: integer('version_no').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [index('dv_case_kind_idx').on(t.caseId, t.kind)]);

// Metadata only — the files themselves are out of scope (no OCR / upload).
export const supportingDocuments = pgTable('supporting_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  docType: text('doc_type').notNull(),
  description: text('description').notNull().default(''),
  status: supportStatus('status').notNull().default('provided'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  guidelineVersionId: uuid('guideline_version_id').notNull().references(() => documentVersions.id),
  applicationVersionId: uuid('application_version_id').notNull().references(() => documentVersions.id),
  status: assessmentStatus('status').notNull().default('running'),
  model: text('model').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const requirements = pgTable('requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  text: text('text').notNull(),
  category: reqCategory('category').notNull(),
  level: reqLevel('level').notNull(),
  sourceQuote: text('source_quote').notNull(),
  sourceVerified: boolean('source_verified').notNull(),
  requiredDocument: text('required_document'),
});

export const mappings = pgTable('mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  requirementId: uuid('requirement_id').notNull().references(() => requirements.id, { onDelete: 'cascade' }),
  aiCoverage: coverage('ai_coverage').notNull(),
  rationale: text('rationale').notNull(),
  evidenceQuote: text('evidence_quote'),
  evidenceVerified: boolean('evidence_verified').notNull(),
  evidenceSource: text('evidence_source'), // 'application' | supporting doc name
  reviewStatus: reviewStatus('review_status').notNull().default('pending'),
  reviewedCoverage: coverage('reviewed_coverage'),
  reviewerNote: text('reviewer_note'),
  reviewedEvidence: text('reviewed_evidence'),        // reviewer's own citation when correcting
  reviewedEvidenceVerified: boolean('reviewed_evidence_verified'),
  reviewedAt: timestamp('reviewed_at'),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  type: findingType('type').notNull(),
  text: text('text').notNull(),
  quote: text('quote'),
  quoteVerified: boolean('quote_verified').notNull().default(false),
  requirementCode: text('requirement_code'),
  dismissed: boolean('dismissed').notNull().default(false),
});

// One row per LLM call: what was sent, how long it took, what came back.
export const aiRuns = pgTable('ai_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  step: text('step').notNull(),
  model: text('model').notNull(),
  promptChars: integer('prompt_chars').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms').notNull(),
  attempt: integer('attempt').notNull(),
  ok: boolean('ok').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Append-only history of human decisions (who changed what, when).
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
