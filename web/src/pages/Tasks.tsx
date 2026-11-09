import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { QuickAdd } from '../components/QuickAdd';
import { TaskList } from '../components/TaskRow';
import { cn, Empty, GroupLabel, Input, PageHeader, PageLoader, Select, Tabs } from '../components/ui';
import { BUCKETS } from '../lib/labels';
import { useCourses, useTasks } from '../lib/queries';
import { usePref } from '../lib/storage';
import type { Bucket, Task } from '../lib/types';

type View = 'open' | 'notstarted' | 'all';
const VIEWS = ['open', 'notstarted', 'all'] as const;
const OPEN_BUCKETS: Bucket[] = ['overdue', 'urgent', 'week', 'later', 'nodate'];
const CLOSED_BUCKETS: Bucket[] = ['done', 'expired'];

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [showHidden, setShowHidden] = useState(false);
  const tasks = useTasks(showHidden);
  const courses = useCourses();
  const [search, setSearch] = useState('');
  const [openClosed, setOpenClosed] = useState<Record<string, boolean>>({});
  const [savedView, setSavedView] = usePref<View>('tasks.view', 'open', VIEWS);
  const searchRef = useRef<HTMLInputElement>(null);
  const view: View = params.get('filter') === 'notstarted' ? 'notstarted' : savedView;
  const courseFilter = params.get('course') ? Number(params.get('course')) : null;

  // "/" from anywhere lands here with ?focus=search.
  useEffect(() => {
    if (params.get('focus') === 'search') {
      searchRef.current?.focus();
      params.delete('focus');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const setView = (v: View) => {
    setSavedView(v);
    if (params.has('filter')) {
      params.delete('filter');
      setParams(params, { replace: true });
    }
  };
  const setCourse = (id: string) => {
    if (id) params.set('course', id);
    else params.delete('course');
    setParams(params, { replace: true });
  };

  const filtered = useMemo(() => {
    let list = tasks.data ?? [];
    if (!showHidden) list = list.filter((t) => !t.hidden);
    if (courseFilter) list = list.filter((t) => t.courseId === courseFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s) || t.course?.name.toLowerCase().includes(s));
    }
    if (view === 'notstarted') list = list.filter((t) => t.notStarted);
    return list;
  }, [tasks.data, courseFilter, search, view, showHidden]);

  const groups = useMemo(() => {
    const g = new Map<Bucket, Task[]>();
    for (const t of filtered) g.set(t.urgency.bucket, [...(g.get(t.urgency.bucket) ?? []), t]);
    return g;
  }, [filtered]);

  const activeCourses = courses.data?.filter((c) => c.active) ?? [];
  const buckets = view === 'notstarted' ? OPEN_BUCKETS : [...OPEN_BUCKETS, ...CLOSED_BUCKETS];
  const openCount = (tasks.data ?? []).filter((t) => !t.hidden && OPEN_BUCKETS.includes(t.urgency.bucket)).length;

  return (
    <div>
      <PageHeader eyebrow={tasks.data ? `${openCount} פתוחות` : undefined} title="משימות" subtitle="כל המטלות מכל הקורסים, יחד עם המשימות שלך." />

      <div className="rise mb-6" style={{ '--i': 1 } as React.CSSProperties}>
        <QuickAdd defaultCourseId={courseFilter ?? undefined} />
      </div>

      <div className="rise mb-2 flex flex-col gap-3 md:flex-row md:items-end" style={{ '--i': 2 } as React.CSSProperties}>
        <Tabs<View>
          label="תצוגה"
          value={view}
          onChange={setView}
          className="md:flex-1"
          options={[
            { value: 'open', label: 'לפי דחיפות' },
            { value: 'notstarted', label: 'עוד לא התחלתי' },
            { value: 'all', label: 'הכול' },
          ]}
        />
        <div className="flex gap-2 md:pb-1.5">
          <div className="relative min-w-0 flex-1 md:w-56 md:flex-none">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש" aria-label="חיפוש משימות" className="ps-9" />
          </div>
          <Select value={courseFilter ?? ''} onChange={(e) => setCourse(e.target.value)} aria-label="סינון לפי קורס" className="w-auto max-w-[45vw] md:max-w-56">
            <option value="">כל הקורסים</option>
            {activeCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {tasks.isLoading ? (
        <PageLoader />
      ) : !filtered.length ? (
        <Empty title={view === 'notstarted' ? 'אין מטלות שמחכות שתתחיל' : search ? 'לא נמצאו משימות' : 'אין משימות כאן'} className="mt-6 border-y border-rule">
          {view === 'notstarted' ? 'כל מה שקרוב כבר בעבודה.' : search ? 'נסה מילה אחרת, או נקה את הסינון.' : 'משימות מ-Moodle מופיעות כאן אוטומטית אחרי הסנכרון.'}
        </Empty>
      ) : (
        <div className="rise mt-6" style={{ '--i': 3 } as React.CSSProperties}>
          {buckets.map((b) => {
            const list = groups.get(b);
            if (!list?.length) return null;
            const collapsible = CLOSED_BUCKETS.includes(b) && view !== 'all';
            const isOpen = !collapsible || openClosed[b];
            return (
              <section key={b} aria-label={BUCKETS[b].label}>
                <GroupLabel
                  color={BUCKETS[b].color}
                  count={list.length}
                  action={
                    collapsible ? (
                      <button
                        type="button"
                        onClick={() => setOpenClosed((x) => ({ ...x, [b]: !x[b] }))}
                        aria-expanded={isOpen}
                        className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-[13px] text-ink-2 hover:text-ink"
                      >
                        {isOpen ? 'הסתר' : 'הצג'}
                        <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                      </button>
                    ) : null
                  }
                >
                  {BUCKETS[b].label}
                </GroupLabel>
                {isOpen ? <TaskList tasks={list} showCourse={!courseFilter} label={BUCKETS[b].label} /> : null}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-center">
        <button type="button" onClick={() => setShowHidden((x) => !x)} className="min-h-11 text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {showHidden ? 'להסתיר שוב את המשימות שהסתרתי' : 'להציג גם משימות שהסתרתי'}
        </button>
      </div>
    </div>
  );
}
