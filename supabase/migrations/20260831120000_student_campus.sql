-- ============================================================================
-- STUDENT CAMPUS - which institution a student belongs to, and where it is.
-- ============================================================================
-- Signup asked students nothing about their campus, so every student was
-- implicitly "the one campus we serve". That holds until the second campus
-- opens, at which point there is no way to tell existing students apart and no
-- backfill that can recover it - the information was never collected.
--
-- EXTENDS `campuses`, DOES NOT ADD A `schools` TABLE.
--   public.campuses already exists (20260817090000_identity_roles), is already
--   seeded with KWASU, already has a world-readable RLS policy, and is already
--   referenced by vendor_profiles.campus_id. A parallel `schools` table would
--   have been a second list of the same institutions that has to agree with the
--   first by hand - precisely the failure the areas migration was written to
--   undo. `code` is already the short form students say out loud ('KWASU'), so
--   nothing new is needed for that either.
--
-- WHAT IS ACTUALLY MISSING is location. The point of asking a student for their
-- campus is to know WHERE they are, so the address and coordinates hang off the
-- campus row - stored once - rather than being typed by every student who
-- enrols.
--
-- ROLLBACK
--   alter table public.profiles drop column if exists campus_id;
--   alter table public.campuses
--     drop column if exists address, drop column if exists area,
--     drop column if exists lat, drop column if exists lng,
--     drop column if exists sort_order;
-- ============================================================================

alter table public.campuses
  -- The campus address, stored ONCE. A student picks a campus and the address
  -- follows, rather than being asked for and mistyped.
  add column if not exists address    text,
  -- Which service area the campus sits in. Nullable, ON DELETE SET NULL: a
  -- campus outside every area we serve is a real state - it is how expansion
  -- starts - not an error.
  add column if not exists area       text references public.areas (name)
                                        on update cascade on delete set null,
  add column if not exists lat        double precision check (lat between -90 and 90),
  add column if not exists lng        double precision check (lng between -180 and 180),
  -- Display order in the signup picker, like areas.sort_order.
  add column if not exists sort_order integer not null default 0;

-- Locate the campus we already serve. Coordinates match the KWASU Gate area
-- anchor from 0007_areas, which was geocoded against OSM.
update public.campuses
   set address    = coalesce(address, 'Kwara State University, Malete Road, Moro, Kwara State'),
       area       = coalesce(area, 'KWASU Gate'),
       lat        = coalesce(lat, 8.7180),
       lng        = coalesce(lng, 4.4799),
       sort_order = 1
 where code = 'KWASU';

-- The campuses on the roadmap in the landing FAQ, seeded INACTIVE so they are
-- ready to switch on with an UPDATE rather than a deploy, and cannot be picked
-- before we serve them. The RLS policy filters on is_active, so they are not
-- even readable until then.
insert into public.campuses (code, name, state, address, sort_order, is_active) values
  ('UNILORIN',  'University of Ilorin',    'Kwara',
   'University of Ilorin, Ilorin, Kwara State', 2, false),
  ('ALHIKMAH',  'Al-Hikmah University',    'Kwara',
   'Al-Hikmah University, Adeta Road, Ilorin, Kwara State', 3, false),
  ('KWARAPOLY', 'Kwara State Polytechnic', 'Kwara',
   'Kwara State Polytechnic, Ilorin, Kwara State', 4, false)
on conflict (code) do nothing;

create index if not exists campuses_active_order_idx
  on public.campuses (is_active, sort_order);

-- The student's campus. Nullable because every EXISTING profile predates this
-- column and there is no honest value to backfill - null means "never asked",
-- which is true, and is not the same as "declined to say".
alter table public.profiles
  add column if not exists campus_id uuid
  references public.campuses (id) on delete set null;

create index if not exists profiles_campus_idx on public.profiles (campus_id);

-- ---------------------------------------------------------------------------
-- Carry campus_id through signup.
--
-- handle_new_user() builds the profile from raw_user_meta_data on insert into
-- auth.users. Without this the picker would collect a campus and silently drop
-- it: the profile row is created by the TRIGGER, not by the app, so anything
-- the trigger does not read does not exist.
--
-- The cast is guarded. raw_user_meta_data is user-controlled JSON, so junk must
-- not abort the signup transaction - a malformed uuid resolves to null (no
-- campus) and the account is still created. The lookup also requires the campus
-- to be ACTIVE, so a well-formed id for a campus we do not serve yet is
-- rejected rather than trusted.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role     text := new.raw_user_meta_data ->> 'role';
  claimed_category text := nullif(new.raw_user_meta_data ->> 'vendor_category', '');
  claimed_campus   text := nullif(new.raw_user_meta_data ->> 'campus_id', '');
  resolved_role    text;
  resolved_campus  uuid;
begin
  if claimed_role in ('vendor', 'landlord') then
    resolved_role := case when claimed_category = 'landlord' then 'landlord' else 'vendor' end;
  else
    resolved_role := 'student';
  end if;

  -- Only students carry a campus here, and only one that really exists and is
  -- switched on.
  if resolved_role = 'student' and claimed_campus is not null then
    begin
      select id into resolved_campus
      from public.campuses
      where id = claimed_campus::uuid and is_active;
    exception when invalid_text_representation then
      resolved_campus := null;
    end;
  end if;

  insert into public.profiles (
    id, role, full_name, phone, vendor_category, trade,
    business_name, sells, business_address, campus_id
  )
  values (
    new.id,
    resolved_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    claimed_category,
    nullif(new.raw_user_meta_data ->> 'trade', ''),
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'sells',
    new.raw_user_meta_data ->> 'business_address',
    resolved_campus
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on column public.campuses.address is
  'Campus address, stored once so a student picks a campus rather than typing an address. Roadmap campuses are seeded inactive; activate with an UPDATE, not a deploy.';
