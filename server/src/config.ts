import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// server/src/config.ts (dev) and server/dist/index.js (prod) both sit two levels below the repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
export const appRoot = path.resolve(here, '../..');

const env = process.env;
export const isProd = env.NODE_ENV === 'production';

const dataDir = path.resolve(env.DATA_DIR ?? path.join(appRoot, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

/** Use the env value if set; otherwise generate once and keep it in the data dir. */
function persistentSecret(name: string, envValue: string | undefined): string {
  if (envValue && envValue.trim()) return envValue.trim();
  const file = path.join(dataDir, `.${name}`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  dataDir,
  filesDir: path.join(dataDir, 'files'),
  dbPath: env.DB_PATH ?? path.join(dataDir, 'study-os.db'),
  moodleUrl: (env.MOODLE_URL ?? 'https://moodle.bgu.ac.il/moodle').replace(/\/+$/, ''),
  appPassword: env.APP_PASSWORD ?? (isProd ? '' : 'dev'),
  sessionSecret: persistentSecret('session-secret', env.SESSION_SECRET),
  encryptionKey: persistentSecret('encryption-key', env.ENCRYPTION_KEY),
  timezone: 'Asia/Jerusalem',
  webDist: path.resolve(env.WEB_DIST ?? path.join(appRoot, 'web/dist')),
  migrationsDir: path.resolve(env.MIGRATIONS_DIR ?? path.join(appRoot, 'server/drizzle')),
  disableScheduler: env.DISABLE_SCHEDULER === '1',
  publicUrl: env.PUBLIC_URL?.replace(/\/+$/, ''),
  vapidSubject: env.VAPID_SUBJECT ?? 'mailto:study-os@example.com',
};

fs.mkdirSync(config.filesDir, { recursive: true });
