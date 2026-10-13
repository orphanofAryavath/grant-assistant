/**
 * Resets the database to a clean demo state: deletes every review, then creates three realistic
 * reviews (fictional funders and NGOs), runs the real AI assessment on each, and records some
 * human review decisions so the screens show work in progress.
 *
 *   npm run db:seed -- --confirm      (deletes ALL existing reviews first)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/client';
import { contentHash } from './lib/hash';
import { startAssessment } from './ai/pipeline';
import { sampleCase } from './samples';

const dir = join(__dirname, '../../samples/seed');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
type Supporting = { name: string; docType: string; description: string; status: 'provided' | 'missing' | 'requested' };
const readDocs = (f: string): Supporting[] => JSON.parse(read(f));

const reviews = [
  {
    name: 'Rural Clean Water Challenge 2027 — Jaladhara Foundation (Solar Water ATMs)',
    guideline: { title: 'Rural Clean Water Challenge 2027 — Guidelines', content: read('clean_water_guideline.md') },
    application: { title: 'Solar Water ATMs for Six Villages in Raichur — draft v1', content: read('clean_water_application.md') },
    supporting: readDocs('clean_water_supporting.json'),
    review: 0,
  },
  {
    name: "Women's Enterprise Fund 2027 — Sahaya Mahila Sangha (Tailoring Unit)",
    guideline: { title: "Karnataka Women's Enterprise Fund — 2027 Call for Proposals", content: read('womens_enterprise_guideline.md') },
    application: { title: 'Sahaya Mahila Sangha Tailoring and Garment Unit — draft', content: read('womens_enterprise_application.md') },
    supporting: readDocs('womens_enterprise_supporting.json'),
    review: 5,
  },
  {
    name: sampleCase.name,
    guideline: sampleCase.guideline,
    application: sampleCase.application,
    supporting: sampleCase.supporting as unknown as Supporting[],
    review: 11,
  },
];

async function main() {
  if (!process.argv.includes('--confirm')) {
    console.error('This deletes every review in the database. Re-run with --confirm.');
    process.exit(1);
  }
  await db.delete(schema.cases);
  console.log('Deleted all existing reviews.');

  // Oldest first, so the list shows the most recently created review on top.
  for (const r of [...reviews].reverse()) {
    const [kase] = await db.insert(schema.cases).values({ name: r.name }).returning();
    await db.insert(schema.documentVersions).values((['guideline', 'application'] as const).map((kind) => ({
      caseId: kase.id, kind, versionNo: 1, title: r[kind].title, content: r[kind].content, contentHash: contentHash(r[kind].content),
    })));
    await db.insert(schema.supportingDocuments).values(r.supporting.map((d) => ({ caseId: kase.id, ...d })));
    await db.insert(schema.auditEvents).values({ caseId: kase.id, type: 'case_created', payload: { name: r.name } });

    const started = Date.now();
    const { assessmentId, done } = await startAssessment(kase.id);
    await done;
    const [a] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessmentId));
    console.log(`${r.name}: ${a.status} in ${Math.round((Date.now() - started) / 1000)}s${a.error ? ` (${a.error})` : ''}`);
    if (a.status !== 'ready' || !r.review) continue;

    // A reviewer has worked through the first few items: confirm well-cited ones, correct one.
    const maps = await db.select().from(schema.mappings).where(eq(schema.mappings.assessmentId, assessmentId));
    const reqs = await db.select().from(schema.requirements).where(eq(schema.requirements.assessmentId, assessmentId));
    const codeOf = new Map(reqs.map((q) => [q.id, Number(q.code.replace(/\D/g, ''))]));
    const ordered = maps.sort((x, y) => (codeOf.get(x.requirementId)! - codeOf.get(y.requirementId)!)).slice(0, r.review);
    for (const [i, m] of ordered.entries()) {
      const correct = i === 2 && m.aiCoverage === 'met';
      const update = correct
        ? { reviewStatus: 'corrected' as const, reviewedCoverage: 'weak' as const, reviewerNote: 'Stated, but no document backs it up yet.' }
        : { reviewStatus: 'confirmed' as const };
      await db.update(schema.mappings).set({ ...update, reviewedAt: new Date() }).where(eq(schema.mappings.id, m.id));
      await db.insert(schema.auditEvents).values({ caseId: kase.id, type: 'mapping_reviewed',
        payload: { mappingId: m.id, action: correct ? 'correct' : 'confirm' } });
    }
    console.log(`  reviewed ${ordered.length} mappings`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
