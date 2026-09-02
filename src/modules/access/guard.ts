/**
 * Asking the database what the caller may do, and acting on the answer.
 *
 * THE DATABASE ANSWERS, NOT THIS MODULE
 *   `access_level` resolves the union of every role held, handles the super
 *   admin bypass, and knows that a branch owner is not staff of their own
 *   branch. Recomputing any of that here would be a second implementation to
 *   keep in step   and the one that could be skipped, because a request that
 *   never renders a page never runs this file.
 *
 * A PAGE GUARD IS NOT ACCESS CONTROL
 *   It decides what to render. Every action still re-checks, and the RPCs check
 *   again inside the database. Three layers because the outer two are
 *   convenience and only the innermost one is enforcement.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { AccessLevel, AccessScope } from './areas';

type LevelRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * REGENERATE THE TYPES once 20260902130000 is applied and these casts can go.
 * Narrow on purpose: they return only what this module reads.
 */
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const supabase = await createServerClient();
  const call = supabase.rpc.bind(supabase) as unknown as LevelRpc;
  return call(name, args);
}

/** What the caller may do in one area. Never throws; 'none' is a real answer. */
export async function accessLevel(area: string, storefrontId?: string): Promise<AccessLevel> {
  const { data, error } = await rpc('access_level', {
    p_area: area,
    ...(storefrontId ? { p_storefront: storefrontId } : {}),
  });
  if (error) return 'none';
  return (data as AccessLevel) ?? 'none';
}

/**
 * Every area the caller can reach, as a map.
 *
 * A super admin comes back as the single wildcard `*`, so the caller compares
 * against its own list rather than the database having to know what the full
 * set of areas is   that list lives in areas.ts.
 */
export async function accessMap(storefrontId?: string): Promise<Record<string, AccessLevel>> {
  const { data, error } = await rpc('my_access', {
    ...(storefrontId ? { p_storefront: storefrontId } : {}),
  });
  if (error || !Array.isArray(data)) return {};

  const map: Record<string, AccessLevel> = {};
  for (const row of data as { area: string; level: AccessLevel }[]) {
    map[row.area] = row.level;
  }
  return map;
}

/** True when the map came from a super admin   everything, without enumerating it. */
export function isWildcard(map: Record<string, AccessLevel>): boolean {
  return map['*'] === 'write';
}

export function levelFrom(map: Record<string, AccessLevel>, area: string): AccessLevel {
  if (isWildcard(map)) return 'write';
  return map[area] ?? 'none';
}

/**
 * The area keys the caller can at least open, or null for "no restriction".
 *
 * Null is not "no access"   it is the answer for a super admin (who bypasses
 * grants entirely) and for every dashboard that is not the console, where what
 * you can see is decided by whose dashboard it is rather than by a grant. The
 * sidebar treats null as "show every row", so passing it is how a screen opts
 * out of filtering rather than accidentally hiding itself.
 *
 * An admin with no roles gets `[]`, and their console is correctly almost
 * empty. That is a real state   somebody appointed but not yet given a job  
 * and it should look like one rather than like a broken page.
 */
export async function visibleAreas(): Promise<string[] | null> {
  const map = await accessMap();
  if (isWildcard(map)) return null;
  return Object.keys(map);
}

/**
 * Guard a page. Redirects to /403 rather than rendering something the person
 * cannot use, and returns the level so the page can hide its own controls when
 * the answer is read-only.
 */
export async function requireArea(
  area: string,
  needed: 'read' | 'write' = 'read',
  storefrontId?: string,
): Promise<AccessLevel> {
  const level = await accessLevel(area, storefrontId);
  if (level === 'none') redirect('/403');
  if (needed === 'write' && level !== 'write') redirect('/403');
  return level;
}

/**
 * Guard an action. Throws rather than redirects   an action has no page to send
 * anybody to, and the message is shown by the form that called it.
 */
export async function assertArea(
  area: string,
  needed: 'read' | 'write' = 'write',
  storefrontId?: string,
): Promise<void> {
  const level = await accessLevel(area, storefrontId);
  if (level === 'none' || (needed === 'write' && level !== 'write')) {
    throw new Error('You do not have access to do that');
  }
}

export type { AccessLevel, AccessScope };
