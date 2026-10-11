import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { calculateCompletion } from '../lib/completion';
import { staleReasons } from '../lib/stale';
import { trackSupportingDocuments } from '../lib/documents';

/** Everything the review screen needs for one assessment, assembled in one place. */
export async function loadAssessmentView(assessmentId: string) {
  const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessmentId));
  if (!assessment) return null;
  const [kase] = await db.select().from(schema.cases).where(eq(schema.cases.id, assessment.caseId));

  const [reqs, maps, finds, runs, supporting, versions] = await Promise.all([
    db.select().from(schema.requirements).where(eq(schema.requirements.assessmentId, assessmentId)),
    db.select().from(schema.mappings).where(eq(schema.mappings.assessmentId, assessmentId)),
    db.select().from(schema.findings).where(eq(schema.findings.assessmentId, assessmentId)),
    db.select().from(schema.aiRuns).where(eq(schema.aiRuns.assessmentId, assessmentId)).orderBy(asc(schema.aiRuns.createdAt)),
    db.select().from(schema.supportingDocuments).where(eq(schema.supportingDocuments.caseId, assessment.caseId)),
    db.select({ id: schema.documentVersions.id, kind: schema.documentVersions.kind, versionNo: schema.documentVersions.versionNo,
      contentHash: schema.documentVersions.contentHash })
      .from(schema.documentVersions).where(eq(schema.documentVersions.caseId, assessment.caseId)),
  ]);

  const mapByReq = new Map(maps.map((m) => [m.requirementId, m]));
  const items = reqs
    .sort((a, b) => Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, '')))
    .map((r) => ({ requirement: r, mapping: mapByReq.get(r.id)! }))
    .filter((i) => i.mapping);

  const latest = (kind: 'guideline' | 'application') =>
    versions.filter((v) => v.kind === kind).sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
  const assessedG = versions.find((v) => v.id === assessment.guidelineVersionId)!;
  const assessedA = versions.find((v) => v.id === assessment.applicationVersionId)!;
  const stale = staleReasons(
    { guideline: assessedG, application: assessedA },
    { guideline: latest('guideline'), application: latest('application') },
  );

  const completion = calculateCompletion(items.map((i) => ({
    level: i.requirement.level, aiCoverage: i.mapping.aiCoverage,
    reviewStatus: i.mapping.reviewStatus, reviewedCoverage: i.mapping.reviewedCoverage,
  })));

  const documents = trackSupportingDocuments(
    reqs.filter((r) => r.requiredDocument).map((r) => ({ requirementCode: r.code, level: r.level, document: r.requiredDocument! })),
    supporting,
  );

  return {
    assessment, caseName: kase?.name ?? '', items, findings: finds, aiRuns: runs, stale, completion, documents,
    guidelineVersion: assessedG.versionNo, applicationVersion: assessedA.versionNo,
  };
}

export async function loadVersionsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(schema.documentVersions).where(inArray(schema.documentVersions.id, ids));
}
