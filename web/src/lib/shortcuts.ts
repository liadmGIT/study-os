import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

/** "g" then a letter jumps to a screen. Physical keys (e.code), so it works on a Hebrew keyboard too. */
export const GO_TO: { code: string; key: string; to: string; label: string }[] = [
  { code: 'KeyH', key: 'H', to: '/', label: 'היום' },
  { code: 'KeyT', key: 'T', to: '/tasks', label: 'משימות' },
  { code: 'KeyL', key: 'L', to: '/lectures', label: 'הרצאות' },
  { code: 'KeyW', key: 'W', to: '/week', label: 'השבוע' },
  { code: 'KeyC', key: 'C', to: '/courses', label: 'קורסים' },
  { code: 'KeyF', key: 'F', to: '/files', label: 'קבצים' },
  { code: 'KeyU', key: 'U', to: '/updates', label: 'עדכונים' },
  { code: 'KeyS', key: 'S', to: '/settings', label: 'הגדרות' },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

export function useShortcuts(handlers: { onNew: () => void; onHelp: () => void }) {
  const navigate = useNavigate();
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let gPressedAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return; // dialogs handle their own keys
      if (Date.now() - gPressedAt < 1200) {
        gPressedAt = 0;
        const target = GO_TO.find((g) => g.code === e.code);
        if (target) {
          e.preventDefault();
          navigate(target.to);
        }
        return;
      }
      if (e.code === 'KeyG') {
        gPressedAt = Date.now();
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        ref.current.onNew();
      } else if (e.code === 'Slash' && e.shiftKey) {
        e.preventDefault();
        ref.current.onHelp();
      } else if (e.code === 'Slash') {
        e.preventDefault();
        navigate('/tasks?focus=search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
