import pg from 'pg';
import 'dotenv/config';
const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});
export async function query<T = any>(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
