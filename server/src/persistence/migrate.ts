import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Applies db/migrations/*.sql in lexical order, once each (tracked in schema_migrations).
 * Usage: DATABASE_URL=postgres://… npm run db:migrate -w server
 */
export async function runMigrations(connectionString: string, ssl: boolean, migrationsDir?: string): Promise<string[]> {
  const dir = migrationsDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
  const client = new pg.Client({ connectionString, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}) });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const done = await client.query('select 1 from schema_migrations where name = $1', [file]);
      if ((done.rowCount ?? 0) > 0) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const ssl = process.env.DATABASE_SSL === 'require' || process.env.DATABASE_SSL === 'true';
  runMigrations(url, ssl)
    .then((applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database already up to date');
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
