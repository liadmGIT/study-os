import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Check, ChevronDown, ExternalLink, EyeOff, Play, Presentation } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { patch, post } from '../lib/api';
import { formatDayKey, formatMinutes } from '../lib/format';
import { useAction } from '../lib/queries';
import type { Lecture } from '../lib/types';
import { Button, buttonClass, cn, CourseTag, Input, Segmented, Tag, Textarea } from './ui';

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false, breaks: true }) as string);
}

/** Ring that fills as you watch; a tick when done. Toggles watched / not watched. */
function WatchToggle({ lecture }: { lecture: Lecture }) {
  const update = useAction((body: Record<string, unknown>) => patch(`/api/lectures/${lecture.moduleId}`, body));
  const watched = lecture.status === 'watched';
  const pct = lecture.effectiveDurationMin ? Math.min(1, lecture.positionMin / lecture.effectiveDurationMin) : 0;
  const state = watched ? 'נצפתה' : lecture.status === 'in_progress' ? `בצפייה, ${Math.round(pct * 100)}%` : 'לא נצפתה';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={watched ? true : lecture.status === 'in_progress' ? 'mixed' : false}
      aria-label={`${lecture.title} – ${state}`}
      onClick={() => update.run({ status: watched ? 'unwatched' : 'watched' })}
      className="relative z-10 -my-2.5 -ms-2.5 flex size-11 shrink-0 items-center justify-center rounded-md md:-my-1.5 md:-ms-1.5 md:size-8"
    >
      {watched ? (
        <span className="flex size-[22px] items-center justify-center rounded-full bg-green text-paper">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className="size-[22px] -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--c-ink-3)" strokeWidth="1.5" />
          {lecture.status === 'in_progress' ? (
            <circle
              cx="12"
              cy="12"
              r="9.5"
              fill="none"
              stroke="var(--c-ink)"
              strokeWidth="2.5"
              strokeDasharray={`${Math.max(0.06, pct) * 59.7} 59.7`}
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
  const detailsId = useId();
  const opened = useAction(() => post(`/api/lectures/${lecture.moduleId}/open`));
  const watched = lecture.status === 'watched';
  const upcoming = !!lecture.lectureDate && lecture.lectureDate > today;
  const slidesHref = lecture.slides ? (lecture.slides.fileId ? `/api/files/${lecture.slides.fileId}/download?inline=1` : lecture.slides.url) : null;

  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="flex items-start gap-3 py-3">
        <WatchToggle lecture={lecture} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((x) => !x)}
            aria-expanded={open}
            aria-controls={detailsId}
            className={cn('flex w-full items-center gap-2 text-start text-[15.5px] leading-snug font-medium', (watched || lecture.ignored) && 'text-ink-3')}
          >
            <span className="min-w-0">{lecture.title}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            {showCourse ? <CourseTag name={lecture.courseName} color={lecture.courseColor} className="max-w-48" /> : null}
            {lecture.type === 'tirgul' ? <span>תרגול</span> : null}
            {lecture.lectureDate ? <span className="tabular">{formatDayKey(lecture.lectureDate)}</span> : null}
            {lecture.ignored ? <Tag>לא רלוונטי</Tag> : null}
            {upcoming ? <Tag tone="blue">עוד לא התקיימה</Tag> : null}
            {lecture.status === 'in_progress' ? (
              <span className="tabular">
                עצרת בדקה {lecture.positionMin} · נשארו {formatMinutes(lecture.remainingMin)}
              </span>
            ) : !watched ? (
              <span className="tabular">{formatMinutes(lecture.effectiveDurationMin)}</span>
            ) : null}
            {lecture.notesMd ? <span className="text-amber">יש הערות</span> : null}
            {lecture.completedInMoodle && !watched ? <span className="text-ink-3">נפתחה במודל</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {slidesHref ? (
            <a
              href={slidesHref}
              target="_blank"
              rel="noreferrer"
              aria-label={`מצגת: ${lecture.slides!.name}`}
              title={lecture.slides!.name}
              className="hidden size-9 items-center justify-center rounded-md text-ink-2 hover:bg-sunken hover:text-ink sm:inline-flex"
            >
              <Presentation className="size-[18px]" aria-hidden />
            </a>
          ) : null}
          {lecture.openUrl && !watched ? (
            <a
              href={lecture.openUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => opened.run()}
              aria-label={`${lecture.status === 'in_progress' ? 'המשך צפייה' : 'צפייה'}: ${lecture.title}`}
              className={buttonClass('secondary', 'sm')}
            >
              <Play className="size-3.5" aria-hidden />
              <span className="max-sm:hidden">{lecture.status === 'in_progress' ? 'המשך' : 'צפייה'}</span>
            </a>
          ) : null}
        </div>
      </div>
      <div id={detailsId} hidden={!open}>
        {open ? <LectureDetails lecture={lecture} slidesHref={slidesHref} /> : null}
      </div>
    </li>
  );
}

function LectureDetails({ lecture, slidesHref }: { lecture: Lecture; slidesHref: string | null }) {
  const id = useId();
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
    <div className="mb-4 ms-8 space-y-5 rounded-md bg-sunken/70 p-4 md:ms-9">
      <form
        className="flex flex-wrap items-center gap-2 text-[14.5px]"
        onSubmit={(e) => {
          e.preventDefault();
          update.run({ positionMin: Number(position) || 0, ...(duration ? { durationMin: Number(duration) } : {}) });
        }}
      >
        <label htmlFor={`${id}-pos`}>עצרתי בדקה</label>
        <Input id={`${id}-pos`} type="number" min={0} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} className="w-20 text-center" />
        <label htmlFor={`${id}-dur`}>מתוך</label>
        <Input
          id={`${id}-dur`}
          type="number"
          min={1}
          inputMode="numeric"
          value={duration}
          placeholder={String(lecture.effectiveDurationMin)}
          onChange={(e) => setDuration(e.target.value)}
          className="w-20 text-center"
        />
        <span>דקות</span>
        <Button size="sm" variant="primary" loading={update.pending}>
          שמירה
        </Button>
      </form>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor={`${id}-notes`} className="text-[13px] font-medium text-ink-2">
            הערות וסיכום
          </label>
          <div className="flex-1" />
          {notes ? (
            <Segmented
              label="תצוגת ההערות"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'view', label: 'קריאה' },
                { value: 'edit', label: 'עריכה' },
              ]}
            />
          ) : null}
        </div>
        {mode === 'view' && notes ? (
          <div className="prose-he rounded-md border border-rule bg-surface p-4 text-[14.5px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }} />
        ) : (
          <>
            <Textarea
              id={`${id}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'מה למדנו? מה לא ברור?\nאפשר Markdown: # כותרת, - רשימה, **הדגשה**'}
              className="min-h-36"
            />
            <div className="mt-2">
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
                שמירת ההערות
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        {lecture.url ? (
          <a href={lecture.url} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
            <ExternalLink className="size-3.5" aria-hidden />
            במודל
          </a>
        ) : null}
        {slidesHref ? (
          <a href={slidesHref} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
            <Presentation className="size-3.5" aria-hidden />
            {lecture.slides!.name}
          </a>
        ) : null}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => update.run({ ignored: !lecture.ignored })}>
          <EyeOff className="size-3.5" aria-hidden />
          {lecture.ignored ? 'להחזיר למעקב' : 'לא רלוונטי לי'}
        </Button>
      </div>
    </div>
  );
}
