import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { settings } from '@/config.js';
import * as schema from '@/db/schema.js';

export const pool: pg.Pool = new pg.Pool({
  connectionString: settings.databaseUrl,
  max: settings.DB_CONNECTION_LIMIT,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | DbTransaction;

export { schema };
