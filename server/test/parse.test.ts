import { describe, it, expect } from 'vitest';
import { parseModelJson, ModelOutputError } from '../src/ai/parse';
import { ExtractionSchema, MappingSchema } from '../src/ai/schemas';

const req = { code: 'R1', text: 'Be a non-profit', category: 'eligibility', level: 'mandatory', sourceQuote: 'must be a non-profit', requiredDocument: null };

describe('parseModelJson', () => {
  it('parses valid output, including when wrapped in a markdown fence', () => {
    expect(parseModelJson(JSON.stringify({ requirements: [req] }), ExtractionSchema).requirements).toHaveLength(1);
    expect(parseModelJson('```json\n' + JSON.stringify({ requirements: [req] }) + '\n```', ExtractionSchema).requirements[0].code).toBe('R1');
  });
  it('rejects malformed JSON', () => {
    expect(() => parseModelJson('{"requirements": [', ExtractionSchema)).toThrow(ModelOutputError);
  });
  it('rejects values outside the allowed enums with the failing path', () => {
    const bad = { requirements: [{ ...req, level: 'critical' }] };
    expect(() => parseModelJson(JSON.stringify(bad), ExtractionSchema)).toThrow(/requirements\.0\.level/);
  });
  it('requires every mapping field', () => {
    const bad = { mappings: [{ requirementCode: 'R1', coverage: 'met' }], clarificationQuestions: [], unsupportedClaims: [] };
    expect(() => parseModelJson(JSON.stringify(bad), MappingSchema)).toThrow(ModelOutputError);
  });
});
