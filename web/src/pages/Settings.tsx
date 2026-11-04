import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarDays, Copy, FolderOpen, Link2, LogOut, RefreshCw, RotateCw, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, PageLoader, Select, Toggle } from '../components/ui';
import { useToast } from '../components/Toast';
import { del, patch, post } from '../lib/api';
import { formatAgo, formatDateTime } from '../lib/format';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { useAction, useCourses, useMoodleStatus, useSettings, useSyncRuns } from '../lib/queries';
import type { AppSettings, NotifyPrefs } from '../lib/types';

const NOTIFY_LABELS: { key: keyof NotifyPrefs; label: string; description?: string }[] = [
  { key: 'deadline', label: 'דדליין ב-24 השעות הקרובות' },
  { key: 'notStarted', label: 'מטלה שעוד לא התחלת', description: 'כשהדדליין מתקרב ולא סימנת התקדמות' },
  { key: 'dueChanged', label: 'תאריך הגשה השתנה' },
  { key: 'newTask', label: 'מטלה או בוחן חדשים' },
  { key: 'announcement', label: 'הודעה חדשה מהמרצה' },
  { key: 'recording', label: 'הקלטה חדשה' },
  { key: 'grade', label: 'ציון חדש' },
  { key: 'lectureLag', label: 'פיגור בהרצאות', description: 'פעם בשבוע, כשמצטברות הרצאות שלא ראית' },
  { key: 'files', label: 'קבצים ומצגות חדשים' },
];

export function SettingsPage() {
  const settings = useSettings();
  const moodle = useMoodleStatus();
  const save = useAction((body: Partial<AppSettings> | { notify: Partial<NotifyPrefs> }) => patch('/api/settings', body));

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, [settings.isSuccess]);

  if (settings.isLoading || !settings.data) return <PageLoader />;
  const s = settings.data.settings;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="הגדרות" />

      <MoodleCard />
      <SyncCard />
      <CoursesCard />

      <Card>
        <CardHeader title="התראות" icon={<BellRing className="size-[18px]" />} />
        <div className="px-4 pb-4">
          <PushDevice />
          <div className="mt-2 divide-y divide-line">
            {NOTIFY_LABELS.map((n) => (
              <Toggle key={n.key} label={n.label} description={n.description} checked={s.notify[n.key]} onChange={(v) => save.run({ notify: { [n.key]: v } })} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="שעות שקט – מ-">
              <HourSelect value={s.quietHoursStart} onChange={(v) => save.run({ quietHoursStart: v })} />
            </Field>
            <Field label="עד">
              <HourSelect value={s.quietHoursEnd} onChange={(v) => save.run({ quietHoursEnd: v })} />
            </Field>
          </div>
          <p className="mt-1 text-xs text-faint">בשעות השקט לא נשלחות התראות לטלפון. הן מחכות לבוקר.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="תכנון לימוד" icon={<Timer className="size-[18px]" />} />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
          <NumberField label="זמן יומי להשלמת הרצאות (דקות)" value={s.dailyStudyMin} onSave={(v) => save.run({ dailyStudyMin: v })} />
          <NumberField label="אורך הרצאה כשלא ידוע (דקות)" value={s.defaultLectureMin} onSave={(v) => save.run({ defaultLectureMin: v })} />
          <NumberField
            label="להזהיר על מטלה שלא התחלת – כמה ימים לפני"
            value={s.notStartedDays}
            onSave={(v) => save.run({ notStartedDays: v })}
            hint="למטלות גדולות (לפי הערכת הזמן) האזהרה מגיעה מוקדם יותר"
          />
          <NumberField label="להזהיר על פיגור – מכמה הרצאות" value={s.lagThreshold} onSave={(v) => save.run({ lagThreshold: v })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="הורדת קבצים" icon={<FolderOpen className="size-[18px]" />} />
        <div className="px-4 pb-4">
          <Toggle label="להוריד קבצים חדשים אוטומטית" checked={s.downloadFiles} onChange={(v) => save.run({ downloadFiles: v })} />
          <Toggle label="להוריד גם קבצי וידאו" description="תופס הרבה מקום בשרת" checked={s.downloadVideos} onChange={(v) => save.run({ downloadVideos: v })} />
          <NumberField label="גודל מקסימלי לקובץ (MB)" value={s.maxFileMb} onSave={(v) => save.run({ maxFileMb: v })} className="mt-2 max-w-xs" />
        </div>
      </Card>

      <CalendarCard icsUrl={settings.data.icsUrl} includePlan={s.icsIncludePlan} onIncludePlan={(v) => save.run({ icsIncludePlan: v })} />

      <LogoutCard />
      {moodle.data?.baseUrl ? (
        <p className="pb-4 text-center text-xs text-faint" dir="ltr">
          {moodle.data.baseUrl}
        </p>
      ) : null}
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

function MoodleCard() {
  const m = useMoodleStatus();
  const disconnect = useAction(() => del('/api/moodle'), { success: 'החיבור ל-Moodle נותק' });
  const d = m.data;
  return (
    <Card>
      <CardHeader
        title="חיבור ל-Moodle"
        icon={<Link2 className="size-[18px]" />}
        action={d?.connected ? d.tokenInvalid ? <Badge tone="red">החיבור פג</Badge> : <Badge tone="green">מחובר</Badge> : <Badge>לא מחובר</Badge>}
      />
      <div className="px-4 pb-4 text-sm">
        {d?.connected ? (
          <>
            <p>
              מחובר בתור <b>{d.fullName}</b> ({d.username}) · {d.siteName}
            </p>
            {d.lastOkAt ? <p className="text-xs text-muted">תקשורת אחרונה {formatAgo(d.lastOkAt)}</p> : null}
            {d.missingFunctions?.length ? (
              <p className="mt-2 rounded-xl bg-week/10 p-2.5 text-xs text-week">
                ה-Moodle לא מאפשר חלק מהפעולות, ולכן חלק מהמידע לא יסונכרן: <span dir="ltr">{d.missingFunctions.join(', ')}</span>
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Link to="/connect" className="inline-flex h-8 items-center rounded-xl border border-line bg-surface px-2.5 text-[13px] font-medium">
                התחבר מחדש
              </Link>
              <Button size="sm" variant="danger" onClick={() => confirm('לנתק את Moodle? הנתונים שכבר סונכרנו יישארו.') && disconnect.run()}>
                נתק
              </Button>
            </div>
          </>
        ) : (
          <Link to="/connect" className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-canvas">
            חיבור ל-Moodle
          </Link>
        )}
      </div>
    </Card>
  );
}

function SyncCard() {
  const runs = useSyncRuns();
  const sync = useAction(() => post('/api/sync'), { success: 'הסנכרון התחיל' });
  const last = runs.data?.[0];
  return (
    <Card>
      <CardHeader
        title="סנכרון"
        subtitle="אוטומטי כל 20 דקות ביום, ופעם בשעה בלילה"
        icon={<RefreshCw className="size-[18px]" />}
        action={
          <Button size="sm" onClick={() => sync.run()} loading={sync.pending}>
            סנכרן עכשיו
          </Button>
        }
      />
      <div className="px-4 pb-4">
        {last ? (
          <ul className="space-y-1 text-xs">
            {runs.data!.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={r.status === 'ok' ? 'green' : r.status === 'partial' ? 'amber' : r.status === 'running' ? 'brand' : 'red'}>
                  {{ ok: 'הצליח', partial: 'חלקי', error: 'נכשל', running: 'רץ' }[r.status]}
                </Badge>
                <span className="text-muted tabular">{formatDateTime(r.startedAt)}</span>
                {r.stats.calls ? <span className="text-faint">{r.stats.calls} קריאות</span> : null}
                {r.error ? (
                  <span className="w-full truncate text-faint" dir="ltr" title={r.error}>
                    {r.error}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">עוד לא היה סנכרון.</p>
        )}
      </div>
    </Card>
  );
}

function CoursesCard() {
  const courses = useCourses();
  const update = useAction((id: number, body: Record<string, unknown>) => patch(`/api/courses/${id}`, body));
  if (!courses.data?.length) return null;
  return (
    <Card>
      <CardHeader title="קורסים במעקב" subtitle="רק קורסים פעילים מסתנכרנים ומופיעים במשימות ובהרצאות" />
      <div className="divide-y divide-line px-4 pb-2">
        {courses.data.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <input
              type="color"
              value={c.color}
              onChange={(e) => update.run(c.id, { color: e.target.value })}
              className="size-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
              aria-label="צבע הקורס"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.fullName}</div>
              <div className="text-[11px] text-faint" dir="ltr">
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
              className="!h-8 w-16 text-center text-xs"
              aria-label="נקודות זכות"
            />
            <button
              role="switch"
              aria-checked={c.active}
              onClick={() => update.run(c.id, { active: !c.active })}
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${c.active ? 'bg-brand' : 'bg-line'}`}
              aria-label={c.active ? 'הפסק מעקב' : 'הפעל מעקב'}
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${c.active ? 'start-[18px]' : 'start-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
    </Card>
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
    <div className="rounded-2xl bg-sunken p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">התראות במכשיר הזה</div>
          <div className="text-xs text-muted">
            {!supported
              ? isIos && !standalone
                ? 'באייפון: לחץ על "שיתוף" ← "הוסף למסך הבית", פתח את האפליקציה משם, ואז הפעל כאן.'
                : 'הדפדפן הזה לא תומך בהתראות.'
              : subscribed
                ? 'פעיל. ההתראות יגיעו גם כשהאתר סגור.'
                : 'כבוי'}
          </div>
        </div>
        {supported ? (
          subscribed ? (
            <>
              <Button size="sm" onClick={() => post('/api/push/test').then(() => toast('נשלחה התראת בדיקה')).catch((e) => toast(e.message, 'error'))}>
                שלח בדיקה
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
                כבה
              </Button>
            </>
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
              הפעל התראות
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function CalendarCard({ icsUrl, includePlan, onIncludePlan }: { icsUrl: string; includePlan: boolean; onIncludePlan: (v: boolean) => void }) {
  const toast = useToast();
  const rotate = useAction(() => post('/api/settings/ics/rotate'), { success: 'נוצרה כתובת חדשה. הכתובת הישנה הפסיקה לעבוד.' });
  return (
    <Card id="calendar">
      <CardHeader title="Google Calendar" subtitle="כל הדדליינים (ותוכנית ההשלמה) ביומן שלך" icon={<CalendarDays className="size-[18px]" />} />
      <div className="space-y-3 px-4 pb-4 text-sm">
        <div className="flex gap-2">
          <Input readOnly value={icsUrl} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            onClick={() => {
              navigator.clipboard.writeText(icsUrl).then(() => toast('הכתובת הועתקה'));
            }}
          >
            <Copy className="size-4" />
            העתק
          </Button>
        </div>
        <ol className="list-decimal space-y-1 ps-5 text-muted">
          <li>
            פתח את{' '}
            <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer" className="text-brand underline">
              Google Calendar ← הוספת יומן ← מכתובת URL
            </a>
            .
          </li>
          <li>הדבק את הכתובת ולחץ "הוספת יומן".</li>
          <li>Google מרענן יומנים כאלה כל כמה שעות, כך ששינוי תאריך יכול להופיע שם באיחור קטן. במערכת עצמה הוא מופיע מיד.</li>
        </ol>
        <Toggle label="לכלול את תוכנית השלמת ההרצאות" checked={includePlan} onChange={onIncludePlan} />
        <Button size="sm" variant="ghost" onClick={() => confirm('ליצור כתובת חדשה? היומן הקיים יפסיק להתעדכן.') && rotate.run()}>
          <RotateCw className="size-3.5" />
          צור כתובת חדשה
        </Button>
        <p className="text-xs text-faint">הכתובת סודית: מי שיש לו אותה יכול לראות את הדדליינים שלך. אם היא דלפה, צור כתובת חדשה.</p>
      </div>
    </Card>
  );
}

function LogoutCard() {
  const qc = useQueryClient();
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex-1 text-sm text-muted">יציאה מהמערכת במכשיר הזה</span>
      <Button
        variant="ghost"
        onClick={async () => {
          await post('/api/auth/logout');
          qc.setQueryData(['me'], { authed: false });
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        }}
      >
        <LogOut className="size-4" />
        יציאה
      </Button>
    </Card>
  );
}
