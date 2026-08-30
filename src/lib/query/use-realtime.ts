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

import { useEffect, useId, useRef } from 'react';
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
  /**
   * Logical name for the subscription, e.g. `orders:vendor:<id>`.
   *
   * It does NOT have to be globally unique — a per-instance suffix is appended
   * internally. See the note on topic collisions in the effect below.
   */
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

  /*
   * A per-instance suffix, so two components asking for the same logical channel
   * do not collide.
   *
   * THE BUG THIS FIXES
   * `supabase.channel(topic)` is a GET-OR-CREATE: given a topic that already has
   * an open channel, it hands back that same channel rather than a new one.
   * Calling `.on()` on an already-subscribed channel throws
   *   "cannot add `postgres_changes` callbacks ... after `subscribe()`".
   *
   * That fired on /vendor/inbox because ChatWidget (mounted globally in the
   * dashboard shell) and the inbox both call `useConversationsRealtime()`, so
   * both computed `conversations:<userId>`. React StrictMode's double-invoked
   * effects in development made it reproduce every time: the cleanup's
   * `removeChannel` is asynchronous, so the remount could still see the old
   * channel registered.
   *
   * `useId` is stable across renders and unique per component instance, which is
   * exactly the property needed. Colons are stripped because the topic is
   * interpolated into Realtime's own `realtime:<topic>` namespace.
   */
  const instanceId = useId().replace(/:/g, '');
  const topic = `${channel}::${instanceId}`;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const ch = supabase.channel(topic);

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
  }, [topic, enabled, queryClient]);
}
