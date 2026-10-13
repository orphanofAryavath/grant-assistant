import 'dotenv/config';

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  aiProvider: (process.env.AI_PROVIDER ?? 'gemini') as 'gemini' | 'mock',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean),
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 45_000),
  port: Number(process.env.PORT ?? 8787),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
