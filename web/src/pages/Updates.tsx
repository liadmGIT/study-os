import { clsx } from 'clsx';
import DOMPurify from 'dompurify';
import { Bell, CheckCheck, Megaphone, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChangeItem } from '../components/ChangeItem';
import { Badge, Button, Card, CourseTag, Empty, PageHeader, PageLoader, Segmented } from '../components/ui';
import { patch, post } from '../lib/api';
import { formatAgo, formatDateTime } from '../lib/format';
import { useAction, useAnnouncements, useNotifications, useUpdates } from '../lib/queries';
import type { Announcement } from '../lib/types';

type Tab = 'changes' | 'announcements' | 'notifications';

export function UpdatesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'changes';
  const updates = useUpdates();
  const announcements = useAnnouncements();
  const notifications = useNotifications();
  const readAll = useAction(() => post('/api/announcements/read-all'));
  const readNotifications = useAction(() => post('/api/notifications/read-all'));
  const unreadAnn = announcements.data?.filter((a) => !a.read).length ?? 0;

  // Opening the notifications tab marks them as read.
  useEffect(() => {
    if (tab === 'notifications' && notifications.data?.unread) readNotifications.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, notifications.data?.unread]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="עדכונים"
        subtitle="כל מה שהשתנה ב-Moodle מאז שהתחלת לעקוב"
        actions={
          tab === 'announcements' && unreadAnn ? (
            <Button size="sm" onClick={() => readAll.run()}>
              <CheckCheck className="size-4" />
              סמן הכול כנקרא
            </Button>
          ) : null
        }
      />
      <div className="mb-4">
        <Segmented<Tab>
          value={tab}
          onChange={(t) => {
            params.set('tab', t);
            setParams(params, { replace: true });
          }}
          options={[
            { value: 'changes', label: 'מה השתנה' },
            { value: 'announcements', label: `הודעות מרצים${unreadAnn ? ` (${unreadAnn})` : ''}` },
            { value: 'notifications', label: `התראות${notifications.data?.unread ? ` (${notifications.data.unread})` : ''}` },
          ]}
        />
      </div>

      {tab === 'changes' ? (
        updates.isLoading ? (
          <PageLoader />
        ) : updates.data?.length ? (
          <Card className="p-1.5">{updates.data.map((c) => <ChangeItem key={c.id} change={c} />)}</Card>
        ) : (
          <Card>
            <Empty icon={<Sparkles className="size-8" />} title="עוד אין שינויים">
              הסנכרון הראשון רק שומר את המצב הקיים. מעכשיו כל מטלה חדשה, שינוי תאריך, הקלטה או הודעה יופיעו כאן.
            </Empty>
          </Card>
        )
      ) : null}

      {tab === 'announcements' ? (
        announcements.isLoading ? (
          <PageLoader />
        ) : announcements.data?.length ? (
          <div className="space-y-2">
            {announcements.data.map((a) => (
              <AnnouncementCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={<Megaphone className="size-8" />} title="אין הודעות" />
          </Card>
        )
      ) : null}

      {tab === 'notifications' ? (
        notifications.isLoading ? (
          <PageLoader />
        ) : notifications.data?.notifications.length ? (
          <Card className="p-1.5">
            {notifications.data.notifications.map((n) => (
              <Link key={n.id} to={n.url ?? '/'} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken">
                <Bell className={clsx('mt-0.5 size-4 shrink-0', n.read ? 'text-faint' : 'text-accent')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body ? <div className="text-sm text-muted">{n.body}</div> : null}
                  <div className="text-[11px] text-faint">{formatAgo(n.createdAt)}</div>
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <Card>
            <Empty icon={<Bell className="size-8" />} title="אין התראות">
              כדי לקבל התראות לטלפון, הפעל אותן ב<Link to="/settings" className="underline">הגדרות</Link>.
            </Empty>
          </Card>
        )
      ) : null}
    </div>
  );
}

function AnnouncementCard({ a }: { a: Announcement }) {
  const [open, setOpen] = useState(!a.read);
  const mark = useAction((read: boolean) => patch(`/api/announcements/${a.id}`, { read }));
  return (
    <Card className={clsx('p-4', !a.read && 'border-week/40')}>
      <button
        className="block w-full text-start"
        onClick={() => {
          setOpen((x) => !x);
          if (!a.read) mark.run(true);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!a.read ? <span className="size-2 rounded-full bg-week" /> : null}
          <span className="font-semibold">{a.subject}</span>
          {a.pinned ? <Badge>נעוץ</Badge> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {a.course ? <CourseTag name={a.course.name} color={a.course.color} /> : null}
          {a.author ? <span>{a.author}</span> : null}
          <span>{formatDateTime(a.postedAt)}</span>
        </div>
      </button>
      {open ? <div className="prose-he mt-3 border-t border-line pt-3 text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.message) }} /> : null}
    </Card>
  );
}
