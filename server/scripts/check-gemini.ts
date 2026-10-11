import { readFileSync } from 'node:fs';
import { getProvider } from '../src/ai/provider';
import { parseModelJson } from '../src/ai/parse';
import { extractionPrompt, mappingPrompt } from '../src/ai/prompts';
import { ExtractionSchema, MappingSchema, extractionJsonSchema, mappingJsonSchema } from '../src/ai/schemas';
import { verifyQuote } from '../src/lib/citations';

async function main() {

  const g = readFileSync('samples/guideline.md', 'utf8');
  const a = readFileSync('samples/application_draft.md', 'utf8');
  const sup = JSON.parse(readFileSync('samples/supporting_documents.json', 'utf8'));
  const p = await getProvider();
  let t = Date.now();
  const e = parseModelJson((await p.generateJson(extractionPrompt(g), extractionJsonSchema, 'extract')).text, ExtractionSchema);
  console.log('extract', Date.now() - t, 'ms', e.requirements.length, 'reqs; verified quotes', e.requirements.filter((r) => verifyQuote(r.sourceQuote, g)).length);
  for (const r of e.requirements) console.log(' ', r.code, r.level, r.category, r.requiredDocument ?? '', '|', r.text.slice(0, 70));
  t = Date.now();
  const m = parseModelJson((await p.generateJson(mappingPrompt({ requirements: e.requirements, application: a, supporting: sup }), mappingJsonSchema, 'map')).text, MappingSchema);
  console.log('map', Date.now() - t, 'ms');
  for (const x of m.mappings) console.log(' ', x.requirementCode, x.coverage, x.evidenceSource ?? '', x.evidenceQuote ? (verifyQuote(x.evidenceQuote, a) ? 'quote-ok' : 'QUOTE-BAD') : '');
  console.log('questions', m.clarificationQuestions.length, 'claims', m.unsupportedClaims.map((c) => c.claim.slice(0, 60)));
}

main().catch((e) => { console.error(e); process.exit(1); });
