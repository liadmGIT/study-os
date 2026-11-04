import { useQueryClient } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Input } from '../components/ui';
import { post } from '../lib/api';

export function LoginPage() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/icons/icon.svg" alt="" className="size-14" />
          <div>
            <h1 className="text-xl font-bold">מערכת הלימודים</h1>
            <p className="text-sm text-muted">משימות, הרצאות ועדכונים מ-Moodle במקום אחד</p>
          </div>
        </div>
        <form
          className="space-y-3"
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
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
              <LockKeyhole className="size-3.5" />
              סיסמת המערכת
            </span>
            <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-overdue">{error}</p> : null}
          <Button variant="primary" className="w-full" loading={loading} disabled={!password}>
            כניסה
          </Button>
          <p className="text-center text-xs text-faint">זו הסיסמה שהגדרת בשרת (APP_PASSWORD), לא סיסמת האוניברסיטה.</p>
        </form>
      </Card>
    </div>
  );
}
