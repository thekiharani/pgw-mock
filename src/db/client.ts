import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import { settings } from '@/config.js';
import * as schema from '@/db/schema.js';

export const pool: mysql.Pool = mysql.createPool({
  uri: settings.databaseUrl,
  connectionLimit: settings.DB_CONNECTION_LIMIT,
  timezone: 'Z',
});

export const db: MySql2Database<typeof schema> = drizzle(pool, {
  schema,
  mode: 'default',
});

export type Db = MySql2Database<typeof schema>;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | DbTransaction;

export { schema };
