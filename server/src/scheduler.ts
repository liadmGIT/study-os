import cron from 'node-cron';
import { runNotifications } from './notify/rules';
import { runSync } from './sync/engine';

const TZ = 'Asia/Jerusalem';

export function startScheduler(log: (msg: string) => void) {
  const sync = () =>
    runSync('cron')
      .then((r) => log(`sync: ${r.status}${r.error ? ` (${r.error})` : ''}`))
      .catch((e) => log(`sync crashed: ${e}`));

  // Every 20 minutes during the day, hourly at night.
  cron.schedule('*/20 7-23 * * *', sync, { timezone: TZ, noOverlap: true });
  cron.schedule('0 0-6 * * *', sync, { timezone: TZ, noOverlap: true });
  // Time-based reminders (deadline tomorrow, not started) even if a sync is skipped.
  cron.schedule('5,35 * * * *', () => runNotifications().catch((e) => log(`notify failed: ${e}`)), { timezone: TZ, noOverlap: true });

  // Catch up shortly after a restart.
  setTimeout(sync, 15000);
}
