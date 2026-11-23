/**
 * Client hooks for the public gist feed and campus polls
 * (migration 20261123120000_around_gist_and_polls).
 *
 * The gist is read ONLY through the gist_feed() function: clients have no
 * SELECT on gist_posts, because the row holds the real author. Writes go
 * through functions or plain inserts that the database re-checks.
 *
 * Gist writes are mutations, so a signed-out tap goes to /login via the
 * MutationCache gate (lib/query/query-client.ts). Two are NOT gated, both
 * marked `meta: { public: true }`: poll VOTES (through /api/polls/vote) and
 * gist REACTIONS (react_to_gist, 20261124120000). Neither needs an account.
 *
 * The tables postdate the generated types, hence the untyped client.
 */
'use client';

import { useEffect } from 'react';
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

/**
 * The words anyone can react with (20261124120000). One per person per post;
 * picking another switches it. Order is the order they sit under a post.
 */
export const REACTIONS = [
  { key: 'same_here', label: 'Same here' },
  { key: 'co_ask', label: 'I co ask' },
  { key: 'facts', label: 'Facts' },
  { key: 'lol', label: 'Lol' },
  { key: 'wahala', label: 'Wahala' },
  { key: 'thanks', label: 'Thanks' },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]['key'];

export interface GistPost {
  id: string;
  authorName: string;
  kind: GistKind;
  body: string;
  createdAt: string;
  /** Count per word; words nobody picked are absent. */
  reactions: Partial<Record<ReactionKind, number>>;
  /** This visitor's word - by account when signed in, else by this device. */
  myReaction: ReactionKind | null;
  mine: boolean;
}

/** Live posts: last 24h, newest 50 for the campus. `limit` 20 by default. */
export function useGistFeed(campusId: string | null, limit = 20) {
  const { userId } = useSession();
  return useQuery({
    queryKey: ['gist', 'feed', campusId, limit, userId],
    enabled: !!campusId,
    queryFn: async (): Promise<GistPost[]> => {
      // The device id lets a signed-out visitor see which word they picked.
      const { data, error } = await db().rpc('gist_feed', {
        p_campus: campusId,
        p_limit: limit,
        p_device: deviceId() ?? null,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        authorName: r.author_name as string,
        kind: r.kind as GistKind,
        body: r.body as string,
        createdAt: r.created_at as string,
        reactions: (r.reactions ?? {}) as Partial<Record<ReactionKind, number>>,
        myReaction: (r.my_reaction as ReactionKind | null) ?? null,
        mine: Boolean(r.mine),
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Live: refetch the feed the moment anyone on this campus posts or reacts.
 *
 * Listens for the database's broadcast on 'gist:<campus>' (20261124150000).
 * The event carries NO data - who wrote or reacted never leaves gist_feed() -
 * it only says "refetch now". NOT lib/query/use-realtime.ts: that one is
 * postgres_changes, which needs SELECT on the table, and nobody has it here.
 *
 * Bursts are coalesced over 300ms, so ten quick reactions cost one refetch per
 * viewer instead of ten. The 60s poll in useGistFeed stays as the backstop for
 * a dropped socket.
 */
export function useGistLive(campusId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!campusId) return;
    const supabase = createClient();
    const topic = `gist:${campusId}`;
    // channel() is get-or-create: a channel left on this topic by a remount
    // (React StrictMode in dev) would make .on() throw after subscribe().
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${topic}`) void supabase.removeChannel(c);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase
      .channel(topic)
      .on('broadcast', { event: 'changed' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }), 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [campusId, qc]);
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

/**
 * React with a word, switch to another, or tap the same word to take it back.
 * NO ACCOUNT NEEDED: anyone may react, so this skips the sign-in gate. The
 * database counts a signed-out visitor by this device's id.
 *
 * Optimistic: the chip moves the moment it is tapped and the server's answer
 * settles it, because waiting a round trip on campus data feels broken.
 */
export function useReactToGist() {
  const qc = useQueryClient();
  return useMutation({
    meta: { public: true },
    mutationFn: async ({ postId, kind }: { postId: string; kind: ReactionKind }) => {
      const { error } = await db().rpc('react_to_gist', {
        p_post: postId,
        p_kind: kind,
        p_device: deviceId() ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ postId, kind }) => {
      await qc.cancelQueries({ queryKey: ['gist', 'feed'] });
      const before = qc.getQueriesData<GistPost[]>({ queryKey: ['gist', 'feed'] });
      qc.setQueriesData<GistPost[]>({ queryKey: ['gist', 'feed'] }, (posts) =>
        posts?.map((p) => {
          if (p.id !== postId) return p;
          const counts = { ...p.reactions };
          if (p.myReaction) counts[p.myReaction] = Math.max(0, (counts[p.myReaction] ?? 1) - 1);
          const next = p.myReaction === kind ? null : kind;
          if (next) counts[next] = (counts[next] ?? 0) + 1;
          return { ...p, reactions: counts, myReaction: next };
        }),
      );
      return { before };
    },
    onError: (_err, _vars, ctx) => ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
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
