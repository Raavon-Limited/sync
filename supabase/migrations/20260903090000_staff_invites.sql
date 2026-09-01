-- ============================================================================
-- staff_invites
--
-- Inviting somebody into the console who does not have a Sync account yet.
--
-- WHAT THIS REPLACES
--   /admin/staff could only ever say "give admin access to an address that
--   already has an account". Hiring a document reviewer therefore went: ask
--   them to sign up as a student, wait, ask which address they used, then
--   promote them. Three steps, two of them outside the product, and the middle
--   one is where it stalled.
--
--   The other half of it is roles. `set_account_role` grants the console; it
--   knows nothing about WHICH screens. An invite carries the role, so the
--   person arrives as a Reviewer rather than arriving as an administrator and
--   being narrowed afterwards -- a window that lasted as long as somebody took
--   to notice.
--
-- THE TOKEN IS THE PROOF OF MAILBOX CONTROL
--   Exactly the reasoning in 20260822130000 for storefront invites, and the
--   redemption path is deliberately the same shape: the token was mailed to
--   one address and nowhere else, so presenting it demonstrates control of
--   that mailbox. That is what makes creating the account with
--   `email_confirm: true` sound, and why this table is re-read at redemption
--   rather than trusting anything the client sends alongside the token.
--
-- NO PASSWORD IS EVER EMAILED. The recipient sets their own on the way in.
--
-- ONLY A SUPER ADMIN INVITES
--   Same boundary as create_access_role and set_account_role: anyone who can
--   hand out console access can hand themselves anything. An admin -- even one
--   granted `staff` write -- can read the list and nothing else.
--
-- ROLLBACK
--   drop function if exists public.accept_staff_invite(text);
--   drop function if exists public.revoke_staff_invite(uuid);
--   drop function if exists public.create_staff_invite(text, uuid);
--   drop table if exists public.staff_invites;
-- ============================================================================

create table if not exists public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- The role they land in. Nullable: inviting somebody before deciding what
  -- they will do is a real thing to want, and it grants nothing on its own --
  -- they arrive as an admin with an empty console until a role is assigned.
  role_id     uuid references public.access_roles (id) on delete set null,
  -- 64 hex characters from two v4 UUIDs. See 20260822130000 for why this and
  -- not gen_random_bytes: no pgcrypto dependency to verify.
  token       text not null unique
                default replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', ''),
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- One live invite per address. A second would mean two valid tokens for the
-- same mailbox and no way to say which one was cancelled.
create unique index if not exists staff_invites_pending_idx
  on public.staff_invites (lower(email))
  where accepted_at is null and revoked_at is null;

comment on table public.staff_invites is
  'Pending console invitations. The token is the proof of mailbox control and is delivered out of band, by email; the app never selects that column.';

-- === Creating ===============================================================
-- Returns the token exactly once, to the super admin who created it.
create or replace function public.create_staff_invite(
  p_email text,
  p_role  uuid default null
)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid   uuid := (select auth.uid());
begin
  if (select role from public.profiles where id = v_uid) is distinct from 'super_admin' then
    raise exception 'Only a super admin can invite staff' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'That is not a valid email address' using errcode = '22023';
  end if;

  -- A role from another scope would grant nothing and look like it had.
  if p_role is not null then
    if not exists (
      select 1 from public.access_roles r where r.id = p_role and r.scope = 'admin'
    ) then
      raise exception 'That is not a console role' using errcode = '22023';
    end if;
  end if;

  -- Re-inviting an address that has a live invite replaces it rather than
  -- failing on the unique index. The old token stops working, which is what
  -- somebody clicking "invite again" means by it.
  update public.staff_invites
     set revoked_at = now()
   where lower(email) = v_email
     and accepted_at is null
     and revoked_at is null;

  return query
  insert into public.staff_invites (email, role_id, invited_by)
  values (v_email, p_role, v_uid)
  returning staff_invites.id, staff_invites.token;
end;
$fn$;

revoke all on function public.create_staff_invite(text, uuid) from public, anon;
grant execute on function public.create_staff_invite(text, uuid) to authenticated, service_role;

-- === Revoking ===============================================================
create or replace function public.revoke_staff_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select role from public.profiles where id = (select auth.uid()))
     is distinct from 'super_admin' then
    raise exception 'Only a super admin can cancel an invite' using errcode = '42501';
  end if;

  update public.staff_invites
     set revoked_at = now()
   where id = p_id and accepted_at is null and revoked_at is null;
end;
$fn$;

revoke all on function public.revoke_staff_invite(uuid) from public, anon;
grant execute on function public.revoke_staff_invite(uuid) to authenticated, service_role;

-- === Accepting ==============================================================
-- Runs as the person joining, once they have a session. It grants the console
-- role and the access role in one statement, so there is no moment where
-- somebody is an unrestricted admin waiting to be narrowed.
--
-- THE CONFIRMED-EMAIL CHECK IS THE POINT. A forwarded link is useless without
-- control of the invited mailbox, because the session accepting it must BE
-- that address.
create or replace function public.accept_staff_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_invite public.staff_invites%rowtype;
  v_email  text;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into v_invite from public.staff_invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite was cancelled' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = 'P0001';
  end if;

  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null or v_email is distinct from lower(v_invite.email) then
    raise exception 'This invite was sent to %, so it has to be accepted by that account.',
      v_invite.email using errcode = '42501';
  end if;

  -- A super admin accepting an invite must not be demoted to 'admin' by it.
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'super_admin' then
    update public.profiles
       set role  = 'admin',
           roles = (
             select array(
               select distinct unnest(coalesce(roles, array[]::text[]) || array['admin'])
             )
           )
     where id = v_uid;
  end if;

  if v_invite.role_id is not null then
    insert into public.access_members (role_id, user_id, granted_by)
    values (v_invite.role_id, v_uid, v_invite.invited_by)
    on conflict (role_id, user_id) do nothing;
  end if;

  update public.staff_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'staff.invite_accepted', 'profile', v_uid::text,
          '{}'::jsonb, jsonb_build_object('invited_by', v_invite.invited_by));

  return 'ok';
end;
$fn$;

revoke all on function public.accept_staff_invite(text) from public, anon;
grant execute on function public.accept_staff_invite(text) to authenticated, service_role;

-- === RLS ====================================================================
alter table public.staff_invites enable row level security;

-- Staff can see who has been invited. Postgres has no column-level select
-- policy, so the token is kept out of reach by the application never selecting
-- it -- see getStaffInvites, which names its columns for that reason. Writes go
-- through the functions above, which is why there is no write policy at all.
drop policy if exists "staff_invites_read" on public.staff_invites;
create policy "staff_invites_read" on public.staff_invites
  for select to authenticated
  using (public.is_staff());

revoke all on public.staff_invites from anon;
grant select on public.staff_invites to authenticated;

-- === Verify =================================================================
do $$
begin
  if to_regclass('public.staff_invites') is null then
    raise exception 'staff_invites missing';
  end if;
  if to_regprocedure('public.create_staff_invite(text, uuid)') is null then
    raise exception 'create_staff_invite missing';
  end if;
  if to_regprocedure('public.accept_staff_invite(text)') is null then
    raise exception 'accept_staff_invite missing';
  end if;
  if has_function_privilege('anon', 'public.create_staff_invite(text, uuid)', 'execute') then
    raise exception 'create_staff_invite is executable by anon -- it must not be';
  end if;
end $$;
