import { clsx } from 'clsx';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Check, ChevronDown, CirclePlay, ExternalLink, EyeOff, Presentation, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { patch, post } from '../lib/api';
import { formatDayKey, formatMinutes } from '../lib/format';
import { useAction } from '../lib/queries';
import type { Lecture } from '../lib/types';
import { Badge, Button, CourseTag, Input, Progress, Segmented, Textarea } from './ui';

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false, breaks: true }) as string);
}

function LectureStatusButton({ lecture, onClick }: { lecture: Lecture; onClick: () => void }) {
  const pct = lecture.effectiveDurationMin ? Math.min(1, lecture.positionMin / lecture.effectiveDurationMin) : 0;
  const watched = lecture.status === 'watched';
  return (
    <button
      onClick={onClick}
      aria-label={watched ? 'סמן כלא נצפה' : 'סמן כנצפה'}
      title={watched ? 'נצפה' : lecture.status === 'in_progress' ? 'בצפייה' : 'לא נצפה'}
      className={clsx(
        'relative flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
        watched ? 'bg-ok text-white' : 'text-faint hover:text-ink',
      )}
    >
      {watched ? (
        <Check className="size-4" strokeWidth={3} />
      ) : (
        <svg viewBox="0 0 28 28" className="size-7 -rotate-90">
          <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
          {lecture.status === 'in_progress' ? (
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="2.5"
              strokeDasharray={`${Math.max(0.08, pct) * 69.1} 69.1`}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      )}
    </button>
  );
}

export function LectureRow({ lecture, showCourse = false, today }: { lecture: Lecture; showCourse?: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const update = useAction((body: Record<string, unknown>) => patch(`/api/lectures/${lecture.moduleId}`, body));
  const opened = useAction(() => post(`/api/lectures/${lecture.moduleId}/open`));
  const watched = lecture.status === 'watched';
  const upcoming = lecture.lectureDate && lecture.lectureDate > today;
  const slidesHref = lecture.slides ? (lecture.slides.fileId ? `/api/files/${lecture.slides.fileId}/download?inline=1` : lecture.slides.url) : null;

  return (
    <div className={clsx('rounded-xl transition-colors', open ? 'bg-sunken' : 'hover:bg-sunken', lecture.ignored && 'opacity-50')}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <LectureStatusButton lecture={lecture} onClick={() => update.run({ status: watched ? 'unwatched' : 'watched' })} />
        <button className="min-w-0 flex-1 text-start" onClick={() => setOpen((x) => !x)}>
          <div className={clsx('flex items-center gap-2 text-[14.5px] font-medium leading-snug', watched && 'text-muted')}>
            <span className="truncate">{lecture.title}</span>
            {lecture.type === 'tirgul' ? <Badge tone="slate">תרגול</Badge> : null}
            {lecture.notesMd ? <StickyNote className="size-3.5 shrink-0 text-accent" aria-label="יש הערות" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {showCourse ? <CourseTag name={lecture.courseName} color={lecture.courseColor} className="max-w-44" /> : null}
            {lecture.lectureDate ? <span className="tabular">{formatDayKey(lecture.lectureDate)}</span> : null}
            {upcoming ? <Badge tone="brand">עתידית</Badge> : null}
            {lecture.status === 'in_progress' ? (
              <span className="tabular">
                עצרת בדקה {lecture.positionMin} · נשארו {formatMinutes(lecture.remainingMin)}
              </span>
            ) : !watched ? (
              <span className="tabular">{formatMinutes(lecture.effectiveDurationMin)}</span>
            ) : null}
            {lecture.completedInMoodle && !watched ? <span>נפתח ב-Moodle</span> : null}
          </div>
          {lecture.status === 'in_progress' ? <Progress value={lecture.positionMin / lecture.effectiveDurationMin} className="mt-1.5 max-w-60" /> : null}
        </button>
        {slidesHref ? (
          <a href={slidesHref} target="_blank" rel="noreferrer" title={lecture.slides!.name} className="hidden size-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink sm:inline-flex">
            <Presentation className="size-[18px]" />
          </a>
        ) : null}
        {lecture.openUrl ? (
          <a
            href={lecture.openUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => opened.run()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-soft px-3 text-[13px] font-medium text-brand hover:opacity-90"
          >
            <CirclePlay className="size-4" />
            <span className="max-sm:hidden">{lecture.status === 'in_progress' ? 'המשך' : 'צפה'}</span>
          </a>
        ) : null}
        <button onClick={() => setOpen((x) => !x)} aria-label="פרטים" className="text-faint hover:text-ink">
          <ChevronDown className={clsx('size-5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open ? <LectureDetails lecture={lecture} slidesHref={slidesHref} /> : null}
    </div>
  );
}

function LectureDetails({ lecture, slidesHref }: { lecture: Lecture; slidesHref: string | null }) {
  const update = useAction((body: Record<string, unknown>) => patch(`/api/lectures/${lecture.moduleId}`, body));
  const saveNotes = useAction((notesMd: string) => patch(`/api/lectures/${lecture.moduleId}`, { notesMd }), { success: 'ההערות נשמרו' });
  const [position, setPosition] = useState(String(lecture.positionMin || ''));
  const [duration, setDuration] = useState(String(lecture.durationMin ?? ''));
  const [notes, setNotes] = useState(lecture.notesMd);
  const [mode, setMode] = useState<'edit' | 'view'>(lecture.notesMd ? 'view' : 'edit');
  useEffect(() => {
    setNotes(lecture.notesMd);
  }, [lecture.notesMd]);

  return (
    <div className="space-y-4 border-t border-line px-3 pt-3 pb-4 sm:ps-13">
      <form
        className="flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          update.run({
            positionMin: Number(position) || 0,
            ...(duration ? { durationMin: Number(duration) } : {}),
          });
        }}
      >
        <span>עצרתי בדקה</span>
        <Input type="number" min={0} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} className="!h-8 w-20 text-center" />
        <span>מתוך</span>
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={duration}
          placeholder={String(lecture.effectiveDurationMin)}
          onChange={(e) => setDuration(e.target.value)}
          className="!h-8 w-20 text-center"
        />
        <span>דקות</span>
        <Button size="sm" variant="primary" loading={update.pending}>
          שמור
        </Button>
      </form>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-muted">הערות וסיכום</span>
          <div className="flex-1" />
          {notes ? (
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'view', label: 'תצוגה' },
                { value: 'edit', label: 'עריכה' },
              ]}
            />
          ) : null}
        </div>
        {mode === 'view' && notes ? (
          <div className="prose-he rounded-xl border border-line bg-surface p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }} />
        ) : (
          <>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'מה למדנו? שאלות פתוחות?\nאפשר להשתמש ב-Markdown: # כותרת, - רשימה, **מודגש**'}
              className="min-h-32 font-normal"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={notes === lecture.notesMd}
                loading={saveNotes.pending}
                onClick={() => {
                  saveNotes.run(notes);
                  if (notes) setMode('view');
                }}
              >
                שמור הערות
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {lecture.url ? (
          <a href={lecture.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-[13px]">
            <ExternalLink className="size-3.5" />
            ב-Moodle
          </a>
        ) : null}
        {slidesHref ? (
          <a href={slidesHref} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-[13px]">
            <Presentation className="size-3.5" />
            {lecture.slides!.name}
          </a>
        ) : null}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => update.run({ ignored: !lecture.ignored })}>
          <EyeOff className="size-3.5" />
          {lecture.ignored ? 'החזר למעקב' : 'לא רלוונטי'}
        </Button>
      </div>
    </div>
  );
}
