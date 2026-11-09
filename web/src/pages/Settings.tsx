import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, LogOut, RotateCw, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useToast } from '../components/Toast';
import { Button, buttonClass, cn, CourseMark, Field, Input, PageHeader, PageLoader, Section, Segmented, Select, Tag, Toggle } from '../components/ui';
import { api, del, patch, post } from '../lib/api';
import { formatAgo, formatDateTime } from '../lib/format';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { useAction, useCourses, useMoodleStatus, useSettings, useSyncRuns } from '../lib/queries';
import { clearCache, useTheme, type Theme } from '../lib/storage';
import type { AppSettings, NotifyPrefs } from '../lib/types';

const NOTIFY_LABELS: { key: keyof NotifyPrefs; label: string; description?: string }[] = [
  { key: 'deadline', label: 'הגשה ב-24 השעות הקרובות' },
  { key: 'notStarted', label: 'מטלה שעוד לא התחלת', description: 'כשההגשה מתקרבת ועוד לא סימנת שום התקדמות.' },
  { key: 'dueChanged', label: 'תאריך הגשה השתנה' },
  { key: 'newTask', label: 'מטלה או בוחן חדשים' },
  { key: 'announcement', label: 'הודעה חדשה מהמרצה' },
  { key: 'recording', label: 'הקלטה חדשה' },
  { key: 'grade', label: 'ציון חדש' },
  { key: 'lectureLag', label: 'פיגור בהרצאות', description: 'פעם בשבוע, כשמצטברות הרצאות שלא ראית.' },
  { key: 'files', label: 'קבצים ומצגות חדשים' },
];

const TOC = [
  { id: 'moodle', label: 'חיבור ל-Moodle' },
  { id: 'courses', label: 'קורסים' },
  { id: 'notifications', label: 'התראות' },
  { id: 'study', label: 'תכנון לימוד' },
  { id: 'files', label: 'קבצים' },
  { id: 'calendar', label: 'יומן גוגל' },
  { id: 'backup', label: 'גיבוי' },
  { id: 'display', label: 'תצוגה' },
];

/** An anchor target for the table of contents. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 md:scroll-mt-8">
      {children}
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const save = useAction((body: Partial<AppSettings> | { notify: Partial<NotifyPrefs> }) => patch('/api/settings', body));

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [settings.isSuccess]);

  if (settings.isLoading || !settings.data) return <PageLoader />;
  const s = settings.data.settings;

  return (
    <div>
      <PageHeader title="הגדרות" />
      <div className="grid gap-x-12 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="תוכן העניינים" className="hidden lg:block">
          <ol className="sticky top-10 space-y-1 border-s border-rule ps-4 text-[14px]">
            {TOC.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="block py-1 text-ink-2 hover:text-ink">
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-2xl space-y-12">
          <Anchor id="moodle">
            <MoodleSection />
          </Anchor>
          <SyncSection />
          <Anchor id="courses">
            <CoursesSection />
          </Anchor>

          <Anchor id="notifications">
            <Section title="התראות">
              <PushDevice />
              <div className="mt-2 divide-y divide-rule">
                {NOTIFY_LABELS.map((n) => (
                  <Toggle key={n.key} label={n.label} description={n.description} checked={s.notify[n.key]} onChange={(v) => save.run({ notify: { [n.key]: v } })} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="שעות שקט, מ-">
                  <HourSelect value={s.quietHoursStart} onChange={(v) => save.run({ quietHoursStart: v })} />
                </Field>
                <Field label="עד">
                  <HourSelect value={s.quietHoursEnd} onChange={(v) => save.run({ quietHoursEnd: v })} />
                </Field>
              </div>
              <p className="mt-2 text-[13px] text-ink-3">בשעות השקט לא נשלחות התראות לטלפון. הן מחכות לבוקר.</p>
            </Section>
          </Anchor>

          <Anchor id="study">
            <Section title="תכנון לימוד">
              <div className="grid gap-5 sm:grid-cols-2">
                <NumberField label="זמן יומי להשלמת הרצאות (דקות)" value={s.dailyStudyMin} onSave={(v) => save.run({ dailyStudyMin: v })} />
                <NumberField label="אורך הרצאה כשלא ידוע (דקות)" value={s.defaultLectureMin} onSave={(v) => save.run({ defaultLectureMin: v })} />
                <NumberField
                  label="להזהיר על מטלה שלא התחלת, כמה ימים לפני"
                  value={s.notStartedDays}
                  onSave={(v) => save.run({ notStartedDays: v })}
                  hint="במטלות גדולות (לפי הערכת הזמן) האזהרה מגיעה מוקדם יותר."
                />
                <NumberField label="להזהיר על פיגור, מכמה הרצאות" value={s.lagThreshold} onSave={(v) => save.run({ lagThreshold: v })} />
              </div>
            </Section>
          </Anchor>

          <Anchor id="files">
            <Section title="הורדת קבצים">
              <div className="divide-y divide-rule">
                <Toggle label="להוריד קבצים חדשים אוטומטית" checked={s.downloadFiles} onChange={(v) => save.run({ downloadFiles: v })} />
                <Toggle label="להוריד גם קבצי וידאו" description="תופס הרבה מקום בשרת." checked={s.downloadVideos} onChange={(v) => save.run({ downloadVideos: v })} />
              </div>
              <NumberField label="גודל מקסימלי לקובץ (MB)" value={s.maxFileMb} onSave={(v) => save.run({ maxFileMb: v })} className="mt-3 max-w-xs" />
            </Section>
          </Anchor>

          <Anchor id="calendar">
            <CalendarSection icsUrl={settings.data.icsUrl} includePlan={s.icsIncludePlan} onIncludePlan={(v) => save.run({ icsIncludePlan: v })} />
          </Anchor>

          <Anchor id="backup">
            <BackupSection />
          </Anchor>

          <Anchor id="display">
            <DisplaySection />
          </Anchor>
        </div>
      </div>
    </div>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </Select>
  );
}

function NumberField({ label, value, onSave, hint, className }: { label: string; value: number; onSave: (v: number) => void; hint?: string; className?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => {
    setV(String(value));
  }, [value]);
  return (
    <Field label={label} hint={hint} className={className}>
      <Input type="number" inputMode="numeric" min={0} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== String(value) && v !== '' && onSave(Number(v))} />
    </Field>
  );
}

function MoodleSection() {
  const m = useMoodleStatus();
  const disconnect = useAction(() => del('/api/moodle'), { success: 'החיבור ל-Moodle נותק' });
  const d = m.data;
  return (
    <Section
      title="חיבור ל-Moodle"
      action={d?.connected ? d.tokenInvalid ? <Tag tone="accent">החיבור פג</Tag> : <Tag tone="green">מחובר</Tag> : <Tag>לא מחובר</Tag>}
    >
      {d?.connected ? (
        <div className="text-[14.5px]">
          <p>
            מחובר בתור <strong className="font-semibold">{d.fullName}</strong> <span className="text-ink-2">({d.username})</span>
          </p>
          <p className="text-[13.5px] text-ink-2">
            {d.siteName}
            {d.lastOkAt ? ` · תקשורת אחרונה ${formatAgo(d.lastOkAt)}` : ''}
          </p>
          {d.missingFunctions?.length ? (
            <p className="mt-3 border-s-2 border-amber ps-3 text-[13.5px] text-amber">
              ה-Moodle לא מאפשר חלק מהפעולות, ולכן חלק מהמידע לא יסונכרן: <span dir="ltr">{d.missingFunctions.join(', ')}</span>
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Link to="/connect" className={buttonClass('secondary', 'sm')}>
              התחברות מחדש
            </Link>
            <Button size="sm" variant="danger" onClick={() => confirm('לנתק את Moodle? הנתונים שכבר סונכרנו יישארו.') && disconnect.run()}>
              ניתוק
            </Button>
          </div>
        </div>
      ) : (
        <Link to="/connect" className={buttonClass('primary')}>
          חיבור ל-Moodle
        </Link>
      )}
    </Section>
  );
}

const RUN_LABEL = { ok: 'הצליח', partial: 'חלקי', error: 'נכשל', running: 'רץ' } as const;
const RUN_TONE = { ok: 'green', partial: 'amber', error: 'accent', running: 'blue' } as const;

function SyncSection() {
  const runs = useSyncRuns();
  const sync = useAction(() => post('/api/sync'), { success: 'הסנכרון התחיל' });
  return (
    <Section
      title="סנכרון"
      meta="כל 20 דקות ביום, ופעם בשעה בלילה"
      action={
        <Button size="sm" onClick={() => sync.run()} loading={sync.pending}>
          לסנכרן עכשיו
        </Button>
      }
    >
      {runs.data?.length ? (
        <ul className="text-[13.5px]">
          {runs.data.slice(0, 5).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-2 last:border-b-0">
              <Tag tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Tag>
              <span className="text-ink-2 tabular">{formatDateTime(r.startedAt)}</span>
              {r.stats.calls ? <span className="text-ink-3">{r.stats.calls} קריאות</span> : null}
              {r.error ? (
                <span className="w-full truncate text-[12.5px] text-ink-3" dir="ltr" title={r.error}>
                  {r.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-2">עוד לא היה סנכרון.</p>
      )}
    </Section>
  );
}

function CoursesSection() {
  const courses = useCourses();
  const update = useAction((id: number, body: Record<string, unknown>) => patch(`/api/courses/${id}`, body));
  if (!courses.data?.length) return null;
  return (
    <Section title="קורסים במעקב" meta="רק קורסים במעקב מסתנכרנים">
      <ul>
        {courses.data.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
            <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-sunken" title="צבע הקורס">
              <span className="sr-only">צבע עבור {c.fullName}</span>
              <CourseMark color={c.color} className="h-6 w-1.5" />
              <input type="color" value={c.color} onChange={(e) => update.run(c.id, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <div className={cn('min-w-0 flex-1', !c.active && 'text-ink-3')}>
              <div className="truncate text-[14.5px]">{c.fullName}</div>
              <div className="text-[12.5px] text-ink-3" dir="ltr" style={{ textAlign: 'right' }}>
                {c.shortName}
              </div>
            </div>
            <Input
              type="number"
              step={0.5}
              min={0}
              defaultValue={c.credits ?? ''}
              placeholder='נ"ז'
              onBlur={(e) => update.run(c.id, { credits: e.target.value ? Number(e.target.value) : null })}
              className="h-9 w-16 px-1 text-center text-[13px] md:h-9"
              aria-label={`נקודות זכות עבור ${c.fullName}`}
            />
            <button
              type="button"
              role="switch"
              aria-checked={c.active}
              aria-label={`מעקב אחרי ${c.fullName}`}
              onClick={() => update.run(c.id, { active: !c.active })}
              className={cn('relative h-6 w-10 shrink-0 rounded-full border transition-colors', c.active ? 'border-ink bg-ink' : 'border-rule-strong bg-sunken')}
            >
              <span aria-hidden className={cn('absolute top-[3px] size-4 rounded-full transition-all', c.active ? 'start-[19px] bg-paper' : 'start-[3px] bg-ink-3')} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PushDevice() {
  const toast = useToast();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s));
  }, []);
  const supported = pushSupported();
  const isIos = /iphone|ipad/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-sunken/70 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">התראות במכשיר הזה</p>
        <p className="text-[13.5px] text-ink-2">
          {!supported
            ? isIos && !standalone
              ? 'באייפון: "שיתוף" ← "הוסף למסך הבית", לפתוח משם, ואז להפעיל כאן.'
              : 'הדפדפן הזה לא תומך בהתראות.'
            : subscribed
              ? 'פעיל. ההתראות מגיעות גם כשהאתר סגור.'
              : 'כבוי'}
        </p>
      </div>
      {supported ? (
        subscribed ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => post('/api/push/test').then(() => toast('נשלחה התראת בדיקה')).catch((e) => toast(e.message, 'error'))}>
              שליחת בדיקה
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await disablePush().catch(() => {});
                setSubscribed(false);
                setBusy(false);
              }}
            >
              כיבוי
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await enablePush();
                setSubscribed(true);
                toast('ההתראות הופעלו');
              } catch (e) {
                toast(e instanceof Error ? e.message : 'שגיאה', 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            הפעלת התראות
          </Button>
        )
      ) : null}
    </div>
  );
}

function CalendarSection({ icsUrl, includePlan, onIncludePlan }: { icsUrl: string; includePlan: boolean; onIncludePlan: (v: boolean) => void }) {
  const toast = useToast();
  const id = useId();
  const rotate = useAction(() => post('/api/settings/ics/rotate'), { success: 'נוצרה כתובת חדשה. הכתובת הישנה הפסיקה לעבוד.' });
  return (
    <Section title="יומן גוגל" meta="כל ההגשות, ואם תרצה גם תוכנית ההשלמה">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        כתובת היומן הפרטית שלך
      </label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={icsUrl} dir="ltr" className="font-mono text-[12.5px]" onFocus={(e) => e.target.select()} />
        <Button onClick={() => navigator.clipboard.writeText(icsUrl).then(() => toast('הכתובת הועתקה'))}>
          <Copy className="size-4" aria-hidden />
          העתקה
        </Button>
      </div>
      <ol className="mt-4 list-decimal space-y-1.5 ps-5 text-[14px] text-ink-2">
        <li>
          פותחים את{' '}
          <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer" className="text-blue underline underline-offset-4">
            Google Calendar ← הוספת יומן ← מכתובת URL
          </a>
          .
        </li>
        <li>מדביקים את הכתובת ולוחצים "הוספת יומן".</li>
        <li>Google מרענן יומנים כאלה כל כמה שעות, כך ששינוי תאריך יכול להופיע שם באיחור. במערכת עצמה הוא מופיע מיד.</li>
      </ol>
      <div className="mt-2 border-t border-rule">
        <Toggle label="לכלול את תוכנית השלמת ההרצאות" checked={includePlan} onChange={onIncludePlan} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => confirm('ליצור כתובת חדשה? היומן הקיים יפסיק להתעדכן.') && rotate.run()}>
          <RotateCw className="size-3.5" aria-hidden />
          כתובת חדשה
        </Button>
        <p className="text-[13px] text-ink-3">מי שיש לו את הכתובת רואה את ההגשות שלך. אם היא דלפה, צור חדשה.</p>
      </div>
    </Section>
  );
}

interface RestoreResult {
  applied: Record<string, number>;
  skipped: Record<string, number>;
}

function BackupSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const restore = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const data = JSON.parse(await file.text());
      const r = await api<RestoreResult>('/api/backup/restore', { method: 'POST', body: data });
      setResult(r);
      qc.invalidateQueries();
      toast('הגיבוי שוחזר');
    } catch (e) {
      toast(e instanceof SyntaxError ? 'הקובץ הזה לא נראה כמו גיבוי של המערכת.' : e instanceof Error ? e.message : 'שגיאה', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Section title="גיבוי">
      <p className="max-w-prose text-[14.5px] text-ink-2">
        כמעט הכול נמשך מחדש מ-Moodle בכל סנכרון. מה שקיים רק כאן הוא מה שהוספת בעצמך: הערות להרצאות, איפה עצרת, משימות אישיות, תתי־משימות, עדיפויות והגדרות. כדאי לשמור
        גיבוי מדי פעם.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/backup" className={buttonClass('primary')} download>
          <Download className="size-4" aria-hidden />
          הורדת גיבוי
        </a>
        <Button onClick={() => fileRef.current?.click()} loading={busy}>
          <Upload className="size-4" aria-hidden />
          שחזור מקובץ
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) restore(f);
          }}
        />
      </div>
      <p className="mt-2 text-[13px] text-ink-3">בשרת חדש: מתחברים ל-Moodle, מחכים לסנכרון הראשון, ורק אז משחזרים.</p>
      {result ? (
        <p role="status" className="mt-3 text-[13.5px] text-ink-2">
          שוחזרו {result.applied.lectures ?? 0} הרצאות, {result.applied.tasks ?? 0} משימות מ-Moodle ו-{result.applied.personalTasks ?? 0} משימות אישיות.
          {Object.values(result.skipped).some(Boolean) ? ' חלק מהפריטים לא נמצאו (כנראה עוד לא סונכרנו) ודולגו.' : ''}
        </p>
      ) : null}
    </Section>
  );
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'לפי המכשיר' },
  { value: 'light', label: 'בהיר' },
  { value: 'dark', label: 'כהה' },
];

function DisplaySection() {
  const [theme, setTheme] = useTheme();
  const qc = useQueryClient();
  return (
    <Section title="תצוגה וחשבון">
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-ink-2">ערכת צבעים</p>
        <Segmented<Theme> label="ערכת צבעים" value={theme} onChange={setTheme} options={THEME_OPTIONS} />
      </div>
      <div className="mt-6 flex items-center gap-3 border-t border-rule pt-4">
        <p className="flex-1 text-[14px] text-ink-2">יציאה מהמערכת במכשיר הזה. הנתונים השמורים במכשיר יימחקו.</p>
        <Button
          variant="ghost"
          onClick={async () => {
            await post('/api/auth/logout').catch(() => {});
            clearCache();
            qc.setQueryData(['me'], { authed: false });
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
          }}
        >
          <LogOut className="size-4" aria-hidden />
          יציאה
        </Button>
      </div>
    </Section>
  );
}
