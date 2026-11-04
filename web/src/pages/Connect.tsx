import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Globe, KeyRound, LoaderCircle, ShieldCheck, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Field, Input, PageHeader, Segmented, Textarea } from '../components/ui';
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
    <div className="mx-auto max-w-xl">
      <PageHeader title="חיבור ל-Moodle" subtitle="מתחברים פעם אחת, ומשם המערכת מתעדכנת לבד כל 20 דקות." />

      <Card className="mb-4 flex items-center gap-3 p-4">
        {ping.isLoading ? (
          <LoaderCircle className="size-5 animate-spin text-muted" />
        ) : ping.data?.reachable ? (
          <Wifi className="size-5 text-ok" />
        ) : (
          <WifiOff className="size-5 text-overdue" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          {ping.isLoading ? (
            'בודק אם השרת מגיע ל-Moodle…'
          ) : ping.data?.reachable ? (
            <>
              <div className="font-medium">השרת מגיע ל-Moodle</div>
              <div className="truncate text-xs text-muted" dir="ltr">
                {ping.data.siteName ?? ping.data.baseUrl} · {ping.data.ms}ms
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-overdue">השרת לא מצליח להגיע ל-Moodle</div>
              <div className="text-xs text-muted">
                ייתכן שהאוניברסיטה חוסמת גישה מחוץ לישראל. ראה ב-README איך להעביר את המערכת לשרת בתל אביב.
              </div>
              <div className="mt-1 truncate text-[11px] text-faint" dir="ltr">
                {ping.data?.error}
              </div>
            </>
          )}
        </div>
      </Card>

      {status.data?.connected && !status.data.tokenInvalid ? (
        <Card className="mb-4 flex items-center gap-3 border-ok/30 bg-ok/5 p-4 text-sm">
          <CircleCheck className="size-5 text-ok" />
          <span className="flex-1">
            מחובר בתור <b>{status.data.fullName}</b>. אפשר להתחבר מחדש למטה אם צריך.
          </span>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="mb-5">
          <Segmented<Method>
            value={effective}
            onChange={setMethod}
            options={[
              { value: 'password', label: 'שם משתמש וסיסמה' },
              { value: 'browser', label: 'דרך הדפדפן (SSO)' },
              { value: 'token', label: 'הדבקת טוקן' },
            ]}
          />
        </div>
        {effective === 'password' ? <PasswordForm /> : effective === 'browser' ? <BrowserFlow /> : <TokenForm />}
        <p className="mt-5 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          הסיסמה שלך לא נשמרת. משתמשים בה פעם אחת כדי לקבל מ-Moodle מפתח גישה (כמו באפליקציית Moodle לנייד), והמפתח נשמר מוצפן בשרת.
        </p>
      </Card>
    </div>
  );
}

function useConnected() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return () => {
    qc.invalidateQueries();
    navigate('/?welcome=1');
  };
}

function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="flex items-start gap-1.5 text-sm text-overdue">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
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
      className="space-y-3"
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
        <Input dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="סיסמה">
        <Input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <Button variant="primary" className="w-full" loading={loading} disabled={!username || !password}>
        התחבר והתחל סנכרון
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
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-2 ps-5 text-muted">
        <li>לחץ על הכפתור למטה. ייפתח חלון של Moodle. התחבר כרגיל.</li>
        <li>
          בסוף הדפדפן ינסה לפתוח כתובת שמתחילה ב-<code dir="ltr">moodlemobile://</code> ויגיד שהוא לא יכול. זה בסדר.
        </li>
        <li>
          העתק את הכתובת הזו (משורת הכתובת, או מהודעת השגיאה; ב-Chrome אפשר גם מ-<code dir="ltr">chrome://history</code>) והדבק כאן.
        </li>
      </ol>
      <Button
        onClick={async () => {
          setError('');
          try {
            const r = await post<{ url: string }>('/api/moodle/launch/start');
            setUrl(r.url);
            window.open(r.url, '_blank', 'noopener');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'שגיאה');
          }
        }}
      >
        <Globe className="size-4" />
        פתח את Moodle להתחברות
      </Button>
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
            <Textarea dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="moodlemobile://token=..." className="!min-h-20 font-mono text-xs" />
          </Field>
          <ErrorText error={error} />
          <Button variant="primary" className="w-full" loading={loading} disabled={value.length < 10}>
            סיים התחברות
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
      className="space-y-3"
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
      <p className="text-sm text-muted">
        אם יש לך טוקן של שירות האפליקציה (Moodle ← העדפות ← מפתחות אבטחה, שירות <code dir="ltr">moodle_mobile_app</code>), אפשר להדביק אותו כאן.
      </p>
      <Field label="טוקן">
        <Input dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" placeholder="32 תווים" />
      </Field>
      <ErrorText error={error} />
      <Button variant="primary" className="w-full" loading={loading} disabled={token.trim().length !== 32}>
        <KeyRound className="size-4" />
        התחבר
      </Button>
    </form>
  );
}
