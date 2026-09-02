/**
 * TanStack Query provider.
 *
 * THE `useState` IS NOT A STYLE CHOICE
 * `useState(() => createQueryClient())` creates the client exactly once per
 * component instance. Writing `const client = createQueryClient()` in the body
 * instead would build a fresh client on every render, throwing away the cache
 * each time and making every query refetch forever. And hoisting it to module
 * scope would share one cache across all server requests, leaking one user's
 * data into another's render. The lazy initialiser is the only correct form.
 *
 * COEXISTING WITH RTK QUERY
 * This app already fetches through RTK Query (`src/store/api`). Both layers now
 * run side by side, which is fine mechanically but is not a resting place  
 * two caches over the same tables invalidate independently and will disagree.
 * The intended direction is that new work uses these hooks and the existing
 * `profile-api` slice is migrated over, after which `base-api.ts` and this
 * comment can go. Until then: a given table should be owned by ONE layer.
 * `profiles` is RTK Query's today; everything in `src/lib/query/keys.ts` is
 * TanStack's.
 */
'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createQueryClient } from '@/lib/query/query-client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
