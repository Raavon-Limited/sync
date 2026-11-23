/**
 * Client hooks for the public gist feed and campus polls
 * (migration 20261123120000_around_gist_and_polls).
 *
 * The tables postdate the generated types, so these read through an untyped
 * client. Regenerate types after applying the migration and the casts can go.
 *
 * Reads work signed out (the landing is public). Every write is a mutation, so
 * a signed-out tap goes to /login via the MutationCache gate in
 * lib/query/query-client.ts; RLS refuses it anyway.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';

const db = () => createClient() as unknown as SupabaseClient;

export type GistKind = 'gist' | 'alert' | 'event' | 'deal';

export interface GistPost {
  id: string;
  authorName: string;
  kind: GistKind;
  body: string;
  createdAt: string;
  sameHere: number;
  mine: boolean;
  /** Did the viewer tap "Same here"? */
  reacted: boolean;
}

export interface Poll {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

const keys = {
  feed: (campusId: string | null) => ['gist', 'feed', campusId] as const,
  poll: (campusId: string | null) => ['gist', 'poll', campusId] as const,
  results: (pollId: string) => ['gist', 'poll-results', pollId] as const,
  myVote: (pollId: string, userId: string | null) => ['gist', 'my-vote', pollId, userId] as const,
};

/** The latest 30 live posts for a campus. Small on purpose: phones, slow data. */
export function useGistFeed(campusId: string | null) {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...keys.feed(campusId), userId],
    enabled: !!campusId,
    queryFn: async (): Promise<GistPost[]> => {
      const { data, error } = await db()
        .from('gist_posts')
        .select('id, author_id, author_name, kind, body, created_at, gist_reactions(user_id)')
        .eq('campus_id', campusId!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const reactions = (r.gist_reactions ?? []) as { user_id: string }[];
        return {
          id: r.id,
          authorName: r.author_name,
          kind: r.kind,
          body: r.body,
          createdAt: r.created_at,
          sameHere: reactions.length,
          mine: !!userId && r.author_id === userId,
          reacted: !!userId && reactions.some((x) => x.user_id === userId),
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useDropGist(campusId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: GistKind; body: string }) => {
      // author_id, author_name, expiry and word masking are set by the
      // database trigger; nothing the client sends for them is kept.
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
    mutationFn: async ({ postId, on }: { postId: string; on: boolean }) => {
      if (on) {
        const { error } = await db().from('gist_reactions').insert({ post_id: postId });
        if (error && error.code !== '23505') throw new Error(error.message);
      } else {
        const { data: u } = await db().auth.getUser();
        const { error } = await db()
          .from('gist_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', u.user?.id ?? '');
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

export function useReportGist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason?: string }) => {
      const { error } = await db().from('gist_reports').insert({ post_id: postId, reason: reason ?? null });
      // Reporting twice is not an error worth showing.
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

export function useDeleteGist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await db().from('gist_posts').delete().eq('id', postId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gist', 'feed'] }),
  });
}

/** The newest live poll for a campus, or null. */
export function useCampusPoll(campusId: string | null) {
  return useQuery({
    queryKey: keys.poll(campusId),
    enabled: !!campusId,
    queryFn: async (): Promise<Poll | null> => {
      const { data, error } = await db()
        .from('polls')
        .select('id, question, poll_options(id, label, position)')
        .eq('campus_id', campusId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const options = [...((data.poll_options ?? []) as { id: string; label: string; position: number }[])]
        .sort((a, b) => a.position - b.position)
        .map(({ id, label }) => ({ id, label }));
      return { id: data.id, question: data.question, options };
    },
    staleTime: 5 * 60_000,
  });
}

export function usePollResults(pollId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.results(pollId ?? ''),
    enabled: !!pollId && enabled,
    queryFn: async () => {
      const { data, error } = await db().rpc('poll_results', { p_poll: pollId });
      if (error) throw error;
      return new Map(((data ?? []) as { option_id: string; votes: number }[]).map((r) => [r.option_id, Number(r.votes)]));
    },
  });
}

/** The option the viewer picked, or null. Null while signed out. */
export function useMyVote(pollId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.myVote(pollId ?? '', userId),
    enabled: !!pollId && !!userId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', pollId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.option_id as string | undefined) ?? null;
    },
  });
}

export function useVote(pollId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (optionId: string) => {
      const { error } = await db().from('poll_votes').insert({ poll_id: pollId, option_id: optionId });
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gist', 'poll-results'] });
      qc.invalidateQueries({ queryKey: ['gist', 'my-vote'] });
    },
  });
}
