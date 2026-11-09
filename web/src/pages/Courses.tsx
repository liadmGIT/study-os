import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { CourseMark, Empty, GroupLabel, PageHeader, PageLoader, Progress } from '../components/ui';
import { formatDue } from '../lib/format';
import { useCourses } from '../lib/queries';

export function CoursesPage() {
  const q = useCourses();
  if (q.isLoading || !q.data) return <PageLoader />;
  const active = q.data.filter((c) => c.active);
  const inactive = q.data.filter((c) => !c.active);

  return (
    <div>
      <PageHeader eyebrow={`${active.length} במעקב`} title="קורסים" subtitle="הקורסים של הסמסטר. אפשר להוסיף או להוריד קורסים מהמעקב בהגדרות." />
      {!q.data.length ? (
        <Empty title="אין עדיין קורסים" className="border-y border-rule">
          אחרי החיבור ל-Moodle והסנכרון הראשון, הקורסים יופיעו כאן.
        </Empty>
      ) : null}

      <ul className="rise border-t-2 border-ink" style={{ '--i': 1 } as CSSProperties}>
        {active.map((c) => (
          <li key={c.id} className="border-b border-rule">
            <Link to={`/courses/${c.id}`} className="group grid gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 gap-3">
                <CourseMark color={c.color} className="mt-1.5 h-6 w-1" />
                <div className="min-w-0">
                  <h2 className="display text-[21px] group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{c.fullName}</h2>
                  <p className="text-[13px] text-ink-3" dir="ltr" style={{ textAlign: 'right' }}>
                    {c.shortName}
                  </p>
                </div>
              </div>
              <dl className="space-y-1 text-[14px] max-md:ps-4">
                <div className="flex gap-2">
                  <dt className="text-ink-3">משימות פתוחות</dt>
                  <dd className="tabular">{c.openTasks}</dd>
                </div>
                {c.nextDue ? (
                  <div>
                    <dt className="sr-only">ההגשה הבאה</dt>
                    <dd className="truncate">
                      <span className="text-ink-2 tabular">{formatDue(c.nextDue.dueAt)}</span> · {c.nextDue.title}
                    </dd>
                  </div>
                ) : null}
                {c.unreadAnnouncements ? (
                  <div>
                    <dt className="sr-only">הודעות</dt>
                    <dd className="text-amber">{c.unreadAnnouncements} הודעות חדשות</dd>
                  </div>
                ) : null}
              </dl>
              {c.lag ? (
                <div className="text-[14px] max-md:ps-4">
                  <p className="mb-1.5 flex justify-between gap-2">
                    <span className="text-ink-3">הרצאות</span>
                    <span className={c.lag.behind ? 'text-accent tabular' : 'text-green'}>{c.lag.behind ? `${c.lag.behind} מאחור` : 'מעודכן'}</span>
                  </p>
                  <Progress value={c.lag.total ? c.lag.watched / c.lag.total : 0} color={c.color} label={`${c.fullName}: ${c.lag.watched} מתוך ${c.lag.total} הרצאות`} />
                </div>
              ) : (
                <div />
              )}
            </Link>
          </li>
        ))}
      </ul>

      {inactive.length ? (
        <div className="mt-10">
          <GroupLabel count={inactive.length}>לא במעקב</GroupLabel>
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((c) => (
              <li key={c.id} className="border-b border-rule">
                <Link to={`/courses/${c.id}`} className="block py-2.5 text-[14.5px] text-ink-2 hover:text-ink hover:underline hover:underline-offset-4">
                  {c.fullName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
