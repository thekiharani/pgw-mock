/**
 * mysql2 pool + Drizzle instance. Mirrors app/db/engine.py + session.py.
 *
 * The Python app opens a per-request AsyncSession; Drizzle queries run against
 * the shared pool directly, which is equivalent for this mock's needs. A fresh
 * connection from the pool is used for background callback delivery.
 */
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import { settings } from '../config.js';
import * as schema from './schema.js';

export const pool: mysql.Pool = mysql.createPool({
  uri: settings.databaseUrl,
  connectionLimit: settings.DB_CONNECTION_LIMIT,
  // Decimals come back as strings (mirrors Python Decimal handling);
  // mysql2 default decimalNumbers=false already does this.
  timezone: 'Z',
});

export const db: MySql2Database<typeof schema> = drizzle(pool, {
  schema,
  mode: 'default',
});

/** The Drizzle DB handle type. */
export type Db = MySql2Database<typeof schema>;
/** The transaction handle passed to db.transaction(cb). */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either a pooled DB handle or an active transaction. */
export type Executor = Db | DbTransaction;

export { schema };
