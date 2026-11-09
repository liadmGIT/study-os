import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Keyboard, Monitor, Moon, Plus, RefreshCw, Sun, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { post } from '../lib/api';
import { formatAgo, hebrewYear } from '../lib/format';
import { useAction, useDashboard, useMoodleStatus, useSyncStatus } from '../lib/queries';
import { GO_TO, useShortcuts } from '../lib/shortcuts';
import { useOnline, useTheme, type Theme } from '../lib/storage';
import { QuickAdd } from './QuickAdd';
import { TaskSheet } from './TaskSheet';
import { Button, cn, Kbd, Sheet } from './ui';

type NavItem = { to: string; label: string; short?: string };

const NAV: NavItem[] = [
  { to: '/', label: 'היום' },
  { to: '/tasks', label: 'משימות' },
  { to: '/lectures', label: 'הרצאות' },
  { to: '/week', label: 'השבוע' },
  { to: '/courses', label: 'קורסים' },
  { to: '/files', label: 'קבצים' },
  { to: '/updates', label: 'עדכונים' },
  { to: '/settings', label: 'הגדרות' },
];

/** Refreshes every screen once a sync finishes. Mounted once, in the layout. */
function useRefreshAfterSync() {
  const status = useSyncStatus();
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !status.data?.running) qc.invalidateQueries();
    wasRunning.current = !!status.data?.running;
  }, [status.data?.running, qc]);
}

function SyncButton({ compact }: { compact?: boolean }) {
  const status = useSyncStatus();
  const sync = useAction(() => post('/api/sync'));
  const running = status.data?.running || sync.pending;
  if (!status.data?.connected) return null;
  const last = status.data.last;
  const failed = last?.status === 'error' || last?.status === 'partial';
  const label = running ? 'מסנכרן עם Moodle…' : last?.finishedAt ? `סונכרן ${formatAgo(last.finishedAt)}` : 'סנכרן עכשיו';
  return (
    <button
      type="button"
      onClick={() => sync.run()}
      disabled={running}
      aria-label={compact ? `סנכרון עם Moodle. ${label}` : undefined}
      title="סנכרון עם Moodle"
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:cursor-progress',
        compact ? 'size-11 justify-center' : 'h-9 w-full px-2',
      )}
    >
      <RefreshCw className={cn('size-4 shrink-0', running && 'animate-spin')} aria-hidden />
      {compact ? null : (
        <span className="truncate" aria-live="polite">
          {label}
        </span>
      )}
      {failed && !running ? <span className="size-1.5 shrink-0 rounded-full bg-accent" title="בסנכרון האחרון היו שגיאות" /> : null}
    </button>
  );
}

const THEME_META: Record<Theme, { label: string; icon: ComponentType<{ className?: string }> }> = {
  system: { label: 'צבעים: לפי המכשיר', icon: Monitor },
  light: { label: 'צבעים: בהיר', icon: Sun },
  dark: { label: 'צבעים: כהה', icon: Moon },
};

function ThemeButton({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const { label, icon: Icon } = THEME_META[theme];
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${label}. לחץ להחלפה`}
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink',
        compact ? 'size-11 justify-center' : 'h-9 w-full px-2',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {compact ? null : <span>{label}</span>}
    </button>
  );
}

function Banners() {
  const status = useSyncStatus();
  const online = useOnline();
  const location = useLocation();
  return (
    <>
      {!online ? (
        <div role="status" className="mb-6 flex items-center gap-2.5 border-y border-rule py-2.5 text-[14px] text-ink-2">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          אין חיבור לאינטרנט. מוצגים הנתונים האחרונים שנשמרו במכשיר.
        </div>
      ) : null}
      {status.data?.tokenInvalid && location.pathname !== '/connect' ? (
        <Link to="/connect" className="mb-6 block border-y border-accent/40 py-2.5 text-[14px] text-accent hover:bg-accent/5">
          החיבור ל-Moodle פג, ולכן הסנכרון עצר. <span className="font-semibold underline underline-offset-2">התחבר מחדש</span>
        </Link>
      ) : null}
    </>
  );
}

function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="קיצורי מקלדת">
      <dl className="space-y-3 text-[14.5px]">
        <div className="flex items-center justify-between gap-4">
          <dt>משימה חדשה</dt>
          <dd>
            <Kbd>N</Kbd>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt>חיפוש משימות</dt>
          <dd>
            <Kbd>/</Kbd>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt>הקיצורים האלה</dt>
          <dd>
            <Kbd>?</Kbd>
          </dd>
        </div>
        <div className="border-t border-rule pt-3 text-[13px] text-ink-3">
          מעבר מהיר: <Kbd>G</Kbd> ואז האות
        </div>
        {GO_TO.map((g) => (
          <div key={g.code} className="flex items-center justify-between gap-4">
            <dt>{g.label}</dt>
            <dd className="flex gap-1" dir="ltr">
              <Kbd>G</Kbd>
              <Kbd>{g.key}</Kbd>
            </dd>
          </div>
        ))}
        <p className="border-t border-rule pt-3 text-[13px] text-ink-3">הקיצורים עובדים גם במקלדת בעברית (לפי מיקום המקש).</p>
      </dl>
    </Sheet>
  );
}

export function Layout() {
  useRefreshAfterSync();
  useTheme(); // applies the saved theme
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [help, setHelp] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const dash = useDashboard();
  const moodle = useMoodleStatus();
  const openTask = params.get('open') ? Number(params.get('open')) : null;
  const unread = (dash.data?.announcements.unread ?? 0) + (dash.data?.unreadNotifications ?? 0);
  const year = hebrewYear();

  useShortcuts({ onNew: () => setAdding(true), onHelp: () => setHelp(true) });

  useEffect(() => {
    setMore(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const closeTask = () => {
    params.delete('open');
    setParams(params, { replace: true });
  };

  const navLink = (item: NavItem) => (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-md px-3 text-[15px] transition-colors',
          isActive ? 'font-semibold text-ink' : 'text-ink-2 hover:bg-sunken/70 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span aria-hidden className={cn('absolute inset-y-2 start-0 w-0.5 rounded-full', isActive ? 'bg-accent' : 'bg-transparent')} />
          <span className="flex-1">{item.label}</span>
          {item.to === '/updates' && unread ? (
            <span className="text-[12.5px] font-semibold text-accent tabular" aria-label={`${unread} חדשים`}>
              {unread}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only z-[70] rounded-md bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:start-3"
      >
        דלג לתוכן הראשי
      </a>

      {/* Desktop sidebar (on the right, since the page is RTL) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-4 pt-8 pb-5 md:flex">
        <Link to="/" className="mb-7 block px-3">
          <span className="display block text-[28px] leading-none">לימודים</span>
          <span className="eyebrow mt-1.5 block">{moodle.data?.fullName ? `${moodle.data.fullName} · ` : ''}שנת {year}</span>
        </Link>
        <Button variant="primary" onClick={() => setAdding(true)} className="mb-6 w-full" title="משימה חדשה (N)">
          <Plus className="size-4" aria-hidden />
          משימה חדשה
        </Button>
        <nav aria-label="ניווט ראשי">
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.to}>{navLink(item)}</li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto space-y-0.5 border-t border-rule pt-3">
          <SyncButton />
          <ThemeButton />
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="inline-flex h-9 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <Keyboard className="size-4" aria-hidden />
            קיצורי מקלדת
          </button>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-rule bg-paper/92 px-3 backdrop-blur md:hidden">
        <Link to="/" className="display px-2 text-[22px]">
          לימודים
        </Link>
        <div className="flex-1" />
        <SyncButton compact />
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="משימה חדשה"
          className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-sunken"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </header>

      <main id="main" tabIndex={-1} className="margin-rule mx-auto w-full max-w-[1120px] flex-1 px-5 pt-7 pb-32 focus:outline-none md:px-12 md:pt-12 md:pb-16">
        <Banners />
        <Outlet />
      </main>

      {/* Phone bottom bar */}
      <nav aria-label="ניווט ראשי" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.slice(0, 4).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn('relative flex h-14 flex-col items-center justify-center text-[13px]', isActive ? 'font-semibold text-ink' : 'text-ink-2')
                }
              >
                {({ isActive }) => (
                  <>
                    <span aria-hidden className={cn('absolute top-0 h-0.5 w-8 rounded-full', isActive ? 'bg-accent' : 'bg-transparent')} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className="relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[13px] text-ink-2"
            >
              <Ellipsis className="size-4" aria-hidden />
              עוד
              {unread ? <span className="absolute top-3 end-5 size-2 rounded-full bg-accent" aria-label={`${unread} עדכונים חדשים`} /> : null}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="עוד">
        <nav aria-label="עמודים נוספים">
          <ul className="divide-y divide-rule border-y border-rule">
            {NAV.slice(4).map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="flex h-14 items-center justify-between text-[16px]">
                  {item.label}
                  {item.to === '/updates' && unread ? <span className="text-[14px] font-semibold text-accent tabular">{unread} חדשים</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-4 flex gap-2">
          <ThemeButton />
        </div>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="משימה חדשה">
        <QuickAdd stacked onDone={() => setAdding(false)} />
      </Sheet>

      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
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
