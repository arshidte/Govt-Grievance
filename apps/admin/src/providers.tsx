'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pg/ui';

/**
 * Client-side providers for the admin app (mirrors the citizen app's
 * src/providers.tsx — see that file's comment for the rationale).
 * `QueryClient` is created once per browser session via `useState` (not
 * module scope), so each staff user gets an isolated cache and
 * server/client hydration stays consistent.
 *
 * `ToastProvider` is mounted once here — it renders Radix's toast
 * `Viewport` (the portal target every `@pg/ui` `Toast` needs to render
 * into), so any feature component can render a `Toast` without each one
 * re-mounting its own provider/viewport.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
