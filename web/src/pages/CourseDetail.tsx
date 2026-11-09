import DOMPurify from 'dompurify';
import { ChevronDown, Download, ExternalLink } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { LectureRow } from '../components/LectureRow';
import { TaskList } from '../components/TaskRow';
import { buttonClass, cn, CourseMark, Empty, GroupLabel, PageHeader, PageLoader, Tabs, Tag } from '../components/ui';
import { patch } from '../lib/api';
import { formatDateTime, formatSize, todayKey } from '../lib/format';
import { KIND } from '../lib/labels';
import { useAction, useCourse } from '../lib/queries';
import type { ModuleKind, ModuleView } from '../lib/types';

type Tab = 'content' | 'tasks' | 'lectures' | 'announcements';

export function CourseDetailPage() {
  const id = Number(useParams().id);
  const q = useCourse(id);
  const [tab, setTab] = useState<Tab>('content');
  if (q.isLoading || !q.data) return <PageLoader />;
  const { course, sections, tasks, lectures, announcements } = q.data;
  const today = todayKey();
  const openTasks = tasks.filter((t) => !['done', 'expired'].includes(t.urgency.bucket)).length;

  return (
    <div>
      <nav aria-label="פירורי לחם" className="mb-2 text-[13.5px] text-ink-2">
        <Link to="/courses" className="underline-offset-4 hover:text-ink hover:underline">
          קורסים
        </Link>
        <span aria-hidden> / </span>
      </nav>
      <PageHeader
        eyebrow={
          <span dir="ltr" className="inline-block">
            {course.shortName}
          </span>
        }
        title={
          <span className="flex items-center gap-3">
            <CourseMark color={course.color} className="h-8 w-1.5" />
            {course.fullName}
          </span>
        }
        actions={
          <>
            <a href={`/api/files/zip?courseId=${course.id}`} className={buttonClass('secondary', 'sm')}>
              <Download className="size-4" aria-hidden />
              כל הקבצים (ZIP)
            </a>
            {course.url ? (
              <a href={course.url} target="_blank" rel="noreferrer" className={buttonClass('primary', 'sm')}>
                <ExternalLink className="size-4" aria-hidden />
                פתח ב-Moodle
              </a>
            ) : null}
          </>
        }
      />
      {!course.active ? (
        <p className="mb-6 border-y border-rule py-3 text-[14px] text-ink-2">
          הקורס לא במעקב, ולכן לא מסתנכרן.{' '}
          <Link to="/settings#courses" className="text-ink underline underline-offset-4">
            להפעלה בהגדרות
          </Link>
        </p>
      ) : null}

      <Tabs<Tab>
        label="חלקי הקורס"
        value={tab}
        onChange={setTab}
        className="rise mb-6"
        options={[
          { value: 'content', label: 'תוכן' },
          { value: 'tasks', label: `משימות · ${openTasks}` },
          { value: 'lectures', label: `הרצאות · ${lectures.length}` },
          { value: 'announcements', label: `הודעות · ${announcements.length}` },
        ]}
      />

      <div className="rise" style={{ '--i': 1 } as CSSProperties}>
        {tab === 'content' ? (
          sections.some((s) => s.modules.length) ? (
            <div>
              {sections
                .filter((s) => s.modules.length)
                .map((s) => (
                  <section key={s.id} aria-label={s.name || 'כללי'}>
                    <GroupLabel count={s.modules.length}>{s.name || (s.number === 0 ? 'כללי' : `יחידה ${s.number}`)}</GroupLabel>
                    <ul>
                      {s.modules.map((m) => (
                        <ModuleRow key={m.id} m={m} />
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          ) : (
            <Empty title="אין תוכן" className="border-y border-rule">
              עוד לא סונכרן תוכן לקורס הזה.
            </Empty>
          )
        ) : null}

        {tab === 'tasks' ? tasks.length ? <TaskList tasks={tasks} showCourse={false} label="משימות בקורס" /> : <Empty title="אין משימות בקורס" /> : null}

        {tab === 'lectures' ? (
          lectures.length ? (
            <ul aria-label="הרצאות בקורס">
              {lectures.map((l) => (
                <LectureRow key={l.moduleId} lecture={l} today={today} />
              ))}
            </ul>
          ) : (
            <Empty title="לא זוהו הקלטות">אם הקלטה לא זוהתה, אפשר לסמן אותה כ"הקלטה" בלשונית "תוכן".</Empty>
          )
        ) : null}

        {tab === 'announcements' ? (
          announcements.length ? (
            <ul>
              {announcements.map((a) => (
                <li key={a.id} className="border-b border-rule py-5 last:border-b-0">
                  <article>
                    <h2 className="display flex flex-wrap items-baseline gap-2 text-[19px]">
                      {a.subject}
                      {!a.read ? <Tag tone="amber">חדש</Tag> : null}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      {a.author} · {formatDateTime(a.postedAt)}
                    </p>
                    <div className="prose-he mt-3 max-w-prose text-[15px]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.message) }} />
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="אין הודעות" />
          )
        ) : null}
      </div>
    </div>
  );
}

function ModuleRow({ m }: { m: ModuleView }) {
  const selectId = useId();
  const setKind = useAction((kindOverride: ModuleKind | null) => patch(`/api/modules/${m.id}`, { kindOverride }), { success: 'הסיווג עודכן' });
  const href = m.externalUrl ?? m.url ?? undefined;
  const showFiles = m.files.length > 1 || (m.files.length === 1 && m.kind !== 'recording');
  return (
    <li className="border-b border-rule py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* The kind reads as plain text; a transparent native select on top lets you correct it. */}
        <div className="relative -my-1.5 flex h-11 w-16 shrink-0 items-center rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--c-focus)] md:h-8">
          <span aria-hidden className={cn('flex items-center gap-0.5 text-[12.5px]', m.kindOverride ? 'font-medium text-ink' : 'text-ink-3')}>
            {KIND[m.kind]}
            <ChevronDown className="size-3 opacity-70" />
          </span>
          <label htmlFor={selectId} className="sr-only">
            סוג הפריט {m.name}
          </label>
          <select
            id={selectId}
            value={m.kindOverride ?? ''}
            onChange={(e) => setKind.run((e.target.value || null) as ModuleKind | null)}
            title="אפשר לתקן את הסוג אם הוא שגוי"
            className="absolute inset-0 cursor-pointer opacity-0 focus-visible:outline-none"
          >
            <option value="">{KIND[m.autoKind]} (אוטומטי)</option>
            {(['recording', 'slides', 'file', 'link', 'other'] as ModuleKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k]}
              </option>
            ))}
          </select>
        </div>
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[15px] underline-offset-4 hover:underline">
          {m.name}
        </a>
        {m.isNew ? <Tag tone="blue">חדש</Tag> : null}
      </div>
      {showFiles ? (
        <ul className="mt-1.5 space-y-1 ps-[76px]">
          {m.files.map((f) => (
            <li key={f.id}>
              <a href={`/api/files/${f.id}/download`} className="inline-flex min-h-8 items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink">
                <Download className="size-3.5" aria-hidden />
                <bdi>{f.filename}</bdi>
                <span dir="ltr" className="text-ink-3">{formatSize(f.fileSize)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
