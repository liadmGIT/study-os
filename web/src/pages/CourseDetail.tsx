import DOMPurify from 'dompurify';
import { Download, ExternalLink, FileText, Folder, Link2, ListChecks, Megaphone, MessagesSquare, Presentation, CirclePlay, Video, FileQuestion, PenLine, Shapes } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { LectureRow } from '../components/LectureRow';
import { TaskRow } from '../components/TaskRow';
import { Badge, Card, Empty, PageHeader, PageLoader, SectionTitle, Segmented, Select } from '../components/ui';
import { patch } from '../lib/api';
import { formatDateTime, formatSize, todayKey } from '../lib/format';
import { KIND } from '../lib/labels';
import { useAction, useCourse } from '../lib/queries';
import type { ModuleKind, ModuleView } from '../lib/types';

type Tab = 'content' | 'tasks' | 'lectures' | 'announcements';

const KIND_ICON: Partial<Record<ModuleKind, typeof FileText>> = {
  recording: CirclePlay,
  slides: Presentation,
  file: FileText,
  folder: Folder,
  assignment: PenLine,
  quiz: FileQuestion,
  forum: MessagesSquare,
  link: Link2,
  meeting: Video,
};

export function CourseDetailPage() {
  const id = Number(useParams().id);
  const q = useCourse(id);
  const [tab, setTab] = useState<Tab>('content');
  if (q.isLoading || !q.data) return <PageLoader />;
  const { course, sections, tasks, lectures, announcements } = q.data;
  const today = todayKey();

  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        <Link to="/courses" className="hover:underline">
          קורסים
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="size-3 rounded-full" style={{ background: course.color }} />
            {course.fullName}
          </span>
        }
        subtitle={<span dir="ltr">{course.shortName}</span>}
        actions={
          <>
            <a href={`/api/files/zip?courseId=${course.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-[13px] font-medium">
              <Download className="size-4" />
              כל הקבצים (ZIP)
            </a>
            {course.url ? (
              <a href={course.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-brand px-2.5 text-[13px] font-medium text-canvas">
                <ExternalLink className="size-4" />
                ב-Moodle
              </a>
            ) : null}
          </>
        }
      />
      {!course.active ? (
        <Card className="mb-4 p-3 text-sm text-muted">
          הקורס הזה לא במעקב, ולכן לא מסתנכרן. אפשר להפעיל אותו ב<Link to="/settings" className="underline">הגדרות</Link>.
        </Card>
      ) : null}

      <div className="mb-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'content', label: 'תוכן הקורס' },
            { value: 'tasks', label: `משימות (${tasks.filter((t) => !['done', 'expired'].includes(t.urgency.bucket)).length})` },
            { value: 'lectures', label: `הרצאות (${lectures.length})` },
            { value: 'announcements', label: `הודעות (${announcements.length})` },
          ]}
        />
      </div>

      {tab === 'content' ? (
        <div className="space-y-4">
          {sections.filter((s) => s.modules.length).map((s) => (
            <Card key={s.id} className="p-2 sm:p-3">
              <SectionTitle count={s.modules.length}>
                <span className="px-1 text-sm text-ink">{s.name || (s.number === 0 ? 'כללי' : `יחידה ${s.number}`)}</span>
              </SectionTitle>
              {s.modules.map((m) => (
                <ModuleRow key={m.id} m={m} />
              ))}
            </Card>
          ))}
          {!sections.some((s) => s.modules.length) ? (
            <Card>
              <Empty icon={<Shapes className="size-8" />} title="אין תוכן">עוד לא סונכרן תוכן לקורס הזה.</Empty>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <Card className="p-2 sm:p-3">
          {tasks.length ? tasks.map((t) => <TaskRow key={t.id} task={t} showCourse={false} />) : <Empty icon={<ListChecks className="size-8" />} title="אין משימות בקורס" />}
        </Card>
      ) : null}

      {tab === 'lectures' ? (
        <Card className="p-2 sm:p-3">
          {lectures.length ? lectures.map((l) => <LectureRow key={l.moduleId} lecture={l} today={today} />) : <Empty icon={<CirclePlay className="size-8" />} title="לא זוהו הקלטות" />}
        </Card>
      ) : null}

      {tab === 'announcements' ? (
        <div className="space-y-3">
          {announcements.length ? (
            announcements.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{a.subject}</span>
                  {!a.read ? <Badge tone="amber">חדש</Badge> : null}
                </div>
                <div className="mb-2 text-xs text-muted">
                  {a.author} · {formatDateTime(a.postedAt)}
                </div>
                <div className="prose-he text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.message) }} />
              </Card>
            ))
          ) : (
            <Card>
              <Empty icon={<Megaphone className="size-8" />} title="אין הודעות" />
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModuleRow({ m }: { m: ModuleView }) {
  const setKind = useAction((kindOverride: ModuleKind | null) => patch(`/api/modules/${m.id}`, { kindOverride }), { success: 'הסיווג עודכן' });
  const Icon = KIND_ICON[m.kind] ?? Shapes;
  const href = m.externalUrl ?? m.url ?? undefined;
  return (
    <div className="rounded-xl px-2 py-2 hover:bg-sunken">
      <div className="flex items-center gap-3">
        <Icon className="size-[18px] shrink-0 text-muted" />
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">
          {m.name}
        </a>
        {m.isNew ? <Badge tone="brand">חדש</Badge> : null}
        <Select
          value={m.kindOverride ?? ''}
          onChange={(e) => setKind.run((e.target.value || null) as ModuleKind | null)}
          className="h-7 w-auto shrink-0 rounded-lg px-1.5 py-0 text-xs text-muted"
          aria-label="סיווג"
          title="אם הסיווג שגוי, אפשר לתקן כאן"
        >
          <option value="">{KIND[m.autoKind]} (אוטומטי)</option>
          {(['recording', 'slides', 'file', 'link', 'other'] as ModuleKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k]}
            </option>
          ))}
        </Select>
      </div>
      {m.files.length > 1 || (m.files.length === 1 && m.kind !== 'recording') ? (
        <ul className="mt-1 space-y-0.5 ps-8">
          {m.files.map((f) => (
            <li key={f.id}>
              <a href={`/api/files/${f.id}/download`} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
                <Download className="size-3" />
                {f.filename}
                <span className="text-faint">{formatSize(f.fileSize)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
