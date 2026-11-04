import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Bell, BookOpen, CalendarDays, CirclePlay, Ellipsis, FolderOpen, House, ListChecks, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { post } from '../lib/api';
import { formatAgo } from '../lib/format';
import { useAction, useDashboard, useSyncStatus } from '../lib/queries';
import { TaskSheet } from './TaskSheet';
import { Sheet } from './ui';

const NAV = [
  { to: '/', label: 'בית', icon: House },
  { to: '/tasks', label: 'משימות', icon: ListChecks },
  { to: '/lectures', label: 'הרצאות', icon: CirclePlay },
  { to: '/week', label: 'השבוע', icon: CalendarDays },
  { to: '/courses', label: 'קורסים', icon: BookOpen },
  { to: '/files', label: 'קבצים', icon: FolderOpen },
  { to: '/updates', label: 'עדכונים', icon: Bell },
  { to: '/settings', label: 'הגדרות', icon: Settings },
];

export function SyncButton({ compact }: { compact?: boolean }) {
  const status = useSyncStatus();
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  const sync = useAction(() => post('/api/sync'));
  const running = status.data?.running || sync.pending;

  // Refresh every screen once a sync finishes.
  useEffect(() => {
    if (wasRunning.current && !status.data?.running) qc.invalidateQueries();
    wasRunning.current = !!status.data?.running;
  }, [status.data?.running, qc]);

  if (!status.data?.connected) return null;
  const last = status.data.last;
  const label = running ? 'מסנכרן…' : last?.finishedAt ? `סונכרן ${formatAgo(last.finishedAt)}` : 'סנכרן עכשיו';
  return (
    <button
      onClick={() => sync.run()}
      disabled={running}
      title="סנכרון עם Moodle"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-xl text-xs text-muted transition-colors hover:bg-sunken hover:text-ink',
        compact ? 'size-9 justify-center' : 'h-8 px-2.5',
      )}
    >
      <RefreshCw className={clsx('size-4', running && 'animate-spin')} />
      {compact ? null : <span>{label}</span>}
      {last?.status === 'error' || last?.status === 'partial' ? <span className="size-1.5 rounded-full bg-urgent" /> : null}
    </button>
  );
}

function Banner() {
  const status = useSyncStatus();
  const location = useLocation();
  if (!status.data?.tokenInvalid || location.pathname === '/connect') return null;
  return (
    <Link to="/connect" className="mb-4 flex items-center gap-2 rounded-2xl border border-urgent/30 bg-urgent/10 px-4 py-3 text-sm text-urgent">
      <TriangleAlert className="size-4 shrink-0" />
      <span className="flex-1">החיבור ל-Moodle פג, ולכן הסנכרון עצר. לחץ כאן כדי להתחבר מחדש.</span>
    </Link>
  );
}

export function Layout() {
  const [more, setMore] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const dash = useDashboard();
  const openTask = params.get('open') ? Number(params.get('open')) : null;
  const unread = (dash.data?.announcements.unread ?? 0) + (dash.data?.unreadNotifications ?? 0);

  useEffect(() => {
    setMore(false);
  }, [location.pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const closeTask = () => {
    params.delete('open');
    setParams(params, { replace: true });
  };

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar (on the right, since the page is RTL) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line px-3 py-5 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <img src="/icons/icon.svg" alt="" className="size-8" />
          <div>
            <div className="text-[15px] font-bold leading-tight">מערכת הלימודים</div>
            <div className="text-[11px] text-muted">מסונכרן עם Moodle</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-sunken hover:text-ink',
                )
              }
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {to === '/updates' && unread ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular">{unread}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-1">
          <SyncButton />
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="size-7" />
          <span className="font-bold">לימודים</span>
        </Link>
        <div className="flex-1" />
        <Link to="/updates" className="relative inline-flex size-9 items-center justify-center rounded-xl text-muted" aria-label="עדכונים">
          <Bell className="size-5" />
          {unread ? <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-accent" /> : null}
        </Link>
        <SyncButton compact />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
        <Banner />
        <Outlet />
      </main>

      {/* Phone bottom bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
          <Ellipsis className="size-5" />
          עוד
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="עוד">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {NAV.slice(4).map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-4 text-sm font-medium">
              <Icon className="size-5 text-muted" />
              {label}
            </Link>
          ))}
        </div>
      </Sheet>

      <TaskSheet taskId={openTask} onClose={closeTask} />
    </div>
  );
}

/** Opens the task panel from anywhere (keeps the current page underneath). */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  return (id: number) => {
    params.set('open', String(id));
    setParams(params);
  };
}
