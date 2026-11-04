import { CalendarDays, CirclePlay } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LectureRow } from '../components/LectureRow';
import { Card, CardHeader, Chip, CourseTag, Empty, PageHeader, PageLoader, Progress, SectionTitle, Segmented } from '../components/ui';
import { formatMinutes, formatWeekdayShort, formatDayKey } from '../lib/format';
import { useLectures } from '../lib/queries';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import type { Lecture, PlanDay } from '../lib/types';

type Show = 'pending' | 'all' | 'notes';

export function LecturesPage() {
  const q = useLectures();
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => get<{ days: PlanDay[]; unscheduledMin: number; dailyMin: number }>('/api/lectures/plan?days=7') });
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<Show>('pending');
  const courseId = params.get('course') ? Number(params.get('course')) : null;

  const lectures = useMemo(() => {
    let list = q.data?.lectures ?? [];
    if (courseId) list = list.filter((l) => l.courseId === courseId);
    if (show === 'pending') list = list.filter((l) => l.status !== 'watched' && !l.ignored);
    if (show === 'notes') list = list.filter((l) => l.notesMd.trim());
    return list;
  }, [q.data, courseId, show]);

  // Group by course, then by week/section.
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
  const nameOf = new Map(lag.map((l) => [l.courseId, l]));

  return (
    <div>
      <PageHeader title="מעקב הרצאות" subtitle="כל ההקלטות מכל הקורסים: מה ראית, איפה עצרת, ומה מחכה" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lag.map((l) => (
          <button
            key={l.courseId}
            onClick={() => {
              if (courseId === l.courseId) params.delete('course');
              else params.set('course', String(l.courseId));
              setParams(params, { replace: true });
            }}
            className={`rounded-2xl border bg-surface p-4 text-start transition-colors hover:bg-sunken ${courseId === l.courseId ? 'border-brand' : 'border-line'}`}
          >
            <CourseTag name={l.courseName} color={l.color} className="!text-sm !text-ink font-medium" />
            <div className="mt-3 flex items-end gap-2">
              <span className="text-2xl font-bold tabular leading-none">{l.behind}</span>
              <span className="pb-0.5 text-xs text-muted">{l.behind ? `מאחור · ${formatMinutes(l.behindMin)}` : 'אתה מעודכן'}</span>
            </div>
            <Progress value={l.total ? l.watched / l.total : 0} color={l.color} className="mt-3" />
            <div className="mt-1 text-[11px] text-faint tabular">
              {l.watched} מתוך {l.total} נצפו
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented<Show>
              value={show}
              onChange={setShow}
              options={[
                { value: 'pending', label: 'מחכות לצפייה' },
                { value: 'all', label: 'הכול' },
                { value: 'notes', label: 'עם הערות' },
              ]}
            />
            {courseId ? (
              <Chip active onClick={() => (params.delete('course'), setParams(params, { replace: true }))}>
                {nameOf.get(courseId)?.courseName ?? 'קורס'} ✕
              </Chip>
            ) : null}
          </div>
          {!grouped.length ? (
            <Card>
              <Empty icon={<CirclePlay className="size-8" />} title={show === 'pending' ? 'ראית הכול 🎉' : 'אין הרצאות להצגה'}>
                {show === 'pending' ? 'אין הקלטות שמחכות לך.' : 'הקלטות שמתפרסמות במודל יופיעו כאן אוטומטית. אם משהו לא זוהה, אפשר לסמן אותו כהקלטה בעמוד הקורס.'}
              </Empty>
            </Card>
          ) : (
            <div className="space-y-4">
              {grouped.map(([cid, c]) => (
                <Card key={cid} className="p-2 sm:p-3">
                  <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                    <Link to={`/courses/${cid}`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                  </div>
                  {[...c.sections.entries()].map(([section, list]) => (
                    <div key={section}>
                      <SectionTitle count={list.length}>
                        <span className="px-1">{section}</span>
                      </SectionTitle>
                      {list.map((l) => (
                        <LectureRow key={l.moduleId} lecture={l} today={q.data!.today} />
                      ))}
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card className="lg:sticky lg:top-6">
            <CardHeader
              title="תוכנית השלמה"
              subtitle={plan.data ? `עד ${formatMinutes(plan.data.dailyMin)} ביום · אפשר לשנות בהגדרות` : undefined}
              icon={<CalendarDays className="size-[18px]" />}
            />
            <div className="space-y-3 px-4 pb-4">
              {plan.data?.days.filter((d) => d.items.length).length ? (
                plan.data.days
                  .filter((d) => d.items.length)
                  .map((d) => (
                    <div key={d.date}>
                      <div className="mb-1 flex items-baseline gap-2 text-xs">
                        <span className="font-semibold">{formatWeekdayShort(d.date)}</span>
                        <span className="text-muted tabular">{formatDayKey(d.date)}</span>
                        <span className="flex-1" />
                        <span className="text-faint tabular">{formatMinutes(d.totalMin)}</span>
                      </div>
                      <ul className="space-y-1">
                        {d.items.map((i) => {
                          const c = nameOf.get(i.courseId);
                          return (
                            <li key={`${i.moduleId}-${i.part}`} className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 text-sm">
                              <span className="size-2 shrink-0 rounded-full" style={{ background: c?.color }} />
                              <span className="min-w-0 flex-1 truncate">{i.title}</span>
                              <span className="text-[11px] text-muted tabular">
                                {i.minutes}′{i.parts > 1 ? ` · ${i.part}/${i.parts}` : ''}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
              ) : (
                <p className="py-4 text-center text-sm text-muted">אין הרצאות להשלים. כל הכבוד!</p>
              )}
              {plan.data?.unscheduledMin ? (
                <p className="text-xs text-urgent">עוד {formatMinutes(plan.data.unscheduledMin)} לא נכנסו לשבוע הזה. שקול להגדיל את הזמן היומי.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
