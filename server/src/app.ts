import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerAuth } from './auth';
import { config } from './config';
import { HttpError } from './lib/http';
import { backupRoutes } from './routes/backup';
import { courseRoutes } from './routes/courses';
import { dashboardRoutes } from './routes/dashboard';
import { fileRoutes } from './routes/files';
import { lectureRoutes } from './routes/lectures';
import { moodleRoutes } from './routes/moodle';
import { settingsRoutes } from './routes/settings';
import { taskRoutes } from './routes/tasks';
import { updateRoutes } from './routes/updates';

/** Trust exactly `hops` proxies in front of us (hop 0 is the direct connection). */
function trustHops(hops: number) {
  return (_address: string, hop: number) => hop < hops;
}

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, disableRequestLogging: true, trustProxy: trustHops(config.trustProxyHops), bodyLimit: 2 * 1024 * 1024 });

  await app.register(cookie);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'שגיאה בשרת' : (err as Error).message, code: 'error' });
  });

  app.get('/healthz', async () => ({ ok: true }));

  registerAuth(app);
  moodleRoutes(app);
  dashboardRoutes(app);
  taskRoutes(app);
  lectureRoutes(app);
  courseRoutes(app);
  updateRoutes(app);
  fileRoutes(app);
  settingsRoutes(app);
  backupRoutes(app);

  // The built web app; any non-API path falls back to index.html (client-side routing).
  const hasWeb = fs.existsSync(path.join(config.webDist, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      setHeaders: (res, file) => {
        if (file.endsWith('sw.js') || file.endsWith('index.html')) res.header('Cache-Control', 'no-cache');
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !hasWeb || req.method !== 'GET') {
      return reply.status(404).send({ error: 'Not found', code: 'not_found' });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}
