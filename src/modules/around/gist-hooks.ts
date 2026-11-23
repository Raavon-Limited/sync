/**
 * Client hooks for the public gist feed and campus polls
 * (migration 20261123120000_around_gist_and_polls).
 *
 * The gist is read ONLY through the gist_feed() function: clients have no
 * SELECT on gist_posts, because the row holds the real author. Writes go
 * through functions or plain inserts that the database re-checks.
 *
 * Gist writes are mutations, so a signed-out tap goes to /login via the
 * MutationCache gate (lib/query/query-client.ts). Poll VOTES are not gated:
 * voting needs no account and goes through /api/polls/vote, marked
 * `meta: { public: true }`.
 *
 * The tables postdate the generated types, hence the untyped client.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';

const db = () => createClient() as unknown as SupabaseClient;

export type GistKind = 'gist' | 'alert' | 'event' | 'deal';

/** What each kind is for. Shown in the composer, so posters pick the right one. */
export const GIST_KINDS: Record<GistKind, { label: string; hint: string }> = {
  gist: { label: 'Gist', hint: 'News and chatter around campus' },
  alert: { label: 'Alert', hint: 'Urgent heads-up (light, water, road). Pinned for 2 hours' },
  deal: { label: 'Deal', hint: 'A discount or offer worth knowing' },
  event: { label: 'Event', hint: 'Something happening at a set time and place' },
};

export interface GistPost {
  id: string;
  authorName: string;
  kind: GistKind;
  body: string;
  createdAt: string;
  sameHere: number;
  reacted: boolean;
  mine: boolean;
}

/** Live posts: last 24h, newest 50 for the campus. `limit` 20 by default. */
export function useGistFeed(campusId: string | null, limit = 20) {
  const { userId } = useSession();
  return useQuery({
    queryKey: ['gist', 'feed', campusId, limit, userId],
    enabled: !!campusId,
    queryFn: async (): Promise<GistPost[]> => {
      const { data, error } = await db().rpc('gist_feed', { p_campus: campusId, p_limit: limit });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        authorName: r.author_name as string,
        kind: r.kind as GistKind,
        body: r.body as string,
        createdAt: r.created_at as string,
        sameHere: Number(r.same_here ?? 0),
        reacted: Boolean(r.reacted),
        mine: Boolean(r.mine),
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDropGist(campusId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: GistKind; body: string }) => {
      // author, name, time and cleaning are all set by the database trigger.
      const { data: u } = await db().auth.getUser();
      const { error } = await db().from('gist_posts').insert({
        author_id: u.user?.id,
        campus_id: campusId,
        kind: input.kind,
        body: input.body,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

export function useToggleSameHere() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await db().rpc('toggle_gist_reaction', { p_post: postId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

export function useReportGist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await db().from('gist_reports').insert({ post_id: postId });
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

export function useDeleteGist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await db().rpc('delete_my_gist', { p_post: postId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

/* ── Display name ─────────────────────────────────────────────────────── */

export function useMyDisplayName() {
  const { userId } = useSession();
  return useQuery({
    queryKey: ['gist', 'display-name', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db().from('profiles').select('display_name').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return (data?.display_name as string | null) ?? null;
    },
  });
}

export function useSetDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await db().rpc('set_display_name', { p_name: name });
      if (error) throw new Error(error.message);
      return data as string | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'display-name'] }),
  });
}

/* ── Polls ────────────────────────────────────────────────────────────── */

export type PollKind = 'single' | 'multi' | 'ranked';

export interface Poll {
  id: string;
  question: string;
  authorName: string;
  kind: PollKind;
  maxChoices: number;
  scope: 'open' | 'local';
  endsAt: string;
  options: { id: string; label: string }[];
}

export interface PollResult {
  /** Votes (single/multi) or points (ranked) per option. */
  score: Map<string, number>;
  near: Map<string, number>;
  far: Map<string, number>;
  ballots: number;
}

/** The campus's featured poll, else its newest live one. */
export function useCampusPoll(campusId: string | null) {
  return useQuery({
    queryKey: ['gist', 'poll', campusId],
    enabled: !!campusId,
    queryFn: async (): Promise<Poll | null> => {
      const { data, error } = await db()
        .from('polls')
        .select('id, question, author_name, kind, max_choices, scope, ends_at, poll_options(id, label, position)')
        .eq('campus_id', campusId!)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const options = [...((data.poll_options ?? []) as { id: string; label: string; position: number }[])]
        .sort((a, b) => a.position - b.position)
        .map(({ id, label }) => ({ id, label }));
      return {
        id: data.id,
        question: data.question,
        authorName: data.author_name,
        kind: data.kind,
        maxChoices: data.max_choices,
        scope: data.scope,
        endsAt: data.ends_at,
        options,
      };
    },
    staleTime: 5 * 60_000,
  });
}

export function usePollResults(pollId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['gist', 'poll-results', pollId],
    enabled: !!pollId && enabled,
    queryFn: async (): Promise<PollResult> => {
      const { data, error } = await db().rpc('poll_results', { p_poll: pollId });
      if (error) throw error;
      const rows = (data ?? []) as { option_id: string; score: number; votes_near: number; votes_far: number; ballots: number }[];
      return {
        score: new Map(rows.map((r) => [r.option_id, Number(r.score)])),
        near: new Map(rows.map((r) => [r.option_id, Number(r.votes_near)])),
        far: new Map(rows.map((r) => [r.option_id, Number(r.votes_far)])),
        ballots: Number(rows[0]?.ballots ?? 0),
      };
    },
    refetchInterval: 30_000,
  });
}

const DEVICE_KEY = 'sync:device';
const VOTED_KEY = 'sync:voted';

function deviceId(): string | undefined {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Polls this browser has voted on, so results show straight away. */
export function votedHere(pollId: string): boolean {
  try {
    return JSON.parse(window.localStorage.getItem(VOTED_KEY) ?? '[]').includes(pollId);
  } catch {
    return false;
  }
}
function rememberVote(pollId: string) {
  try {
    const all: string[] = JSON.parse(window.localStorage.getItem(VOTED_KEY) ?? '[]');
    if (!all.includes(pollId)) window.localStorage.setItem(VOTED_KEY, JSON.stringify([...all, pollId].slice(-200)));
  } catch {
    /* storage blocked */
  }
}

/** Ask for a position briefly; null if refused or slow. */
function currentPosition(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}

export function useVote(poll: Poll | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // Voting needs no account: skip the sign-in gate.
    meta: { public: true },
    mutationFn: async (optionIds: string[]) => {
      // A local poll needs a location; an open one only uses it for the tag.
      const pos = await currentPosition(poll?.scope === 'local' ? 10_000 : 4_000);
      const res = await fetch('/api/polls/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pollId: poll?.id, optionIds, deviceId: deviceId(), ...(pos ?? {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; inVicinity?: boolean };
      // Already voted counts as voted here too, so the results show.
      if (res.status === 409 && /already voted/i.test(json.error ?? '')) {
        rememberVote(poll!.id);
        return { inVicinity: undefined, already: true };
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not save your vote');
      rememberVote(poll!.id);
      return { inVicinity: json.inVicinity, already: false };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'poll-results'] }),
  });
}

export function useCreatePoll(campusId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      question: string;
      kind: PollKind;
      maxChoices: number;
      scope: 'open' | 'local';
      days: number;
      options: string[];
    }) => {
      const { error } = await db().rpc('create_poll', {
        p_campus: campusId,
        p_question: p.question,
        p_kind: p.kind,
        p_max: p.maxChoices,
        p_scope: p.scope,
        p_days: p.days,
        p_options: p.options,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'poll'] }),
  });
}

export function useReportPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await db().from('poll_reports').insert({ poll_id: pollId });
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'poll'] }),
  });
}
