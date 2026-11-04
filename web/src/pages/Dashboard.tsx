import { CalendarDays, CirclePlay, Flame, Hourglass, Link2, ListChecks, Megaphone, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChangeItem } from '../components/ChangeItem';
import { QuickAdd } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { Button, Card, CardHeader, CourseTag, Empty, PageHeader, PageLoader, Progress } from '../components/ui';
import { formatAgo, formatFullDate, formatMinutes, greeting } from '../lib/format';
import { useDashboard } from '../lib/queries';

function Stat({ icon, value, label, to, tone }: { icon: React.ReactNode; value: number; label: string; to: string; tone: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-sunken">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight tabular">{value}</div>
        <div className="truncate text-xs text-muted">{label}</div>
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const q = useDashboard();
  const [adding, setAdding] = useState(false);
  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  const behind = d.lag.reduce((s, l) => s + l.behind, 0);
  const behindMin = d.lag.reduce((s, l) => s + l.behindMin, 0);
  const lectureMin = d.todayLectures.reduce((s, i) => s + i.minutes, 0);

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={formatFullDate(d.today)}
        actions={
          <Button variant="primary" onClick={() => setAdding((x) => !x)}>
            <Plus className="size-4" />
            משימה
          </Button>
        }
      />

      {adding ? (
        <Card className="mb-5 p-3">
          <QuickAdd onDone={() => setAdding(false)} />
        </Card>
      ) : null}

      {!d.sync.connected ? (
        <Card className="mb-5 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Link2 className="size-5" />
          </span>
          <div className="flex-1">
            <div className="font-semibold">עוד לא חיברת את Moodle</div>
            <div className="text-sm text-muted">אחרי החיבור כל הקורסים, המטלות וההקלטות ייכנסו לכאן אוטומטית.</div>
          </div>
          <Link to="/connect" className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-canvas">
            חיבור ל-Moodle
          </Link>
        </Card>
      ) : d.sync.running && !d.sync.last?.finishedAt ? (
        <Card className="mb-5 flex items-center gap-3 p-4 text-sm">
          <Sparkles className="size-5 text-accent" />
          הסנכרון הראשון רץ עכשיו. זה לוקח בדרך כלל פחות מדקה.
        </Card>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Flame className="size-5" />} value={(d.counts.overdue ?? 0) + (d.counts.urgent ?? 0)} label="דחוף או באיחור" to="/tasks" tone="var(--color-urgent)" />
        <Stat icon={<Hourglass className="size-5" />} value={d.notStarted} label="עוד לא התחלת" to="/tasks?filter=notstarted" tone="var(--color-overdue)" />
        <Stat icon={<CirclePlay className="size-5" />} value={behind} label="הרצאות שמחכות" to="/lectures" tone="var(--color-brand)" />
        <Stat icon={<Megaphone className="size-5" />} value={d.announcements.unread} label="הודעות שלא נקראו" to="/updates?tab=announcements" tone="var(--color-week)" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="בפוקוס" subtitle="באיחור, או להגשה ב-48 השעות הקרובות" icon={<Flame className="size-[18px]" />} action={<Link to="/tasks" className="text-xs text-muted hover:text-ink">כל המשימות</Link>} />
            <div className="px-1 pb-2">
              {d.focus.length ? d.focus.map((t) => <TaskRow key={t.id} task={t} />) : <Empty title="אין משהו דחוף 🎉">אין מטלות באיחור או ליומיים הקרובים.</Empty>}
            </div>
          </Card>
          <Card>
            <CardHeader title="בהמשך השבוע" icon={<CalendarDays className="size-[18px]" />} action={<Link to="/week" className="text-xs text-muted hover:text-ink">לוח שבועי</Link>} />
            <div className="px-1 pb-2">
              {d.thisWeek.length ? d.thisWeek.map((t) => <TaskRow key={t.id} task={t} />) : <Empty title="שבוע פנוי">אין עוד הגשות השבוע.</Empty>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="היום" subtitle={lectureMin ? `השלמת הרצאות: ${formatMinutes(lectureMin)}` : undefined} icon={<ListChecks className="size-[18px]" />} />
            <div className="px-1 pb-2">
              {d.plannedToday.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {d.todayLectures.map((i) => (
                <Link key={`${i.moduleId}-${i.part}`} to={`/lectures?course=${i.courseId}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken">
                  <CirclePlay className="size-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {i.course ? <CourseTag name={i.course.name} color={i.course.color} className="max-w-36" /> : null}
                      <span className="tabular">
                        {formatMinutes(i.minutes)}
                        {i.parts > 1 ? ` (חלק ${i.part}/${i.parts})` : ''}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {!d.plannedToday.length && !d.todayLectures.length ? <Empty title="אין תוכנית להיום">גרור משימות ליום בלוח השבועי, או סמן "מתי לעבוד על זה".</Empty> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="מעקב הרצאות"
              subtitle={behind ? `${behind} הרצאות, בערך ${formatMinutes(behindMin)}` : 'מעודכן בכל הקורסים'}
              icon={<CirclePlay className="size-[18px]" />}
            />
            <div className="space-y-3 px-4 pb-4">
              {d.lag.length ? (
                d.lag.map((l) => (
                  <Link key={l.courseId} to={`/lectures?course=${l.courseId}`} className="block">
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <CourseTag name={l.courseName} color={l.color} className="flex-1 !text-sm !text-ink" />
                      <span className={l.behind ? 'text-xs font-medium text-urgent tabular' : 'text-xs text-ok'}>{l.behind ? `${l.behind} מאחור` : 'מעודכן'}</span>
                    </div>
                    <Progress value={l.total ? l.watched / l.total : 0} color={l.color} />
                  </Link>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted">עוד לא זוהו הקלטות.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="מה חדש"
              icon={<Sparkles className="size-[18px]" />}
              subtitle={d.sync.last?.finishedAt ? `סנכרון אחרון ${formatAgo(d.sync.last.finishedAt)}` : undefined}
              action={<Link to="/updates" className="text-xs text-muted hover:text-ink">הכול</Link>}
            />
            <div className="px-1 pb-2">
              {d.recentChanges.length ? d.recentChanges.slice(0, 6).map((c) => <ChangeItem key={c.id} change={c} />) : <Empty title="אין עדכונים חדשים">כאן יופיעו מטלות חדשות, שינויי תאריכים, הקלטות והודעות.</Empty>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
