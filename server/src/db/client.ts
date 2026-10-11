import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../env';
import * as schema from './schema';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in');
}

export const db = drizzle(neon(env.databaseUrl), { schema });
export { schema };
