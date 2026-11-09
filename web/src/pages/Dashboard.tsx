import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { ChangeItem } from '../components/ChangeItem';
import { TaskList, TaskRow } from '../components/TaskRow';
import { buttonClass, cn, CourseMark, Empty, PageLoader, Progress, Section } from '../components/ui';
import { formatAgo, formatFullDate, formatHebrewDate, formatMinutes, greeting } from '../lib/format';
import { useDashboard, useMoodleStatus } from '../lib/queries';

/** A figure in the ledger row under the masthead. */
function Figure({ value, label, sub, to, hot }: { value: number; label: string; sub?: string; to: string; hot?: boolean }) {
  return (
    <Link to={to} className="group block px-1 py-2 md:px-5 md:py-1">
      <span className={cn('display block text-[32px] leading-none tabular md:text-[44px]', hot && value > 0 ? 'text-accent' : value === 0 ? 'text-ink-3' : 'text-ink')}>
        {value}
      </span>
      <span className="mt-1 block text-[13.5px] leading-snug text-ink-2 group-hover:text-ink md:mt-1.5 md:text-[14px] group-hover:underline group-hover:underline-offset-4">{label}</span>
      {sub ? <span className="block text-[12.5px] text-ink-3">{sub}</span> : null}
    </Link>
  );
}

function Callout({ children, action, i }: { children: ReactNode; action?: ReactNode; i?: number }) {
  return (
    <div className="rise mb-8 flex flex-col gap-3 border-y-2 border-ink py-4 sm:flex-row sm:items-center" style={{ '--i': i ?? 0 } as CSSProperties}>
      <div className="flex-1 text-[15px]">{children}</div>
      {action}
    </div>
  );
}

export function DashboardPage() {
  const q = useDashboard();
  const moodle = useMoodleStatus();
  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  const behind = d.lag.reduce((s, l) => s + l.behind, 0);
  const behindMin = d.lag.reduce((s, l) => s + l.behindMin, 0);
  const lectureMin = d.todayLectures.reduce((s, i) => s + i.minutes, 0);
  const firstName = moodle.data?.fullName?.split(' ')[0];
  const [weekday, ...rest] = formatFullDate(d.today).split(', ');

  return (
    <div>
      {/* Masthead */}
      <header className="rise mb-8 border-b-2 border-ink pb-5">
        <p className="eyebrow">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <h1 className="display mt-2 text-[34px] md:text-[48px]">
          <span className="pen-underline">{weekday}</span>
          {rest.length ? <span className="text-ink-2">, {rest.join(', ')}</span> : null}
        </h1>
        <p className="mt-2 flex flex-wrap gap-x-3 text-[14px] text-ink-2">
          <span>{formatHebrewDate(d.today, true)}</span>
          {d.sync.last?.finishedAt ? (
            <>
              <span aria-hidden>·</span>
              <span>סונכרן עם Moodle {formatAgo(d.sync.last.finishedAt)}</span>
            </>
          ) : null}
        </p>
      </header>

      {!d.sync.connected ? (
        <Callout
          i={1}
          action={
            <Link to="/connect" className={buttonClass('primary')}>
              חיבור ל-Moodle
            </Link>
          }
        >
          <strong className="font-semibold">עוד לא חיברת את Moodle.</strong> אחרי החיבור כל הקורסים, המטלות וההקלטות ייכנסו לכאן לבד.
        </Callout>
      ) : d.sync.running && !d.sync.everSynced ? (
        <Callout i={1}>
          <strong className="font-semibold">הסנכרון הראשון רץ עכשיו.</strong> בדרך כלל זה לוקח פחות מדקה, והמסך יתעדכן לבד.
        </Callout>
      ) : null}

      {/* Ledger: the four numbers that matter, set like a newspaper index */}
      <nav aria-label="סיכום" className="rise mb-8 grid grid-cols-2 gap-y-2 md:mb-10 md:grid-cols-4 md:divide-x md:divide-x-reverse md:divide-rule" style={{ '--i': 1 } as CSSProperties}>
        <Figure value={(d.counts.overdue ?? 0) + (d.counts.urgent ?? 0)} label="באיחור או ב-48 השעות הקרובות" to="/tasks" hot />
        <Figure value={d.notStarted} label="מטלות שעוד לא התחלת" to="/tasks?filter=notstarted" hot />
        <Figure value={behind} label="הרצאות שמחכות לך" sub={behind ? `בערך ${formatMinutes(behindMin)}` : undefined} to="/lectures" />
        <Figure value={d.announcements.unread} label="הודעות חדשות מהמרצים" to="/updates?tab=announcements" />
      </nav>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="space-y-10 lg:col-span-7">
          <Section
            i={2}
            title="דורש תשומת לב"
            meta="באיחור, או להגשה ביומיים הקרובים"
            action={
              <Link to="/tasks" className="text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                כל המשימות
              </Link>
            }
          >
            {d.focus.length ? <TaskList tasks={d.focus} label="משימות דחופות" /> : <Empty title="אין שום דבר דחוף">אין מטלות באיחור או להגשה ביומיים הקרובים.</Empty>}
          </Section>
          <Section
            i={3}
            title="בהמשך השבוע"
            action={
              <Link to="/week" className="text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                לוח שבועי
              </Link>
            }
          >
            {d.thisWeek.length ? <TaskList tasks={d.thisWeek} label="בהמשך השבוע" /> : <Empty title="שבוע פנוי">אין עוד הגשות השבוע.</Empty>}
          </Section>
        </div>

        <aside className="space-y-10 lg:col-span-5" aria-label="היום והתקדמות">
          <Section i={3} title="התוכנית להיום" meta={lectureMin ? `${formatMinutes(lectureMin)} הרצאות` : undefined}>
            {d.plannedToday.length || d.todayLectures.length ? (
              <ul>
                {d.plannedToday.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
                {d.todayLectures.map((i) => (
                  <li key={`${i.moduleId}-${i.part}`} className="border-b border-rule last:border-b-0">
                    <Link to={`/lectures?course=${i.courseId}`} className="group flex items-center gap-3 py-3">
                      {i.course ? <CourseMark color={i.course.color} className="h-8" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] group-hover:underline group-hover:underline-offset-4">{i.title}</span>
                        <span className="block truncate text-[13px] text-ink-2">
                          {i.course?.name}
                          {i.parts > 1 ? ` · חלק ${i.part} מתוך ${i.parts}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] text-ink-2 tabular">{formatMinutes(i.minutes)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="אין תוכנית להיום">אפשר לבחור משימה ולסמן "לעבוד על זה היום", או לגרור אותה ליום בלוח השבועי.</Empty>
            )}
          </Section>

          <Section
            i={4}
            title="הרצאות"
            meta={behind ? `${behind} מחכות` : 'אתה מעודכן'}
            action={
              <Link to="/lectures" className="text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                למעקב
              </Link>
            }
          >
            {d.lag.length ? (
              <ul className="space-y-4">
                {d.lag.map((l) => (
                  <li key={l.courseId}>
                    <Link to={`/lectures?course=${l.courseId}`} className="group block">
                      <span className="mb-1.5 flex items-baseline gap-3 text-[14.5px]">
                        <span className="min-w-0 flex-1 truncate group-hover:underline group-hover:underline-offset-4">{l.courseName}</span>
                        <span className={cn('shrink-0 text-[13px] tabular', l.behind ? 'text-accent' : 'text-green')}>
                          {l.behind ? `${l.behind} מאחור` : 'מעודכן'}
                        </span>
                      </span>
                      <Progress value={l.total ? l.watched / l.total : 0} color={l.color} label={`${l.courseName}: ${l.watched} מתוך ${l.total} הרצאות נצפו`} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-3">עוד לא זוהו הקלטות.</p>
            )}
          </Section>

          <Section
            i={5}
            title="מה חדש"
            action={
              <Link to="/updates" className="text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                הכול
              </Link>
            }
          >
            {d.recentChanges.length ? (
              <ul>
                {d.recentChanges.slice(0, 5).map((c) => (
                  <ChangeItem key={c.id} change={c} />
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-3">כאן יופיעו מטלות חדשות, שינויי תאריכים, הקלטות והודעות.</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
