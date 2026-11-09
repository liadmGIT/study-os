import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button, Input } from '../components/ui';
import { post } from '../lib/api';
import { formatFullDate, formatHebrewDate, hebrewYear, todayKey } from '../lib/format';

/** A notebook cover: the title, today's date, and one field. */
export function LoginPage() {
  const qc = useQueryClient();
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const today = todayKey();

  return (
    <main className="margin-rule flex min-h-dvh flex-col justify-center px-6 py-12 [--margin-at:56px] md:ps-28 lg:ps-36 lg:[--margin-at:88px]">
      <div className="max-w-xl">
        <p className="eyebrow rise">שנת הלימודים {hebrewYear()}</p>
        <h1 className="display rise mt-3 text-[64px] leading-[0.95] md:text-[88px]" style={{ '--i': 1 } as React.CSSProperties}>
          לימודים
        </h1>
        <p className="rise mt-4 max-w-sm text-[16px] text-ink-2" style={{ '--i': 2 } as React.CSSProperties}>
          משימות, הרצאות ועדכונים מכל הקורסים ב-Moodle, במקום אחד.
        </p>
        <p className="rise mt-1 text-[14px] text-ink-3" style={{ '--i': 2 } as React.CSSProperties}>
          {formatFullDate(today)} · {formatHebrewDate(today)}
        </p>

        <form
          className="rise mt-10 max-w-sm space-y-3 border-t-2 border-ink pt-6"
          style={{ '--i': 3 } as React.CSSProperties}
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError('');
            try {
              await post('/api/auth/login', { password });
              qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
              qc.setQueryData(['me'], { authed: true });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'שגיאה');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label htmlFor={id} className="block text-[14px] font-medium">
            סיסמה
          </label>
          <Input
            id={id}
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-describedby={`${id}-hint ${error ? `${id}-err` : ''}`}
          />
          <p id={`${id}-hint`} className="text-[13px] text-ink-3">
            הסיסמה של המערכת הזו (מההתקנה), לא הסיסמה של האוניברסיטה.
          </p>
          {error ? (
            <p id={`${id}-err`} role="alert" className="text-[14px] text-accent">
              {error}
            </p>
          ) : null}
          <Button variant="primary" className="w-full" loading={loading} disabled={!password}>
            כניסה
          </Button>
        </form>
      </div>
    </main>
  );
}
