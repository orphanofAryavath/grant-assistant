import type { z } from 'zod';

export class ModelOutputError extends Error {}

/** Parse and validate model output. Strips markdown fences the model sometimes adds even in
 *  JSON mode, then validates against the zod schema so bad output never reaches the DB. */
export function parseModelJson<T extends z.ZodType>(raw: string, schema: T): z.infer<T> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new ModelOutputError(`Model returned invalid JSON (first 120 chars: ${cleaned.slice(0, 120)})`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ModelOutputError(`Model output failed validation at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return result.data;
}
