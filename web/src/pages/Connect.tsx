import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Button, buttonClass, cn, Field, Input, PageHeader, Spinner, Tabs, Textarea } from '../components/ui';
import { get, post } from '../lib/api';
import { useMoodleStatus } from '../lib/queries';
import type { Ping } from '../lib/types';

type Method = 'password' | 'browser' | 'token';

export function ConnectPage() {
  const ping = useQuery({ queryKey: ['ping'], queryFn: () => get<Ping>('/api/moodle/ping'), staleTime: 60000 });
  const status = useMoodleStatus();
  const [method, setMethod] = useState<Method | null>(null);
  const effective: Method = method ?? (ping.data?.typeOfLogin && ping.data.typeOfLogin !== 1 ? 'browser' : 'password');

  return (
    <div className="max-w-xl">
      <PageHeader title="חיבור ל-Moodle" subtitle="מתחברים פעם אחת, ומשם המערכת מתעדכנת לבד כל 20 דקות." />

      {/* Can the server reach Moodle at all? */}
      <div role="status" className="rise mb-8 flex items-start gap-3 border-y border-rule py-3.5" style={{ '--i': 1 } as CSSProperties}>
        {ping.isLoading ? (
          <Spinner label="בודק" className="mt-0.5 size-4" />
        ) : (
          <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', ping.data?.reachable ? 'bg-green' : 'bg-accent')} />
        )}
        <div className="min-w-0 flex-1 text-[14.5px]">
          {ping.isLoading ? (
            'בודק אם השרת מגיע ל-Moodle…'
          ) : ping.data?.reachable ? (
            <>
              <p className="font-medium">השרת מגיע ל-Moodle</p>
              <p className="truncate text-[13px] text-ink-2">
                <bdi>{ping.data.siteName ?? ping.data.baseUrl}</bdi> ·{' '}
                <span className="tabular" dir="ltr">
                  {ping.data.ms}ms
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-accent">השרת לא מצליח להגיע ל-Moodle</p>
              <p className="text-[13.5px] text-ink-2">
                ייתכן שהאוניברסיטה חוסמת את כתובת השרת, או שחומת האש של השרת חוסמת יציאה. אפשר להריץ את המערכת על שרת אחר (ראה "צעד 2ב" ב-README).
              </p>
              {ping.data?.error ? (
                <p className="mt-1 truncate text-[12.5px] text-ink-3" dir="ltr">
                  {ping.data.error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {status.data?.connected && !status.data.tokenInvalid ? (
        <p className="mb-6 text-[14.5px]">
          <span className="text-green">מחובר</span> בתור <strong className="font-semibold">{status.data.fullName}</strong>. אפשר להתחבר מחדש כאן אם צריך.
        </p>
      ) : null}

      <div className="rise" style={{ '--i': 2 } as CSSProperties}>
        <Tabs<Method>
          label="דרך ההתחברות"
          value={effective}
          onChange={setMethod}
          className="mb-6"
          options={[
            { value: 'password', label: 'שם משתמש וסיסמה' },
            { value: 'browser', label: 'דרך הדפדפן' },
            { value: 'token', label: 'טוקן' },
          ]}
        />
        {effective === 'password' ? <PasswordForm /> : effective === 'browser' ? <BrowserFlow /> : <TokenForm />}
        <p className="mt-8 border-t border-rule pt-4 text-[13.5px] text-ink-2">
          <strong className="font-semibold text-ink">הסיסמה שלך לא נשמרת.</strong> משתמשים בה פעם אחת כדי לקבל מ-Moodle מפתח גישה (כמו באפליקציית Moodle לנייד), והמפתח
          נשמר מוצפן בשרת.
        </p>
      </div>
    </div>
  );
}

function useConnected() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return () => {
    qc.invalidateQueries();
    navigate('/');
  };
}

function ErrorText({ error, id }: { error: string; id?: string }) {
  return error ? (
    <p id={id} role="alert" className="text-[14px] text-accent">
      {error}
    </p>
  ) : null;
}

function PasswordForm() {
  const done = useConnected();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
          await post('/api/moodle/login', { username, password });
          done();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'שגיאה');
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="שם משתמש באוניברסיטה">
        <Input dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={!!error || undefined} />
      </Field>
      <Field label="סיסמה">
        <Input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error || undefined} />
      </Field>
      <ErrorText error={error} />
      <Button variant="primary" className="w-full" loading={loading} disabled={!username || !password}>
        התחברות והתחלת סנכרון
      </Button>
    </form>
  );
}

function BrowserFlow() {
  const done = useConnected();
  const [url, setUrl] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-5 text-[14.5px]">
      <ol className="list-decimal space-y-2 ps-5 text-ink-2">
        <li>מכינים קישור, ואז פותחים את Moodle ומתחברים כרגיל.</li>
        <li>
          בסוף הדפדפן ינסה לפתוח כתובת שמתחילה ב-<code dir="ltr">moodlemobile://</code> ויגיד שהוא לא יכול. זה בסדר.
        </li>
        <li>
          מעתיקים את הכתובת (משורת הכתובת או מהודעת השגיאה; ב-Chrome גם מ-<code dir="ltr">chrome://history</code>) ומדביקים כאן.
        </li>
      </ol>
      <p className="border-s-2 border-amber ps-3 text-[13.5px] text-ink-2">
        בטלפון שמותקנת בו אפליקציית Moodle, הקישור עלול להיפתח באפליקציה במקום להראות את הכתובת. אז עדיף לעשות את השלב הזה מהמחשב, או להשתמש בטוקן.
      </p>
      {/* A real link the user taps, so pop-up blockers (Safari) don't stop it. */}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
          <ExternalLink className="size-4" aria-hidden />
          פתיחת Moodle
        </a>
      ) : (
        <Button
          onClick={async () => {
            setError('');
            try {
              const r = await post<{ url: string }>('/api/moodle/launch/start');
              setUrl(r.url);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'שגיאה');
            }
          }}
        >
          הכנת קישור התחברות
        </Button>
      )}
      {url ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError('');
            try {
              await post('/api/moodle/launch/finish', { value });
              done();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'שגיאה');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="הכתובת שקיבלת">
            <Textarea dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="moodlemobile://token=..." className="min-h-20 font-mono text-[13px]" />
          </Field>
          <ErrorText error={error} />
          <Button variant="primary" className="w-full" loading={loading} disabled={value.length < 10}>
            סיום ההתחברות
          </Button>
        </form>
      ) : (
        <ErrorText error={error} />
      )}
    </div>
  );
}

function TokenForm() {
  const done = useConnected();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
          await post('/api/moodle/token', { token: token.trim() });
          done();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'שגיאה');
        } finally {
          setLoading(false);
        }
      }}
    >
      <p className="text-[14.5px] text-ink-2">
        אם יש לך טוקן של שירות האפליקציה (Moodle ← העדפות ← מפתחות אבטחה, שירות <code dir="ltr">moodle_mobile_app</code>), אפשר להדביק אותו כאן.
      </p>
      <Field label="טוקן" hint="32 תווים">
        <Input dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" aria-invalid={!!error || undefined} />
      </Field>
      <ErrorText error={error} />
      <Button variant="primary" className="w-full" loading={loading} disabled={token.trim().length !== 32}>
        התחברות
      </Button>
    </form>
  );
}
