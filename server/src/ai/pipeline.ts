import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { db, schema } from '../db/client';
import { logger } from '../logger';
import { verifyQuote } from '../lib/citations';
import { getProvider } from './provider';

import { parseModelJson, ModelOutputError } from './parse';
import { extractionPrompt, mappingPrompt } from './prompts';
import { ExtractionSchema, MappingSchema, extractionJsonSchema, mappingJsonSchema } from './schemas';

const MAX_ATTEMPTS = 2;

/** One LLM step with validation, a single retry on bad output, and an ai_runs row per attempt. */
async function runStep<T extends z.ZodType>(
  assessmentId: string, step: string, prompt: string, jsonSchema: unknown, zodSchema: T,
): Promise<z.infer<T>> {
  const provider = await getProvider();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await provider.generateJson(prompt, jsonSchema, step);
      const parsed = parseModelJson(res.text, zodSchema);
      const durationMs = Date.now() - started;
      await db.insert(schema.aiRuns).values({
        assessmentId, step, model: res.model ?? provider.model, promptChars: prompt.length,
        inputTokens: res.inputTokens, outputTokens: res.outputTokens, durationMs, attempt, ok: true,
      });
      logger.info({ assessmentId, step, attempt, durationMs, model: res.model ?? provider.model }, 'ai step ok');
      return parsed;
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      await db.insert(schema.aiRuns).values({
        assessmentId, step, model: provider.model, promptChars: prompt.length,
        durationMs, attempt, ok: false, error: message.slice(0, 1000),
      });
      logger.warn({ assessmentId, step, attempt, durationMs, err: message }, 'ai step failed');
      // Only malformed output is worth asking again. Availability problems were already handled
      // inside the provider (retries + model fallback); repeating that chain would just double the wait.
      if (!(err instanceof ModelOutputError)) break;
    }
  }
  throw lastError;
}

/**
 * Validates inputs and creates the assessment row synchronously, then returns the long-running
 * AI work as a promise. The API responds immediately and the client polls for progress, so a
 * slow model never holds an HTTP request open past the platform's limit.
 */
export async function startAssessment(caseId: string) {
  const versions = await db.select().from(schema.documentVersions)
    .where(eq(schema.documentVersions.caseId, caseId));
  const latest = (kind: 'guideline' | 'application') =>
    versions.filter((v) => v.kind === kind).sort((a, b) => b.versionNo - a.versionNo)[0];
  const guideline = latest('guideline');
  const application = latest('application');
  if (!guideline || !application) {
    throw Object.assign(new Error('Add both a guideline and an application before running an assessment.'), { status: 400 });
  }
  const supporting = await db.select().from(schema.supportingDocuments)
    .where(eq(schema.supportingDocuments.caseId, caseId));

  const provider = await getProvider();
  const [assessment] = await db.insert(schema.assessments).values({
    caseId, guidelineVersionId: guideline.id, applicationVersionId: application.id, model: provider.model,
  }).returning();
  const log = logger.child({ assessmentId: assessment.id, caseId });
  log.info({ guidelineVersion: guideline.versionNo, applicationVersion: application.versionNo }, 'assessment started');
  const setStep = (step: string) =>
    db.update(schema.assessments).set({ step }).where(eq(schema.assessments.id, assessment.id));

  const done = (async () => {
  try {
    await setStep('extracting');
    // Step 1 — requirements from the guideline
    const extraction = await runStep(assessment.id, 'extract', extractionPrompt(guideline.content),
      extractionJsonSchema, ExtractionSchema);
    const seen = new Set<string>();
    const reqRows = extraction.requirements
      .filter((r) => r.text.trim() && !seen.has(r.code) && seen.add(r.code))
      .map((r) => ({
        assessmentId: assessment.id, code: r.code, text: r.text, category: r.category, level: r.level,
        sourceQuote: r.sourceQuote, sourceVerified: verifyQuote(r.sourceQuote, guideline.content),
        requiredDocument: r.requiredDocument || null,
      }));
    if (reqRows.length === 0) throw new Error('No requirements could be extracted from the guideline.');
    const savedReqs = await db.insert(schema.requirements).values(reqRows).returning();

    // Step 2 — map the application against those requirements
    await setStep('mapping');
    const mapping = await runStep(assessment.id, 'map', mappingPrompt({
      requirements: savedReqs.map((r) => ({ code: r.code, text: r.text, level: r.level })),
      application: application.content,
      supporting: supporting.map((s) => ({ name: s.name, docType: s.docType, description: s.description, status: s.status })),
    }), mappingJsonSchema, MappingSchema);

    await setStep('saving');
    const byCode = new Map(mapping.mappings.map((m) => [m.requirementCode, m]));
    const providedDocs = new Set(supporting.filter((s) => s.status === 'provided').map((s) => s.name.toLowerCase()));
    const mapRows = savedReqs.map((r) => {
      const m = byCode.get(r.code);
      if (!m) {
        // Model skipped a requirement: record it rather than silently dropping it.
        return { assessmentId: assessment.id, requirementId: r.id, aiCoverage: 'missing' as const,
          rationale: 'The model returned no mapping for this requirement — review manually.',
          evidenceQuote: null, evidenceSource: null, evidenceVerified: false };
      }
      const fromSupporting = m.evidenceSource && m.evidenceSource !== 'application';
      const evidenceVerified = fromSupporting
        ? providedDocs.has(m.evidenceSource!.toLowerCase())
        : verifyQuote(m.evidenceQuote, application.content);
      return { assessmentId: assessment.id, requirementId: r.id, aiCoverage: m.coverage, rationale: m.rationale,
        evidenceQuote: m.evidenceQuote, evidenceSource: m.evidenceSource, evidenceVerified };
    });
    await db.insert(schema.mappings).values(mapRows);

    const findingRows = [
      ...mapping.clarificationQuestions.map((q) => ({
        assessmentId: assessment.id, type: 'clarification' as const, text: q.question, requirementCode: q.requirementCode,
      })),
      ...mapping.unsupportedClaims.map((c) => ({
        assessmentId: assessment.id, type: 'unsupported_claim' as const, text: `${c.claim} — ${c.reason}`,
        quote: c.quote, quoteVerified: verifyQuote(c.quote, application.content),
      })),
    ];
    if (findingRows.length) await db.insert(schema.findings).values(findingRows);

    await db.update(schema.assessments).set({ status: 'ready', step: null, finishedAt: new Date() })
      .where(eq(schema.assessments.id, assessment.id));
    const unverified = mapRows.filter((m) => m.evidenceQuote && !m.evidenceVerified).length;
    log.info({ requirements: savedReqs.length, findings: findingRows.length, unverifiedCitations: unverified }, 'assessment ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.assessments).set({ status: 'failed', step: null, error: message.slice(0, 1000), finishedAt: new Date() })
      .where(eq(schema.assessments.id, assessment.id))
      .catch((e) => log.error({ err: String(e) }, 'could not record failure'));
    log.error({ err: message }, 'assessment failed');
  }
  })();

  return { assessmentId: assessment.id, done };
}
