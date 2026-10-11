import { GoogleGenAI } from '@google/genai';
import { env } from '../env';
import { logger } from '../logger';

export interface LlmResult { text: string; inputTokens?: number; outputTokens?: number; model?: string }
export interface LlmProvider {
  model: string;
  generateJson(prompt: string, jsonSchema: unknown, step: string): Promise<LlmResult>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTransient = (err: unknown) => {
  const status = (err as { status?: number }).status;
  return status === 429 || status === 500 || status === 503 || status === 504;
};

class GeminiProvider implements LlmProvider {
  private client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  model = env.geminiModel;
  // Free-tier models return 503 "high demand" fairly often, so fall back to a lighter model
  // rather than failing the whole assessment.
  private models = [...new Set([env.geminiModel, ...env.geminiFallbackModels])];

  async generateJson(prompt: string, jsonSchema: unknown): Promise<LlmResult> {
    let lastErr: unknown;
    for (const model of this.models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await this.client.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: jsonSchema,
              temperature: 0.1, // consistent extraction, not creativity
            },
          });
          return {
            text: res.text ?? '',
            inputTokens: res.usageMetadata?.promptTokenCount,
            outputTokens: res.usageMetadata?.candidatesTokenCount,
            model,
          };
        } catch (err) {
          lastErr = err;
          if (!isTransient(err)) throw err;
          logger.warn({ model, attempt, status: (err as { status?: number }).status }, 'gemini transient error, retrying');
          await sleep(1000 * 2 ** attempt);
        }
      }
    }
    throw lastErr;
  }
}

let provider: LlmProvider | null = null;
let mockProvider: LlmProvider | null = null;

export async function getProvider(): Promise<LlmProvider> {
  if (env.aiProvider === 'mock') {
    if (!mockProvider) mockProvider = new (await import('./mock')).MockProvider();
    return mockProvider;
  }
  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is not set');
  if (!provider) provider = new GeminiProvider();
  return provider;
}
