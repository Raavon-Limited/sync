-- ============================================================================
-- STUDENT CAMPUS - which institution a student attends, and whether we are
-- there yet.
-- ============================================================================
-- Signup asked students nothing about their campus, so every student was
-- implicitly "the one campus we serve". That holds until the second campus
-- opens, at which point there is no way to tell existing students apart and no
-- backfill that can recover it - the information was never collected.
--
-- EXTENDS `campuses`, DOES NOT ADD A `schools` TABLE.
--   public.campuses already exists (20260817090000_identity_roles), is already
--   seeded with KWASU, already has a world-readable RLS policy, and is already
--   referenced by vendor_profiles.campus_id. A parallel table would have been a
--   second list of the same institutions to keep in sync by hand - precisely
--   the failure the areas migration was written to undo.
--
-- TWO DIFFERENT BOOLEANS, and conflating them is the mistake to avoid:
--   is_active   - the row is real and selectable. TRUE for every university
--                 here, because a student must be able to find their own school
--                 whether or not we operate there.
--   is_serviced - Sync actually runs at this campus. TRUE for KWASU only.
--                 This is what the app reads to decide between "browse" and
--                 "we are not here yet".
--
-- A student at an unserviced campus can still create an account. They are a
-- waiting list with a real signup date and a real campus, which is the only
-- honest way to decide where to open next.
--
-- WHY THIS IS VERSIONED 20260831140000 AND NOT ...120000
--   ...120000 was an earlier, abandoned version of this migration that created
--   a separate `public.schools` table. It was pushed before the approach
--   changed to extending `campuses`. Rewriting the file in place kept the same
--   version number, so the CLI saw ...120000 already applied and reported
--   "Remote database is up to date" while running none of the new SQL - the
--   database kept the schools design and the app expected the campus one.
--
--   A migration that has been applied anywhere is immutable. Change of approach
--   means a NEW version, plus an explicit undo of what the old one did, which
--   is the first section below.
--
-- ROLLBACK
--   alter table public.profiles
--     drop column if exists campus_id, drop column if exists campus_other;
--   alter table public.campuses
--     drop column if exists address, drop column if exists area,
--     drop column if exists lat, drop column if exists lng,
--     drop column if exists sort_order, drop column if exists is_serviced;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Undo the abandoned `schools` design from 20260831120000.
--
-- Safe to drop: nothing in the application ever read it. The picker that would
-- have populated profiles.school_id never worked - it queried campus columns
-- that did not exist yet - so the column holds no answers from any real user,
-- and the table holds nothing but its own seed.
--
-- Guarded with IF EXISTS so this migration is also correct on a database that
-- never saw ...120000 at all.
-- ---------------------------------------------------------------------------
alter table public.profiles drop column if exists school_id;
drop table if exists public.schools;
alter table public.campuses
  -- The campus address, stored ONCE. A student picks a campus and the address
  -- follows, rather than being asked for and mistyped.
  add column if not exists address     text,
  -- Which service area the campus sits in. Nullable, ON DELETE SET NULL: a
  -- campus outside every area we serve is the normal case here.
  add column if not exists area        text references public.areas (name)
                                         on update cascade on delete set null,
  add column if not exists lat         double precision check (lat between -90 and 90),
  add column if not exists lng         double precision check (lng between -180 and 180),
  -- Sort order in the picker. Serviced campuses first (see the index).
  add column if not exists sort_order  integer not null default 100,
  -- Do we operate here? Defaults FALSE: adding a university to this list is not
  -- a claim that Sync runs there, and the default must never quietly say it is.
  add column if not exists is_serviced boolean not null default false;
-- Locate and switch on the launch market. Coordinates match the KWASU Gate area
-- anchor from 0007_areas, which was geocoded against OSM.
update public.campuses
   set address     = coalesce(address, 'Kwara State University, Malete Road, Moro, Kwara State'),
       area        = coalesce(area, 'KWASU Gate'),
       lat         = coalesce(lat, 8.7180),
       lng         = coalesce(lng, 4.4799),
       sort_order  = 1,
       is_serviced = true
 where code = 'KWASU';
-- ---------------------------------------------------------------------------
-- Nigerian universities.
--
-- NOT THE COMPLETE NUC REGISTER. This is a broad, deliberately conservative set
-- of federal, state and major private universities - enough that most students
-- find themselves - and it is a STARTING POINT, not an authority. Top it up
-- from the NUC list with a plain INSERT; no deploy is involved.
--
-- Nothing here is serviced. The signup form accepts a typed university that is
-- not on this list at all (profiles.campus_other), so a gap in this seed can
-- never stop someone signing up - it just means we learn there is demand there.
-- ---------------------------------------------------------------------------
insert into public.campuses (code, name, state, is_active, is_serviced) values
  -- ── Federal ──────────────────────────────────────────────────────────────
  ('UI',        'University of Ibadan',                                'Oyo',        true, false),
  ('UNILAG',    'University of Lagos',                                 'Lagos',      true, false),
  ('ABU',       'Ahmadu Bello University, Zaria',                      'Kaduna',     true, false),
  ('UNN',       'University of Nigeria, Nsukka',                       'Enugu',      true, false),
  ('OAU',       'Obafemi Awolowo University, Ile-Ife',                 'Osun',       true, false),
  ('UNIBEN',    'University of Benin',                                 'Edo',        true, false),
  ('BUK',       'Bayero University, Kano',                             'Kano',       true, false),
  ('UNILORIN',  'University of Ilorin',                                'Kwara',      true, false),
  ('UNIJOS',    'University of Jos',                                   'Plateau',    true, false),
  ('UNICAL',    'University of Calabar',                               'Cross River',true, false),
  ('UNIMAID',   'University of Maiduguri',                             'Borno',      true, false),
  ('UNIPORT',   'University of Port Harcourt',                         'Rivers',     true, false),
  ('UDUSOK',    'Usmanu Danfodiyo University, Sokoto',                 'Sokoto',     true, false),
  ('UNIUYO',    'University of Uyo',                                   'Akwa Ibom',  true, false),
  ('UNIABUJA',  'University of Abuja',                                 'FCT',        true, false),
  ('UNIZIK',    'Nnamdi Azikiwe University, Awka',                     'Anambra',    true, false),
  ('FUTA',      'Federal University of Technology, Akure',             'Ondo',       true, false),
  ('FUTMINNA',  'Federal University of Technology, Minna',             'Niger',      true, false),
  ('FUTO',      'Federal University of Technology, Owerri',            'Imo',        true, false),
  ('FUNAAB',    'Federal University of Agriculture, Abeokuta',         'Ogun',       true, false),
  ('MOUAU',     'Michael Okpara University of Agriculture, Umudike',   'Abia',       true, false),
  ('JOSTUM',    'Joseph Sarwuan Tarka University, Makurdi',            'Benue',      true, false),
  ('MAU',       'Modibbo Adama University, Yola',                      'Adamawa',    true, false),
  ('FUPRE',     'Federal University of Petroleum Resources, Effurun',  'Delta',      true, false),
  ('NDA',       'Nigerian Defence Academy, Kaduna',                    'Kaduna',     true, false),
  ('FUOYE',     'Federal University, Oye-Ekiti',                       'Ekiti',      true, false),
  ('FULAFIA',   'Federal University, Lafia',                           'Nasarawa',   true, false),
  ('FULOKOJA',  'Federal University, Lokoja',                          'Kogi',       true, false),
  ('FUD',       'Federal University, Dutse',                           'Jigawa',     true, false),
  ('FUDMA',     'Federal University, Dutsin-Ma',                       'Katsina',    true, false),
  ('FUKASHERE', 'Federal University, Kashere',                         'Gombe',      true, false),
  ('FUWUKARI',  'Federal University, Wukari',                          'Taraba',     true, false),
  ('FUOTUOKE',  'Federal University, Otuoke',                          'Bayelsa',    true, false),
  ('AE-FUNAI',  'Alex Ekwueme Federal University, Ndufu-Alike',        'Ebonyi',     true, false),
  ('FUBK',      'Federal University, Birnin Kebbi',                    'Kebbi',      true, false),
  ('FUGASHUA',  'Federal University, Gashua',                          'Yobe',       true, false),
  ('FUGUSAU',   'Federal University, Gusau',                           'Zamfara',    true, false),
  -- ── State ────────────────────────────────────────────────────────────────
  ('LASU',      'Lagos State University',                              'Lagos',      true, false),
  ('OOU',       'Olabisi Onabanjo University, Ago-Iwoye',              'Ogun',       true, false),
  ('EKSU',      'Ekiti State University, Ado-Ekiti',                   'Ekiti',      true, false),
  ('AAU',       'Ambrose Alli University, Ekpoma',                     'Edo',        true, false),
  ('DELSU',     'Delta State University, Abraka',                      'Delta',      true, false),
  ('RSU',       'Rivers State University',                             'Rivers',     true, false),
  ('IMSU',      'Imo State University, Owerri',                        'Imo',        true, false),
  ('ABSU',      'Abia State University, Uturu',                        'Abia',       true, false),
  ('ESUT',      'Enugu State University of Science and Technology',    'Enugu',      true, false),
  ('COOU',      'Chukwuemeka Odumegwu Ojukwu University',              'Anambra',    true, false),
  ('NSUK',      'Nasarawa State University, Keffi',                    'Nasarawa',   true, false),
  ('KASU',      'Kaduna State University',                             'Kaduna',     true, false),
  ('KUST',      'Kano University of Science and Technology, Wudil',    'Kano',       true, false),
  ('YSU',       'Yobe State University, Damaturu',                     'Yobe',       true, false),
  ('GSU',       'Gombe State University',                              'Gombe',      true, false),
  ('BASUG',     'Bauchi State University, Gadau',                      'Bauchi',     true, false),
  ('TSU',       'Taraba State University, Jalingo',                    'Taraba',     true, false),
  ('ADSU',      'Adamawa State University, Mubi',                      'Adamawa',    true, false),
  ('BSU',       'Benue State University, Makurdi',                     'Benue',      true, false),
  ('PAAU',      'Prince Abubakar Audu University, Anyigba',            'Kogi',       true, false),
  ('UNIOSUN',   'Osun State University',                               'Osun',       true, false),
  ('LAUTECH',   'Ladoke Akintola University of Technology, Ogbomoso',  'Oyo',        true, false),
  ('TASUED',    'Tai Solarin University of Education, Ijagun',         'Ogun',       true, false),
  ('AAUA',      'Adekunle Ajasin University, Akungba',                 'Ondo',       true, false),
  ('OAUSTECH',  'Olusegun Agagu University of Science and Technology', 'Ondo',       true, false),
  ('CRUTECH',   'Cross River University of Technology',                'Cross River',true, false),
  ('AKSU',      'Akwa Ibom State University',                          'Akwa Ibom',  true, false),
  ('NDU',       'Niger Delta University, Wilberforce Island',          'Bayelsa',    true, false),
  ('IAUE',      'Ignatius Ajuru University of Education',              'Rivers',     true, false),
  ('SSU',       'Sokoto State University',                             'Sokoto',     true, false),
  ('UMYU',      'Umaru Musa Yar''Adua University, Katsina',            'Katsina',    true, false),
  ('KSUSTA',    'Kebbi State University of Science and Technology',    'Kebbi',      true, false),
  ('PLASU',     'Plateau State University, Bokkos',                    'Plateau',    true, false),
  ('IBBU',      'Ibrahim Badamasi Babangida University, Lapai',        'Niger',      true, false),
  ('EBSU',      'Ebonyi State University, Abakaliki',                  'Ebonyi',     true, false),
  ('YUMSUK',    'Yusuf Maitama Sule University, Kano',                 'Kano',       true, false),
  ('BOSU',      'Borno State University, Maiduguri',                   'Borno',      true, false),
  ('ZAMSUT',    'Zamfara State University, Talata Mafara',             'Zamfara',    true, false),
  ('JIGSU',     'Sule Lamido University, Kafin Hausa',                 'Jigawa',     true, false),
  -- ── Private ──────────────────────────────────────────────────────────────
  ('COVENANT',  'Covenant University, Ota',                            'Ogun',       true, false),
  ('BABCOCK',   'Babcock University, Ilishan-Remo',                    'Ogun',       true, false),
  ('ABUAD',     'Afe Babalola University, Ado-Ekiti',                  'Ekiti',      true, false),
  ('LANDMARK',  'Landmark University, Omu-Aran',                       'Kwara',      true, false),
  ('ALHIKMAH',  'Al-Hikmah University, Ilorin',                        'Kwara',      true, false),
  ('BOWEN',     'Bowen University, Iwo',                               'Osun',       true, false),
  ('RUN',       'Redeemer''s University, Ede',                         'Osun',       true, false),
  ('PAU',       'Pan-Atlantic University, Lagos',                      'Lagos',      true, false),
  ('AUN',       'American University of Nigeria, Yola',                'Adamawa',    true, false),
  ('LCU',       'Lead City University, Ibadan',                        'Oyo',        true, false),
  ('CALEB',     'Caleb University, Imota',                             'Lagos',      true, false),
  ('MADONNA',   'Madonna University, Okija',                           'Anambra',    true, false),
  ('IUO',       'Igbinedion University, Okada',                        'Edo',        true, false),
  ('BELLS',     'Bells University of Technology, Ota',                 'Ogun',       true, false),
  ('CRESCENT',  'Crescent University, Abeokuta',                       'Ogun',       true, false),
  ('ELIZADE',   'Elizade University, Ilara-Mokin',                     'Ondo',       true, false),
  ('MTU',       'Mountain Top University, Ibafo',                      'Ogun',       true, false),
  ('NILE',      'Nile University of Nigeria, Abuja',                   'FCT',        true, false),
  ('BAZE',      'Baze University, Abuja',                              'FCT',        true, false),
  ('VERITAS',   'Veritas University, Abuja',                           'FCT',        true, false),
  ('ACU',       'Ajayi Crowther University, Oyo',                      'Oyo',        true, false),
  ('JABU',      'Joseph Ayo Babalola University, Ikeji-Arakeji',       'Osun',       true, false),
  ('ACHIEVERS', 'Achievers University, Owo',                           'Ondo',       true, false),
  ('SALEM',     'Salem University, Lokoja',                            'Kogi',       true, false),
  ('AUGUSTINE', 'Augustine University, Ilara-Epe',                     'Lagos',      true, false),
  -- ── Polytechnics near the launch market ──────────────────────────────────
  -- Students here are as much customers as university students; the list is
  -- named "campuses", not "universities", for this reason.
  ('KWARAPOLY', 'Kwara State Polytechnic, Ilorin',                     'Kwara',      true, false),
  ('FEDPOFFA',  'Federal Polytechnic, Offa',                           'Kwara',      true, false)
on conflict (code) do nothing;
-- Serviced campuses first, then by sort order, then alphabetically. The picker
-- shows where we operate before everywhere else.
create index if not exists campuses_picker_idx
  on public.campuses (is_active, is_serviced desc, sort_order, name);
-- ---------------------------------------------------------------------------
-- The student's campus.
--
-- BOTH columns are nullable and that is not laziness:
--   campus_id    - set when they picked a campus we know
--   campus_other - set when they typed one we do not have. Keeping the raw
--                  string is the point: it is a demand signal for where to
--                  expand, and it means a gap in our seed never blocks a signup.
-- Existing profiles predate both, and "never asked" is the truthful value.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists campus_id    uuid references public.campuses (id) on delete set null,
  add column if not exists campus_other text;
create index if not exists profiles_campus_idx on public.profiles (campus_id);
-- ---------------------------------------------------------------------------
-- Carry the campus through signup.
--
-- handle_new_user() builds the profile from raw_user_meta_data on insert into
-- auth.users. Without this the picker would collect a campus and silently drop
-- it: the profile row is created by the TRIGGER, not the app, so anything the
-- trigger does not read does not exist.
--
-- The cast is guarded. raw_user_meta_data is user-controlled JSON, so junk must
-- not abort the signup transaction - a malformed uuid resolves to null and the
-- account is still created. Note the lookup does NOT require is_serviced: a
-- student at a campus we have not reached yet is exactly who we want to record.
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
  claimed_other    text := nullif(new.raw_user_meta_data ->> 'campus_other', '');
  resolved_role    text;
  resolved_campus  uuid;
begin
  if claimed_role in ('vendor', 'landlord') then
    resolved_role := case when claimed_category = 'landlord' then 'landlord' else 'vendor' end;
  else
    resolved_role := 'student';
  end if;

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
    business_name, sells, business_address, campus_id, campus_other
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
    resolved_campus,
    -- Only keep the free-text campus when it did not resolve to a real row,
    -- so the two columns never disagree about the same student.
    case when resolved_role = 'student' and resolved_campus is null
         then left(claimed_other, 160)
         else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
comment on column public.campuses.is_serviced is
  'Does Sync operate at this campus? Distinct from is_active, which only means the row is selectable. Adding a university here is not a claim that we run there - the app reads THIS to decide between browsing and "we are not here yet".';
comment on column public.profiles.campus_other is
  'A university the student typed that is not in `campuses`. Kept deliberately: it is the demand signal for where to expand, and it means a gap in the seed never blocks a signup.';
