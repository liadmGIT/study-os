import { clsx } from 'clsx';
import { ChevronDown, Inbox, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { QuickAdd } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { Card, Chip, Empty, Input, PageHeader, PageLoader, SectionTitle, Segmented } from '../components/ui';
import { BUCKETS } from '../lib/labels';
import { useCourses, useTasks } from '../lib/queries';
import type { Bucket, Task } from '../lib/types';

type View = 'open' | 'notstarted' | 'all';
const OPEN_BUCKETS: Bucket[] = ['overdue', 'urgent', 'week', 'later', 'nodate'];
const CLOSED_BUCKETS: Bucket[] = ['done', 'expired'];

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [showHidden, setShowHidden] = useState(false);
  const tasks = useTasks(showHidden);
  const courses = useCourses();
  const [search, setSearch] = useState('');
  const [openClosed, setOpenClosed] = useState<Record<string, boolean>>({});
  const view = (params.get('filter') === 'notstarted' ? 'notstarted' : params.get('view') ?? 'open') as View;
  const courseFilter = params.get('course') ? Number(params.get('course')) : null;

  const setParam = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
    if (key === 'view') params.delete('filter');
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
  const buckets = view === 'all' ? [...OPEN_BUCKETS, ...CLOSED_BUCKETS] : view === 'open' ? [...OPEN_BUCKETS, ...CLOSED_BUCKETS] : OPEN_BUCKETS;

  return (
    <div>
      <PageHeader title="משימות" subtitle="כל המטלות מכל הקורסים, יחד עם המשימות שלך" />
      <Card className="mb-4 p-3">
        <QuickAdd defaultCourseId={courseFilter ?? undefined} />
      </Card>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<View>
            value={view}
            onChange={(v) => setParam('view', v)}
            options={[
              { value: 'open', label: 'לפי דחיפות' },
              { value: 'notstarted', label: 'עוד לא התחלתי' },
              { value: 'all', label: 'הכול' },
            ]}
          />
          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש" className="ps-9" />
          </div>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <Chip active={!courseFilter} onClick={() => setParam('course', null)}>
            כל הקורסים
          </Chip>
          {activeCourses.map((c) => (
            <Chip key={c.id} active={courseFilter === c.id} onClick={() => setParam('course', String(c.id))}>
              <span className="size-2 rounded-full" style={{ background: c.color }} />
              {c.fullName}
            </Chip>
          ))}
        </div>
      </div>

      {tasks.isLoading ? (
        <PageLoader />
      ) : !filtered.length ? (
        <Card>
          <Empty icon={<Inbox className="size-8" />} title={view === 'notstarted' ? 'אין מטלות שמחכות שתתחיל 👏' : 'אין משימות כאן'}>
            {view === 'notstarted' ? 'כל מה שקרוב כבר בעבודה.' : 'משימות מ-Moodle מופיעות כאן אוטומטית אחרי הסנכרון.'}
          </Empty>
        </Card>
      ) : (
        <Card className="p-2 sm:p-3">
          {buckets.map((b) => {
            const list = groups.get(b);
            if (!list?.length) return null;
            const collapsible = CLOSED_BUCKETS.includes(b) && view !== 'all';
            const isOpen = !collapsible || openClosed[b];
            return (
              <section key={b} className="mb-2 last:mb-0">
                <SectionTitle
                  count={list.length}
                  action={
                    collapsible ? (
                      <button onClick={() => setOpenClosed((x) => ({ ...x, [b]: !x[b] }))} className="flex items-center gap-1 text-xs text-muted">
                        {isOpen ? 'הסתר' : 'הצג'}
                        <ChevronDown className={clsx('size-4 transition-transform', isOpen && 'rotate-180')} />
                      </button>
                    ) : null
                  }
                >
                  <span className="inline-flex items-center gap-2 px-1">
                    <span className="size-2 rounded-full" style={{ background: BUCKETS[b].color }} />
                    {BUCKETS[b].label}
                  </span>
                </SectionTitle>
                {isOpen ? list.map((t) => <TaskRow key={t.id} task={t} showCourse={!courseFilter} />) : null}
              </section>
            );
          })}
        </Card>
      )}

      <div className="mt-4 text-center">
        <button onClick={() => setShowHidden((x) => !x)} className="text-xs text-muted underline-offset-2 hover:underline">
          {showHidden ? 'הסתר משימות מוסתרות' : 'הצג גם משימות שהסתרתי'}
        </button>
      </div>
    </div>
  );
}
