import { useEffect, useState } from 'react';

export const CACHE_KEY = 'study-os-cache';

/** localStorage that never throws (private mode, blocked storage). */
export function safeStorage(): Storage | undefined {
  try {
    const s = window.localStorage;
    const probe = '__probe__';
    s.setItem(probe, probe);
    s.removeItem(probe);
    return s;
  } catch {
    return undefined;
  }
}

export function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not important if it isn't remembered.
  }
}

/** A small remembered choice (a filter, a tab). Falls back to the default if storage is unavailable. */
export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => readPref(key, fallback, allowed));
  const set = (v: T) => {
    setValue(v);
    writePref(key, v);
  };
  return [value, set] as const;
}

export function clearCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Online / offline, following the browser's events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export type Theme = 'system' | 'light' | 'dark';
const THEMES = ['system', 'light', 'dark'] as const;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = usePref<Theme>('theme', 'system', THEMES);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return [theme, setTheme] as const;
}
