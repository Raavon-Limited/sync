-- ============================================================================
-- conversation_counterparties
--
-- PROBLEM
--   The inbox has to answer "who am I talking to", and the answer lives in
--   public.profiles.full_name. 20260814102248_fix_profile_exposure locked that
--   table to `auth.uid() = id`   your own row only   because it also holds
--   phone and business_address, which were once world-readable via the
--   publishable key. That fix is correct and stays.
--
--   The consequence, unnoticed until messaging actually carried traffic: the
--   inbox's embedded `profile:profiles(full_name)` silently returns NULL rather
--   than erroring, so every thread renders with the fallback title
--   "Conversation". A privacy fix and a feature quietly disagreeing.
--
-- WHY A FUNCTION AND NOT A POLICY
--   The obvious fix is an RLS policy: "you may read profiles of people you
--   share a conversation with". But RLS is ROW level   such a policy hands the
--   reader every COLUMN of that row, phone and business_address included. A
--   student messaging a vendor would leak their personal phone number to them.
--   This function discloses exactly three display fields and nothing else,
--   which is the whole point.
--
-- WHAT IT WILL NOT RETURN
--   • rows for conversations the caller is not a member of   enforced by
--     private.is_conversation_member(), the same helper the RLS policies use
--   • the caller's own participant row (they already have their own profile)
--   • any column beyond full_name / business_name / logo_url
--
-- ROLLBACK
--   drop function if exists public.conversation_counterparties(uuid[]);
-- ============================================================================

create or replace function public.conversation_counterparties(
  p_conversation_ids uuid[] default null
)
returns table (
  conversation_id uuid,
  user_id         uuid,
  full_name       text,
  business_name   text,
  logo_url        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cp.conversation_id,
    cp.user_id,
    p.full_name,
    vp.business_name,
    vp.logo_url
  from public.conversation_participants cp
  join public.profiles p
    on p.id = cp.user_id
  -- Vendors have a storefront; students do not. LEFT, so a student
  -- counterparty still comes back with their name.
  left join public.vendor_profiles vp
    on vp.id = cp.user_id
   and vp.archived_at is null
  where
    -- Never the caller: they are not their own counterparty.
    cp.user_id is distinct from (select auth.uid())
    -- Membership, restated because SECURITY DEFINER turned RLS off. Without
    -- this the function would happily enumerate every participant row in the
    -- database and become the exposure it exists to avoid.
    and private.is_conversation_member(cp.conversation_id, (select auth.uid()))
    and (p_conversation_ids is null or cp.conversation_id = any (p_conversation_ids))
$$;

grant execute on function public.conversation_counterparties(uuid[]) to authenticated, service_role;
