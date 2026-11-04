// Thin client for Moodle's REST web services (the same API the official mobile app uses).

export class MoodleError extends Error {
  constructor(
    public code: string,
    message: string,
    public wsfunction?: string,
  ) {
    super(message);
    this.name = 'MoodleError';
  }
}

/** The stored token was rejected – the user must reconnect. */
export class MoodleTokenError extends MoodleError {
  constructor(message: string, wsfunction?: string) {
    super('invalidtoken', message, wsfunction);
    this.name = 'MoodleTokenError';
  }
}

const TOKEN_ERRORS = new Set(['invalidtoken', 'invalidtokensession', 'tokenexpired']);

/** Moodle REST expects PHP-style params: courseids[0]=1&options[0][name]=x */
export function flattenParams(value: unknown, prefix = '', out = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenParams(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenParams(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else if (typeof value === 'boolean') {
    out.append(prefix, value ? '1' : '0');
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

/** Runs at most `n` promises at once. */
export function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    queue.shift()!();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MoodleClientOptions {
  baseUrl: string;
  token: string;
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export class MoodleClient {
  readonly baseUrl: string;
  private token: string;
  private limit: ReturnType<typeof limiter>;
  private timeoutMs: number;
  private retries: number;
  calls = 0;

  constructor(opts: MoodleClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.limit = limiter(opts.concurrency ?? 3);
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.retries = opts.retries ?? 2;
  }

  call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.limit(() => this.callWithRetry<T>(wsfunction, params));
  }

  private async callWithRetry<T>(wsfunction: string, params: Record<string, unknown>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      try {
        return await this.callOnce<T>(wsfunction, params);
      } catch (err) {
        lastError = err;
        // Moodle-level errors are deterministic; only retry network / server failures.
        if (err instanceof MoodleError) throw err;
      }
    }
    throw lastError;
  }

  private async callOnce<T>(wsfunction: string, params: Record<string, unknown>): Promise<T> {
    this.calls++;
    const url = `${this.baseUrl}/webservice/rest/server.php?moodlewsrestformat=json&wsfunction=${encodeURIComponent(wsfunction)}`;
    const body = flattenParams(params);
    body.set('wstoken', this.token);
    body.set('moodlewssettingfilter', 'true');
    body.set('moodlewssettingfileurl', 'true');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status >= 500) throw new Error(`Moodle HTTP ${res.status} (${wsfunction})`);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Moodle returned non-JSON for ${wsfunction} (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    if (json && typeof json === 'object' && 'exception' in json) {
      const e = json as { errorcode?: string; message?: string };
      const code = e.errorcode ?? 'unknown';
      if (TOKEN_ERRORS.has(code)) throw new MoodleTokenError(e.message ?? code, wsfunction);
      throw new MoodleError(code, e.message ?? code, wsfunction);
    }
    return json as T;
  }

  /** File URLs from the API need the token, and must go through webservice/pluginfile.php. */
  authFileUrl(fileUrl: string): string {
    const url = new URL(fileUrl);
    if (url.pathname.includes('/pluginfile.php') && !url.pathname.includes('/webservice/pluginfile.php')) {
      url.pathname = url.pathname.replace('/pluginfile.php', '/webservice/pluginfile.php');
    }
    url.searchParams.set('token', this.token);
    return url.toString();
  }

  async download(fileUrl: string, timeoutMs = 120000): Promise<Response> {
    const res = await fetch(this.authFileUrl(fileUrl), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      const body = (await res.json()) as { errorcode?: string; error?: string };
      if (body.errorcode && TOKEN_ERRORS.has(body.errorcode)) throw new MoodleTokenError(body.error ?? body.errorcode);
      throw new Error(`Download failed: ${body.error ?? body.errorcode ?? 'unknown error'}`);
    }
    return res;
  }
}
