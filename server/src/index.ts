import { buildApp } from './app';
import { config, isProd } from './config';
import { initDb } from './db';
import { startScheduler } from './scheduler';

if (!config.appPassword) {
  console.error('APP_PASSWORD is not set. Set it in the environment before starting the server.');
  process.exit(1);
}

initDb();
const app = await buildApp({ logger: true });
await app.listen({ port: config.port, host: config.host });

if (!config.disableScheduler) startScheduler((msg) => app.log.info(msg));
app.log.info(`Study OS running (${isProd ? 'production' : 'development'}), Moodle: ${config.moodleUrl}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
