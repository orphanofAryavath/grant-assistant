import { GoogleGenAI } from '@google/genai';
import { env } from '../env';
import { logger } from '../logger';

export interface LlmResult { text: string; inputTokens?: number; outputTokens?: number; model?: string }
export interface LlmProvider {
  model: string;
  generateJson(prompt: string, jsonSchema: unknown, step: string): Promise<LlmResult>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (err: unknown) => (err as { status?: number }).status;
const isTimeout = (err: unknown) => {
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError' || statusOf(err) === 504;
};
const isTransient = (err: unknown) => [429, 500, 503].includes(statusOf(err) ?? 0) || isTimeout(err);

class GeminiProvider implements LlmProvider {
  private client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  model = env.geminiModel;
  // The free tier is often overloaded ("503 high demand") or very slow. Each call gets a hard
  // timeout; a slow or overloaded model hands over to a lighter fallback instead of waiting.
  private models = [...new Set([env.geminiModel, ...env.geminiFallbackModels])];

  async generateJson(prompt: string, jsonSchema: unknown, step: string): Promise<LlmResult> {
    let lastErr: unknown;
    for (const model of this.models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const started = Date.now();
        try {
          const res = await this.client.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: jsonSchema,
              temperature: 0.1, // consistent extraction, not creativity
              abortSignal: AbortSignal.timeout(env.geminiTimeoutMs),
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
          const timedOut = isTimeout(err);
          logger.warn({ step, model, attempt, timedOut, status: statusOf(err), elapsedMs: Date.now() - started },
            'gemini call failed, retrying or falling back');
          if (timedOut) break; // a slow model won't get faster on retry — move to the fallback
          await sleep(1500 * (attempt + 1));
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
