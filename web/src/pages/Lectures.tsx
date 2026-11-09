import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LectureRow } from '../components/LectureRow';
import { cn, CourseMark, Empty, GroupLabel, PageHeader, PageLoader, Progress, Section, Tabs } from '../components/ui';
import { get } from '../lib/api';
import { dayOfMonth, formatMinutes, formatWeekday } from '../lib/format';
import { useLectures } from '../lib/queries';
import { usePref } from '../lib/storage';
import type { Lecture, PlanDay } from '../lib/types';

type Show = 'pending' | 'all' | 'notes';
const SHOWS = ['pending', 'all', 'notes'] as const;

export function LecturesPage() {
  const q = useLectures();
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => get<{ days: PlanDay[]; unscheduledMin: number; dailyMin: number }>('/api/lectures/plan?days=7') });
  const [params, setParams] = useSearchParams();
  const [show, setShow] = usePref<Show>('lectures.show', 'pending', SHOWS);
  const courseId = params.get('course') ? Number(params.get('course')) : null;
  const setCourse = (id: number | null) => {
    if (id) params.set('course', String(id));
    else params.delete('course');
    setParams(params, { replace: true });
  };

  const lectures = useMemo(() => {
    let list = q.data?.lectures ?? [];
    if (courseId) list = list.filter((l) => l.courseId === courseId);
    if (show === 'pending') list = list.filter((l) => l.status !== 'watched' && !l.ignored);
    if (show === 'notes') list = list.filter((l) => l.notesMd.trim());
    return list;
  }, [q.data, courseId, show]);

  // Course → week → lectures
  const grouped = useMemo(() => {
    const byCourse = new Map<number, { name: string; color: string; sections: Map<string, Lecture[]> }>();
    for (const l of lectures) {
      let c = byCourse.get(l.courseId);
      if (!c) byCourse.set(l.courseId, (c = { name: l.courseName, color: l.courseColor, sections: new Map() }));
      const key = l.sectionName || 'כללי';
      c.sections.set(key, [...(c.sections.get(key) ?? []), l]);
    }
    return [...byCourse.entries()];
  }, [lectures]);

  if (q.isLoading || !q.data) return <PageLoader />;
  const lag = q.data.lag;
  const behind = lag.reduce((s, l) => s + l.behind, 0);
  const behindMin = lag.reduce((s, l) => s + l.behindMin, 0);
  const courseName = courseId ? lag.find((l) => l.courseId === courseId)?.courseName : null;

  return (
    <div>
      <PageHeader
        eyebrow={behind ? `${behind} מחכות · בערך ${formatMinutes(behindMin)}` : 'אתה מעודכן בכל הקורסים'}
        title="הרצאות"
        subtitle="כל ההקלטות מכל הקורסים: מה כבר ראית, איפה עצרת, ומה מחכה."
      />

      {/* Per-course progress as a small table */}
      {lag.length ? (
        <div className="rise mb-10" style={{ '--i': 1 } as CSSProperties}>
          <table className="w-full border-collapse text-[14.5px]">
            <caption className="sr-only">התקדמות בצפייה לפי קורס. בחירת קורס מסננת את הרשימה.</caption>
            <thead>
              <tr className="border-b-2 border-ink text-start text-[12.5px] text-ink-3">
                <th scope="col" className="py-2 text-start font-medium">
                  קורס
                </th>
                <th scope="col" className="hidden w-[30%] py-2 text-start font-medium sm:table-cell">
                  התקדמות
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  נצפו
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  מחכות
                </th>
              </tr>
            </thead>
            <tbody>
              {lag.map((l) => {
                const selected = courseId === l.courseId;
                return (
                  <tr key={l.courseId} className={cn('border-b border-rule', selected && 'bg-sunken/70')}>
                    <th scope="row" className="py-0 text-start font-normal">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setCourse(selected ? null : l.courseId)}
                        className="flex min-h-12 w-full items-center gap-2.5 text-start hover:underline hover:underline-offset-4"
                      >
                        <CourseMark color={l.color} />
                        <span className={cn(selected && 'font-semibold')}>{l.courseName}</span>
                      </button>
                    </th>
                    <td className="hidden py-3 pe-6 sm:table-cell">
                      <Progress value={l.total ? l.watched / l.total : 0} color={l.color} label={`${l.courseName}: התקדמות`} />
                    </td>
                    <td className="py-3 text-end text-ink-2 tabular">
                      {l.watched}/{l.total}
                    </td>
                    <td className={cn('py-3 text-end tabular', l.behind ? 'font-semibold text-accent' : 'text-green')}>{l.behind || (
                        <>
                          <span aria-hidden>✓</span>
                          <span className="sr-only">אין</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Tabs<Show>
              label="מה להציג"
              value={show}
              onChange={setShow}
              className="flex-1"
              options={[
                { value: 'pending', label: 'מחכות לצפייה' },
                { value: 'all', label: 'הכול' },
                { value: 'notes', label: 'עם הערות' },
              ]}
            />
            {courseName ? (
              <button
                type="button"
                onClick={() => setCourse(null)}
                className="mb-1.5 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink bg-ink px-3 text-[13.5px] text-paper"
                aria-label={`הסר סינון: ${courseName}`}
              >
                {courseName}
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          {!grouped.length ? (
            <Empty title={show === 'pending' ? 'ראית את כל ההקלטות' : 'אין הרצאות להצגה'} className="border-b border-rule">
              {show === 'pending'
                ? 'אין כרגע הקלטות שמחכות לך.'
                : 'הקלטות שמתפרסמות במודל יופיעו כאן לבד. אם משהו לא זוהה, אפשר לסמן אותו כהקלטה בעמוד הקורס.'}
            </Empty>
          ) : (
            <div className="space-y-10">
              {grouped.map(([cid, c], i) => (
                <section key={cid} aria-labelledby={`course-${cid}`} className="rise" style={{ '--i': i + 2 } as CSSProperties}>
                  <h2 id={`course-${cid}`} className="display mb-1 flex items-center gap-2.5 text-[21px]">
                    <CourseMark color={c.color} className="h-5 w-1" />
                    <Link to={`/courses/${cid}`} className="hover:underline hover:underline-offset-4">
                      {c.name}
                    </Link>
                  </h2>
                  {[...c.sections.entries()].map(([section, list]) => (
                    <div key={section}>
                      <GroupLabel level={3} count={list.length}>
                        {section}
                      </GroupLabel>
                      <ul aria-label={`${c.name}, ${section}`}>
                        {list.map((l) => (
                          <LectureRow key={l.moduleId} lecture={l} today={q.data!.today} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:col-span-4" aria-label="תוכנית השלמה">
          <div className="lg:sticky lg:top-8">
            <Section
              i={2}
              title="תוכנית השלמה"
              meta={plan.data ? `עד ${formatMinutes(plan.data.dailyMin)} ביום` : undefined}
              action={
                <Link to="/settings#study" className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                  שינוי
                </Link>
              }
            >
              {plan.data?.days.some((d) => d.items.length) ? (
                <ol className="space-y-4">
                  {plan.data.days
                    .filter((d) => d.items.length)
                    .map((d) => (
                      <li key={d.date} className="flex gap-4">
                        <div className="w-11 shrink-0 text-center">
                          <span className="display block text-[26px] leading-none tabular">{dayOfMonth(d.date)}</span>
                          <span className="block text-[12px] text-ink-3">{formatWeekday(d.date).replace('יום ', '')}</span>
                        </div>
                        <ul className="min-w-0 flex-1 border-s border-rule ps-4">
                          {d.items.map((i) => {
                            const c = lag.find((l) => l.courseId === i.courseId);
                            return (
                              <li key={`${i.moduleId}-${i.part}`} className="flex items-baseline gap-2 py-1 text-[14px]">
                                {c ? <CourseMark color={c.color} className="h-3 translate-y-0.5" /> : null}
                                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                                <span className="shrink-0 text-[12.5px] text-ink-3 tabular">
                                  {i.minutes}′{i.parts > 1 ? ` · ${i.part}/${i.parts}` : ''}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-[14px] text-ink-3">אין הרצאות להשלים.</p>
              )}
              {plan.data?.unscheduledMin ? (
                <p className="mt-4 border-t border-rule pt-3 text-[13.5px] text-accent">
                  עוד {formatMinutes(plan.data.unscheduledMin)} לא נכנסו לשבוע הזה. אפשר להגדיל את הזמן היומי בהגדרות.
                </p>
              ) : null}
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}
