import { BookOpen, ListChecks, Megaphone, CirclePlay } from 'lucide-react';
import { Link } from 'react-router';
import { Card, Empty, PageHeader, PageLoader, Progress, SectionTitle } from '../components/ui';
import { formatDue } from '../lib/format';
import { useCourses } from '../lib/queries';

export function CoursesPage() {
  const q = useCourses();
  if (q.isLoading || !q.data) return <PageLoader />;
  const active = q.data.filter((c) => c.active);
  const inactive = q.data.filter((c) => !c.active);

  return (
    <div>
      <PageHeader title="קורסים" subtitle="הקורסים של הסמסטר. אפשר להוסיף או להסיר קורסים מהמעקב בהגדרות." />
      {!q.data.length ? (
        <Card>
          <Empty icon={<BookOpen className="size-8" />} title="אין עדיין קורסים">
            אחרי החיבור ל-Moodle והסנכרון הראשון, הקורסים יופיעו כאן.
          </Empty>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((c) => (
          <Link key={c.id} to={`/courses/${c.id}`} className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-sunken">
            <span className="absolute inset-y-0 start-0 w-1" style={{ background: c.color }} />
            <div className="font-semibold leading-snug">{c.fullName}</div>
            <div className="mt-0.5 text-xs text-faint" dir="ltr">
              {c.shortName}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3.5" />
                {c.openTasks} משימות פתוחות
              </span>
              {c.lag ? (
                <span className="inline-flex items-center gap-1">
                  <CirclePlay className="size-3.5" />
                  {c.lag.behind ? `${c.lag.behind} הרצאות מאחור` : 'מעודכן בהרצאות'}
                </span>
              ) : null}
              {c.unreadAnnouncements ? (
                <span className="inline-flex items-center gap-1 text-week">
                  <Megaphone className="size-3.5" />
                  {c.unreadAnnouncements} הודעות חדשות
                </span>
              ) : null}
            </div>
            {c.nextDue ? (
              <div className="mt-3 rounded-xl bg-sunken px-3 py-2 text-[13px]">
                <span className="text-muted">הגשה הבאה: </span>
                <span className="font-medium">{c.nextDue.title}</span>
                <span className="text-muted tabular"> · {formatDue(c.nextDue.dueAt)}</span>
              </div>
            ) : null}
            {c.lag ? <Progress value={c.lag.total ? c.lag.watched / c.lag.total : 0} color={c.color} className="mt-3" /> : null}
          </Link>
        ))}
      </div>
      {inactive.length ? (
        <>
          <SectionTitle count={inactive.length}>
            <span className="mt-6 block">לא במעקב</span>
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((c) => (
              <Link key={c.id} to={`/courses/${c.id}`} className="rounded-xl border border-line px-3 py-2.5 text-sm text-muted hover:bg-sunken">
                {c.fullName}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
