import { beforeAll, describe, expect, it, vi } from 'vitest';

// Push sending is replaced by a slow fake so overlapping runs would show up as duplicates.
const { sent } = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock('../src/notify/push', () => ({
  sendPush: vi.fn(async (p: { tag?: string }) => {
    sent.push(p.tag ?? '');
    await new Promise((r) => setTimeout(r, 20));
    return { sent: 1, failed: 0 };
  }),
  vapidKeys: () => ({ publicKey: 'x', privateKey: 'y' }),
}));

import { initDb } from '../src/db';
import { defaultSettings, updateSettings } from '../src/lib/settings';
import { zonedToUnix } from '../src/lib/time';
import { addNotification, inQuietHours, runNotifications } from '../src/notify/rules';

beforeAll(() => {
  initDb(':memory:');
  updateSettings({ quietHoursStart: 0, quietHoursEnd: 0 }); // no quiet hours for this test
});

describe('notifications', () => {
  it('does not push the same notification twice when two runs overlap', async () => {
    addNotification({ key: 'a', type: 'test', title: 'A' });
    addNotification({ key: 'b', type: 'test', title: 'B' });
    await Promise.all([runNotifications(), runNotifications()]);
    expect([...sent].sort()).toEqual(['a', 'b']);
    await runNotifications();
    expect(sent).toHaveLength(2);
  });

  it('knows the quiet hours (23:00–07:00 by default)', () => {
    const s = defaultSettings;
    expect(inQuietHours(s, zonedToUnix(2026, 11, 4, 2, 0))).toBe(true);
    expect(inQuietHours(s, zonedToUnix(2026, 11, 4, 23, 30))).toBe(true);
    expect(inQuietHours(s, zonedToUnix(2026, 11, 4, 12, 0))).toBe(false);
    expect(inQuietHours(s, zonedToUnix(2026, 11, 4, 7, 0))).toBe(false);
  });
});
