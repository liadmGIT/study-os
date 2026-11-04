import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db';
import { decrypt, encrypt } from '../lib/crypto';
import { nowSec } from '../lib/time';
import type { TokenResult } from './auth';
import { MoodleClient, MoodleTokenError } from './client';
import type { SiteInfo } from './types';

export type Account = typeof schema.moodleAccount.$inferSelect;

export function getAccount(): Account | undefined {
  return db().select().from(schema.moodleAccount).where(eq(schema.moodleAccount.id, 1)).get();
}

/** The stored token can't be decrypted – almost always because ENCRYPTION_KEY changed. */
export class TokenUnreadableError extends MoodleTokenError {
  constructor() {
    super('The saved Moodle token cannot be decrypted (was ENCRYPTION_KEY changed?)');
    this.name = 'TokenUnreadableError';
  }
}

export function clientFor(account: Account): MoodleClient {
  let token: string;
  try {
    token = decrypt(account.tokenEnc);
  } catch {
    throw new TokenUnreadableError();
  }
  return new MoodleClient({ baseUrl: account.baseUrl, token });
}

/** Validates the token against Moodle and stores it (encrypted). */
export async function saveConnection(tokens: TokenResult, username?: string, baseUrl = config.moodleUrl) {
  const client = new MoodleClient({ baseUrl, token: tokens.token });
  const info = await client.call<SiteInfo>('core_webservice_get_site_info');
  const row = {
    id: 1,
    baseUrl,
    userId: info.userid,
    username: username ?? info.username,
    fullName: info.fullname,
    siteName: info.sitename,
    tokenEnc: encrypt(tokens.token),
    privateTokenEnc: tokens.privateToken ? encrypt(tokens.privateToken) : null,
    functions: (info.functions ?? []).map((f) => f.name),
    connectedAt: nowSec(),
    lastOkAt: nowSec(),
    tokenInvalid: false,
  };
  db().insert(schema.moodleAccount).values(row).onConflictDoUpdate({ target: schema.moodleAccount.id, set: row }).run();
  return { fullName: info.fullname, siteName: info.sitename, functions: row.functions.length };
}

export function disconnect() {
  db().delete(schema.moodleAccount).run();
}

export function markTokenInvalid() {
  db().update(schema.moodleAccount).set({ tokenInvalid: true }).where(eq(schema.moodleAccount.id, 1)).run();
}

export function markOk(functions?: string[]) {
  db()
    .update(schema.moodleAccount)
    .set({ lastOkAt: nowSec(), tokenInvalid: false, ...(functions ? { functions } : {}) })
    .where(eq(schema.moodleAccount.id, 1))
    .run();
}
