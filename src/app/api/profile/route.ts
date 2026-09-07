/**
 * ROUTE: /api/profile  (Route Handler - server)
 * The security boundary for client-side profile reads/writes. Clients hit this
 * via RTK Query (src/store/api/profile-api) instead of touching Supabase.
 *
 * Why this is the secure path:
 *   - Auth is verified server-side with `getUser()` (network-verified, not the
 *     spoofable cookie session), and every query is scoped to that user's id.
 *   - The session-bound Supabase client is used, so RLS still applies (defense
 *     in depth) - we are NOT using the service-role key here.
 *   - PATCH whitelists editable columns, so a crafted request can't change
 *     server-trusted fields (role, verification_status, archived_at, …).
 *
 * Route Handlers aren't cached for non-GET, and GET here reads per-user data so
 * it's dynamic by default.
 */
import { createClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';
import type { Database } from '@/types/database.types';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * Columns a user is allowed to change about themselves.
 *
 * The `satisfies` clause ties this whitelist to the generated schema, so
 * renaming or dropping either column upstream fails the build here rather than
 * silently no-op'ing a security boundary.
 */
const UPDATABLE = [
  'full_name',
  'phone',
  'avatar_url',
] as const satisfies readonly (keyof ProfileUpdate)[];

/**
 * Whether this account still has a name to set.
 *
 * `full_name` is SET ONCE: blank may be filled in, a name that exists may not
 * be replaced, because it is the string a reviewer held against a government
 * ID. Enforced in the database by guard_profile_privileged_cols
 * (20260905180000)   this is the same rule stated where the request arrives,
 * so somebody gets a sentence back instead of a silent no-op.
 */
function nameIsUnset(current: { full_name?: string | null } | null): boolean {
  const name = current?.full_name;
  return typeof name !== 'string' || name.trim() === '';
}

/**
 * An avatar may only point into THIS project's own public-media bucket.
 *
 * The column is rendered wherever the account's name appears, so an arbitrary
 * URL here is an off-site image request made by every viewer of that name: a
 * tracking pixel with a guaranteed audience, and a way to make Sync's UI fetch
 * from a host we do not control. Uploads already land at exactly this prefix
 * (uploadVendorImage → getPublicUrl), so honest clients never notice the rule.
 *
 * Checked as a parsed URL, not a `startsWith` on the raw string: `startsWith`
 * would accept `https://evil.test/?x=<our-prefix>` in a query string and,
 * worse, would still pass a value carrying a newline or a control character.
 */
function isOwnStorageUrl(value: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const url = new URL(value);
    const origin = new URL(base);
    return (
      url.protocol === 'https:' &&
      url.host === origin.host &&
      url.pathname.startsWith('/storage/v1/object/public/public-media/')
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    return Response.json(
      { error: userMessage(error, 'We could not load your profile.') },
      { status: 500 },
    );
  }

  return Response.json(data ?? null);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The name they already have, so a PATCH that names `full_name` can be
  // answered honestly. The database reverts it either way (20260905180000);
  // reading it here is what turns a silent no-op into a sentence.
  const { data: current } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const canSetName = nameIsUnset(current);

  // Whitelist: silently drop anything that isn't user-editable. This is what
  // stops a client from escalating role / forcing verification_status.
  //
  // Values are narrowed as well as keys: these columns are text, so anything
  // that isn't a string (or an explicit null to clear it) is dropped rather
  // than forwarded. A cast here would type-check and still let a number or an
  // object through to the database.
  const patch: ProfileUpdate = {};
  for (const key of UPDATABLE) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value !== null && typeof value !== 'string') continue;

    if (key === 'full_name' && !canSetName) {
      // Refused rather than dropped. A form that silently discards a field it
      // showed as editable is how somebody comes to believe they changed
      // their name and finds out later, from a card, that they did not.
      return Response.json(
        {
          error:
            'Your name is checked against your ID, so it cannot be changed here. Contact support if it is wrong.',
        },
        { status: 400 },
      );
    }

    if (key === 'avatar_url') {
      // '' is how the client says "remove my picture"; stored as NULL so the
      // fallback initial is chosen by `?? null` everywhere and not by a truthy
      // test on an empty string.
      const url = typeof value === 'string' ? value.trim() : null;
      if (!url) {
        patch.avatar_url = null;
        continue;
      }
      if (!isOwnStorageUrl(url)) {
        return Response.json(
          { error: 'A profile picture must be one you uploaded to Sync.' },
          { status: 400 },
        );
      }
      patch.avatar_url = url;
      continue;
    }

    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) {
    return Response.json(
      { error: userMessage(error, 'We could not save your profile.') },
      { status: 500 },
    );
  }

  return Response.json(data);
}
