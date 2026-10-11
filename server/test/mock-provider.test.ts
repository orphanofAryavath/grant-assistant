import { describe, it, expect } from 'vitest';
import { MockProvider } from '../src/ai/mock';
import { parseModelJson } from '../src/ai/parse';
import { ExtractionSchema, MappingSchema } from '../src/ai/schemas';
import { extractionPrompt, mappingPrompt } from '../src/ai/prompts';

// The offline provider must emit output that passes the same validation as the real model.
describe('MockProvider', () => {
  const p = new MockProvider();
  it('produces schema-valid extraction and mapping output', async () => {
    const g = 'Applicants must be registered non-profit organisations. Applications should include a letter of support from a partner.';
    const ext = parseModelJson((await p.generateJson(extractionPrompt(g), {}, 'extract')).text, ExtractionSchema);
    expect(ext.requirements.map((r) => r.level)).toEqual(['mandatory', 'recommended']);
    const map = parseModelJson((await p.generateJson(mappingPrompt({
      requirements: ext.requirements.map((r) => ({ code: r.code, text: r.text, level: r.level })),
      application: 'We are a registered non-profit organisations trust working since 2015 with 1200 families.',
      supporting: [],
    }), {}, 'map')).text, MappingSchema);
    expect(map.mappings).toHaveLength(2);
    expect(map.mappings[0].coverage).toBe('met');
  });
});
