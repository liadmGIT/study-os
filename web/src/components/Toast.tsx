import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from './ui';

type Tone = 'info' | 'error';
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, tone: Tone = 'info') => {
    const id = nextId++;
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {/* Two live regions: errors interrupt, everything else waits its turn. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8">
        <div role="status" aria-live="polite" className="contents">
          {items
            .filter((t) => t.tone === 'info')
            .map((t) => (
              <Toast key={t.id} item={t} />
            ))}
        </div>
        <div role="alert" className="contents">
          {items
            .filter((t) => t.tone === 'error')
            .map((t) => (
              <Toast key={t.id} item={t} />
            ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Toast({ item }: { item: ToastItem }) {
  return (
    <div
      className={cn(
        'pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-[14px] shadow-[0_8px_24px_-8px_rgba(31,28,23,.4)] animate-[rise_.25s_ease]',
        item.tone === 'error' ? 'bg-accent text-paper' : 'bg-ink text-paper',
      )}
    >
      {item.text}
    </div>
  );
}
