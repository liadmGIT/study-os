import DOMPurify from 'dompurify';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChangeItem } from '../components/ChangeItem';
import { Button, cn, CourseMark, Empty, GroupLabel, PageHeader, PageLoader, Tabs } from '../components/ui';
import { patch, post } from '../lib/api';
import { addDays, dayKeyOf, formatAgo, formatDateTime, formatFullDate, todayKey } from '../lib/format';
import { useAction, useAnnouncements, useNotifications, useUpdates } from '../lib/queries';
import type { Announcement, Change } from '../lib/types';

type Tab = 'changes' | 'announcements' | 'notifications';

function dayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'היום';
  if (key === addDays(today, -1)) return 'אתמול';
  return formatFullDate(key);
}

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

  const byDay = useMemo(() => {
    const m = new Map<string, Change[]>();
    for (const c of updates.data ?? []) {
      const k = dayKeyOf(c.createdAt);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [updates.data]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="עדכונים"
        subtitle="כל מה שהשתנה ב-Moodle מאז שהתחלת לעקוב."
        actions={
          tab === 'announcements' && unreadAnn ? (
            <Button size="sm" onClick={() => readAll.run()}>
              לסמן הכול כנקרא
            </Button>
          ) : null
        }
      />
      <Tabs<Tab>
        label="סוג העדכונים"
        value={tab}
        onChange={(t) => {
          params.set('tab', t);
          setParams(params, { replace: true });
        }}
        className="rise mb-6"
        options={[
          { value: 'changes', label: 'מה השתנה' },
          { value: 'announcements', label: `הודעות מרצים${unreadAnn ? ` · ${unreadAnn}` : ''}` },
          { value: 'notifications', label: `התראות${notifications.data?.unread ? ` · ${notifications.data.unread}` : ''}` },
        ]}
      />

      <div className="rise" style={{ '--i': 1 } as CSSProperties}>
        {tab === 'changes' ? (
          updates.isLoading ? (
            <PageLoader />
          ) : byDay.length ? (
            byDay.map(([day, list]) => (
              <section key={day} aria-label={dayLabel(day)}>
                <GroupLabel count={list.length}>{dayLabel(day)}</GroupLabel>
                <ul>
                  {list.map((c) => (
                    <ChangeItem key={c.id} change={c} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <Empty title="עוד אין שינויים" className="border-y border-rule">
              הסנכרון הראשון רק שומר את המצב הקיים. מעכשיו כל מטלה חדשה, שינוי תאריך, הקלטה או הודעה יופיעו כאן.
            </Empty>
          )
        ) : null}

        {tab === 'announcements' ? (
          announcements.isLoading ? (
            <PageLoader />
          ) : announcements.data?.length ? (
            <ul className="border-t border-rule">
              {announcements.data.map((a) => (
                <AnnouncementItem key={a.id} a={a} />
              ))}
            </ul>
          ) : (
            <Empty title="אין הודעות" className="border-y border-rule" />
          )
        ) : null}

        {tab === 'notifications' ? (
          notifications.isLoading ? (
            <PageLoader />
          ) : notifications.data?.notifications.length ? (
            <ul className="border-t border-rule">
              {notifications.data.notifications.map((n) => (
                <li key={n.id} className="border-b border-rule">
                  <Link to={n.url ?? '/'} className="group flex gap-3 py-3">
                    <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-rule-strong' : 'bg-accent')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium group-hover:underline group-hover:underline-offset-4">{n.title}</span>
                      {n.body ? <span className="block text-[14px] text-ink-2">{n.body}</span> : null}
                      <span className="block text-[12.5px] text-ink-3">{formatAgo(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="אין התראות" className="border-y border-rule">
              כדי לקבל התראות לטלפון, אפשר להפעיל אותן ב
              <Link to="/settings#notifications" className="underline underline-offset-4">
                הגדרות
              </Link>
              .
            </Empty>
          )
        ) : null}
      </div>
    </div>
  );
}

function AnnouncementItem({ a }: { a: Announcement }) {
  const [open, setOpen] = useState(!a.read);
  const bodyId = useId();
  const mark = useAction((read: boolean) => patch(`/api/announcements/${a.id}`, { read }));
  return (
    <li className="border-b border-rule">
      <article>
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex w-full items-start gap-3 py-4 text-start"
            onClick={() => {
              setOpen((x) => !x);
              if (!a.read) mark.run(true);
            }}
          >
            <span aria-hidden className={cn('mt-2.5 size-2 shrink-0 rounded-full', a.read ? 'bg-transparent' : 'bg-amber')} />
            <span className="min-w-0 flex-1">
              <span className="display block text-[19px]">
                {a.subject}
                {!a.read ? <span className="sr-only"> (חדש)</span> : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[13px] text-ink-2">
                {a.course ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CourseMark color={a.course.color} />
                    {a.course.name}
                  </span>
                ) : null}
                {a.author ? <span>{a.author}</span> : null}
                <span className="text-ink-3">{formatDateTime(a.postedAt)}</span>
              </span>
            </span>
            <ChevronDown className={cn('mt-1.5 size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        </h2>
        <div id={bodyId} hidden={!open} className="prose-he max-w-prose pb-5 ps-5 text-[15px]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.message) }} />
      </article>
    </li>
  );
}
