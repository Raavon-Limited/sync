/**
 * Shared plumbing between the Supabase client and TanStack Query.
 *
 * ON TYPES
 * These helpers are deliberately generic over the row shape. The project does
 * not yet check in generated database types   run
 *
 *   npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
 *
 * and then type the four clients in `src/lib/supabase/*` as
 * `createClient<Database>(…)`. Every call below keeps working and starts being
 * checked against the real schema. Until then each module declares the domain
 * shape it expects and maps to it explicitly, which is where the boundary
 * belongs anyway: components should never see snake_case rows.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { userMessage } from '@/lib/errors';

/** What Supabase hands back from `.select()` / `.rpc()`. */
export interface PostgrestResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

/**
 * An error that carries the HTTP status, so `retry` in query-client.ts can tell
 * a 403 (terminal   RLS said no) from a 503 (worth retrying).
 *
 * ITS `message` IS SAFE TO SHOW. This is the error every `unwrap` throws, so it
 * is what reaches `onError: (e) => toast(e.message)` in a few dozen components.
 * Passing PostgREST's prose straight through meant any one of them could put
 * `new row violates row-level security policy for table "orders"` in front of a
 * student. The untouched text is kept on `raw` for logs and debugging.
 */
export class DataError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly hint?: string;
  /** PostgREST's own words. For logs   never for the screen. */
  readonly raw: string;

  constructor(
    error: PostgrestError,
    fallbackStatus = 400,
    fallback = 'Something went wrong. Please try again.',
  ) {
    super(userMessage(error, fallback));
    this.name = 'DataError';
    this.code = error.code;
    this.hint = error.hint ?? undefined;
    this.raw = error.message;
    // PostgREST maps RLS denials to 401/403 and missing rows to 406; the code is
    // the reliable signal, so derive status from it rather than parsing prose.
    this.status = error.code === '42501' ? 403 : error.code === 'PGRST116' ? 404 : fallbackStatus;
  }
}

/** Throw on error, return data. TanStack treats a thrown error as the failure. */
export function unwrap<T>(result: PostgrestResult<T>): T {
  if (result.error) throw new DataError(result.error);
  if (result.data === null) {
    // Not a user's doing and nothing they can act on, so it reads as ours.
    console.error('[query] unwrap() got a null payload with no error');
    throw new Error('We could not load that. Refresh the page and try again.');
  }
  return result.data;
}

/** Like `unwrap`, but a missing row is a legitimate `null` rather than a throw. */
export function unwrapMaybe<T>(result: PostgrestResult<T>): T | null {
  if (result.error) throw new DataError(result.error);
  return result.data;
}

/** Empty array instead of null, so list consumers never branch on nullish. */
export function unwrapList<T>(result: PostgrestResult<T[]>): T[] {
  if (result.error) throw new DataError(result.error);
  return result.data ?? [];
}

// ── Money ──────────────────────────────────────────────────────────────────
// The database stores kobo as bigint; the UI shows Naira. Convert at this
// boundary and nowhere else   a component doing `/ 100` inline is how rounding
// bugs get into totals.

/** 500000 → 5000 (₦). */
export const koboToNaira = (kobo: number): number => Math.round(kobo) / 100;

/** 5000 (₦) → 500000. Rounds, because floats reach here from number inputs. */
export const nairaToKobo = (naira: number): number => Math.round(naira * 100);

/** 500000 → "₦5,000". */
export function formatKobo(kobo: number, opts?: { decimals?: boolean }): string {
  const naira = koboToNaira(kobo);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  }).format(naira);
}

// ── Pagination ─────────────────────────────────────────────────────────────

export interface PageParams {
  /** Zero-based. */
  page?: number;
  pageSize?: number;
}

/** Supabase `.range()` takes inclusive bounds; this converts page → [from, to]. */
export function toRange({ page = 0, pageSize = 20 }: PageParams): [number, number] {
  const from = page * pageSize;
  return [from, from + pageSize - 1];
}
