import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

let instance: { db: DB; sqlite: Database.Database } | null = null;

export function initDb(file = config.dbPath): DB {
  instance?.sqlite.close();
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: config.migrationsDir });
  instance = { db, sqlite };
  return db;
}

export function db(): DB {
  if (!instance) initDb();
  return instance!.db;
}

export function closeDb() {
  instance?.sqlite.close();
  instance = null;
}

export { schema };
