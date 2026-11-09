import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/500.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/600.css';
import '@fontsource/frank-ruhl-libre/700.css';
import './index.css';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { ApiError, setUnauthorizedHandler } from './lib/api';
import { CACHE_KEY, safeStorage } from './lib/storage';
import { registerServiceWorker } from './lib/push';

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: DAY,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// The last data seen is kept on the device: screens open instantly and still work without signal.
const persister = createSyncStoragePersister({ storage: safeStorage(), key: CACHE_KEY, throttleTime: 2000 });

setUnauthorizedHandler(() => queryClient.setQueryData(['me'], { authed: false }));
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        buster: 'v2',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success' && !['me', 'ping', 'sync-status'].includes(String(q.queryKey[0])),
        },
      }}
    >
      <ToastProvider>
        <App />
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
