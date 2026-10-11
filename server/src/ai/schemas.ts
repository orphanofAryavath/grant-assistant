import { z } from 'zod';

export const ExtractionSchema = z.object({
  requirements: z.array(z.object({
    code: z.string().describe('Short stable id like R1, R2'),
    text: z.string().describe('The requirement in plain language'),
    category: z.enum(['eligibility', 'submission', 'content']),
    level: z.enum(['mandatory', 'recommended']).describe(
      'mandatory = must/required/shall/will not be considered; recommended = should/encouraged/may/preferred'),
    sourceQuote: z.string().describe('Exact sentence copied verbatim from the guideline'),
    requiredDocument: z.string().nullable().describe('Name of a supporting document this requirement asks for, else null'),
  })),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const MappingSchema = z.object({
  mappings: z.array(z.object({
    requirementCode: z.string(),
    coverage: z.enum(['met', 'weak', 'ambiguous', 'missing']),
    rationale: z.string().describe('One or two sentences explaining the judgement'),
    evidenceQuote: z.string().nullable().describe('Exact text copied verbatim from the application, or null if none'),
    evidenceSource: z.string().nullable().describe('"application" or the name of a supporting document, or null'),
  })),
  clarificationQuestions: z.array(z.object({
    question: z.string(),
    requirementCode: z.string().nullable(),
  })),
  unsupportedClaims: z.array(z.object({
    claim: z.string().describe('The claim, summarised'),
    quote: z.string().describe('Exact text copied verbatim from the application'),
    reason: z.string().describe('Why no supplied evidence supports it'),
  })),
});
export type Mapping = z.infer<typeof MappingSchema>;

/** JSON Schema handed to the model so it is constrained to this shape. Zod still
 *  validates the result — the schema is a hint to the model, not a guarantee. */
export const extractionJsonSchema = z.toJSONSchema(ExtractionSchema);
export const mappingJsonSchema = z.toJSONSchema(MappingSchema);
