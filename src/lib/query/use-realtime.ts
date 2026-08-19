/**
 * The one place a Supabase Realtime channel is opened, filtered and torn down.
 *
 * WHY A SHARED PRIMITIVE
 * Every feature that wants live data needs the same four things right: a stable
 * channel name, a server-side filter, cleanup on unmount, and a guard so it does
 * not subscribe before the id it filters on is known. Written per-feature, at
 * least one of those gets missed — usually cleanup, and the symptom is a
 * websocket leaked per thread opened.
 *
 * WHAT IT DOES ON A CHANGE
 * Invalidates query keys. It deliberately does NOT write payloads into the
 * cache: a `postgres_changes` payload is a single flat row with none of its
 * joins, so splicing it into a cache entry built from a joined select produces
 * rows with missing relations — an attachment that vanishes, a vendor name that
 * turns null. Invalidate, refetch, stay correct.
 *
 * SECURITY
 * Realtime evaluates the subscriber's RLS before sending, so a filter is not a
 * security control — it is a bandwidth and correctness control. Never rely on a
 * filter to keep data from someone; rely on the policy. The filter exists so a
 * vendor is not woken up for every order in the system that they could
 * technically read.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface RealtimeBinding {
  table: string;
  /** PostgREST-style filter, e.g. `vendor_id=eq.<uuid>`. */
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
}

export interface UseRealtimeOptions {
  /** Stable, unique per subscription. Two mounts with one name share a channel. */
  channel: string;
  bindings: RealtimeBinding[];
  /** Invalidated on any matching change. */
  invalidate: QueryKey[];
  /** Skip entirely — use while an id is still resolving. */
  enabled?: boolean;
  /** Escape hatch for the rare case that needs the payload itself. */
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

export function useRealtime({
  channel,
  bindings,
  invalidate,
  enabled = true,
  onChange,
}: UseRealtimeOptions) {
  const queryClient = useQueryClient();

  // Held in refs so a caller passing inline arrays/closures — which every caller
  // does — does not tear the socket down and rebuild it on every render. Only
  // `channel` and `enabled` drive resubscription.
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const ch = supabase.channel(channel);

    for (const binding of bindingsRef.current) {
      ch.on(
        // The literal is required for the overload to resolve; the object below
        // is what actually configures the subscription.
        'postgres_changes',
        {
          event: binding.event ?? '*',
          schema: binding.schema ?? 'public',
          table: binding.table,
          ...(binding.filter ? { filter: binding.filter } : {}),
        } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          for (const key of invalidateRef.current) {
            queryClient.invalidateQueries({ queryKey: key });
          }
          onChangeRef.current?.(payload);
        },
      );
    }

    ch.subscribe();

    return () => {
      // Without this the socket survives the component and accumulates.
      supabase.removeChannel(ch);
    };
  }, [channel, enabled, queryClient]);
}
