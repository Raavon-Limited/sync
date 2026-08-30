-- ============================================================================
-- campus_pulse
--
-- VOCABULARY: storefront = the business (vendor_profiles); store = one
-- location (public.storefronts). See modules/storefronts/README.md.
--
-- "A log on the student page that lets them see what is happening in other
-- locations." Discovery is location-first — students see the stores near them —
-- and this is the other half: what is going on everywhere else.
--
-- IT IS A READ, NOT A LOG
--   Nothing is stored. Every figure is computed from `orders`, `storefronts`
--   and `storefront_listings` at request time. A log would mean a new table
--   recording who did what and where, a retention policy, and a permanent
--   surface to leak from. A summary computed on read has none of those: there
--   is no row to expose because there is no row.
--
-- WHY NOT REUSE THE TWO LOGS THAT ALREADY EXIST
--   `public.activity_log` is a PERSONAL history keyed by user_id — it is "your"
--   activity, and repurposing it as a public feed would publish exactly the
--   thing it was scoped to hide. `private.audit_log` records actor identity and
--   before/after images and is not readable even by the staff it describes.
--   Neither can become a public feed by widening a policy.
--
-- AGGREGATES CAN STILL IDENTIFY PEOPLE
--   "1 order of pounded yam in Gaa Akanbi in the last hour" is not anonymous on
--   a campus where you know who lives there. So:
--     * trending is suppressed unless at least `pulse_min_cohort` DISTINCT
--       students ordered in that area in the window. Not distinct orders —
--       one student ordering five times is still one person.
--     * busyness is published as a BUCKET, never a count. A vendor's takings
--       are their business, and an exact number is a takings figure.
--     * no user id, name or order id appears anywhere in the output.
--
--   The threshold is a setting rather than a constant because the right number
--   depends on how big the campus is, and it will be wrong at least once.
--
-- ON A QUIET PLATFORM THIS RETURNS ALMOST NOTHING
--   That is correct, not broken. Suppression is the feature working. The UI
--   says so rather than rendering an empty board that looks like a bug.
--
-- ROLLBACK
--   drop function if exists public.campus_pulse();
-- ============================================================================

create or replace function public.campus_pulse()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_min_cohort integer := private.setting_int('pulse_min_cohort', 5);
  v_steady     integer := private.setting_int('pulse_steady_orders', 5);
  v_busy       integer := private.setting_int('pulse_busy_orders', 20);
  v_out        jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  with
  -- Every area that has a live store. Areas with none are not "quiet", they
  -- are simply not places you can order from, and listing them as quiet would
  -- send students somewhere with nothing in it.
  areas as (
    select distinct s.area
      from public.storefronts s
     where s.archived_at is null and s.area is not null
  ),

  -- Open / paused / closed, using the same definition checkout uses.
  stores as (
    select s.area,
           count(*)                                                          as total,
           count(*) filter (where public.store_accepting_orders(s.id))       as open,
           count(*) filter (where s.is_accepting_orders
                              and s.paused_until is not null
                              and s.paused_until > now())                    as on_cooldown,
           count(*) filter (where not s.is_accepting_orders)                 as closed
      from public.storefronts s
     where s.archived_at is null and s.area is not null
     group by s.area
  ),

  -- Stores that appeared in the last fortnight. Public information: a new shop
  -- is a thing you can walk past.
  fresh as (
    select s.area,
           jsonb_agg(jsonb_build_object('name', s.name, 'slug', s.slug)
                     order by s.created_at desc) as j
      from public.storefronts s
     where s.archived_at is null
       and s.area is not null
       and s.created_at > now() - interval '14 days'
     group by s.area
  ),

  -- Paid orders in the last three hours, by area. Used only to pick a bucket.
  recent as (
    select s.area,
           count(*)                        as orders,
           count(distinct o.student_id)    as students
      from public.orders o
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '3 hours'
       and s.area is not null
     group by s.area
  ),

  -- A week of orders, for what people are actually buying.
  week as (
    select s.area, i.name, sum(i.qty) as qty
      from public.order_items i
      join public.orders o      on o.id = i.order_id
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '7 days'
       and s.area is not null
     group by s.area, i.name
  ),
  -- The cohort test is per AREA, not per item: an area with five students
  -- buying five different things still has five people in it, and publishing
  -- its top item does not single any of them out. Counted straight from
  -- orders rather than summed out of `week`, because summing per-item
  -- distinct counts would double-count a student who bought two things.
  area_students as (
    select s.area, count(distinct o.student_id) as students
      from public.orders o
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '7 days'
       and s.area is not null
     group by s.area
  ),
  trending as (
    select w.area,
           jsonb_agg(jsonb_build_object('name', w.name) order by w.qty desc) as j
      from (
        select area, name, qty,
               row_number() over (partition by area order by qty desc) as rn
          from week
      ) w
      join area_students a on a.area = w.area
     where w.rn <= 3
       and a.students >= v_min_cohort
     group by w.area
  )

  select jsonb_agg(
           jsonb_build_object(
             'area',        areas.area,
             'stores',      jsonb_build_object(
                              'total',       coalesce(stores.total, 0),
                              'open',        coalesce(stores.open, 0),
                              'onCooldown',  coalesce(stores.on_cooldown, 0),
                              'closed',      coalesce(stores.closed, 0)
                            ),
             -- A bucket, never a number.
             'busyness',    case
                              when coalesce(recent.orders, 0) >= v_busy   then 'busy'
                              when coalesce(recent.orders, 0) >= v_steady then 'steady'
                              else 'quiet'
                            end,
             'newStores',   coalesce(fresh.j, '[]'::jsonb),
             'trending',    coalesce(trending.j, '[]'::jsonb),
             -- So the UI can say "not enough activity yet" rather than
             -- rendering an empty list that reads as "nobody buys anything".
             'trendingSuppressed',
                            coalesce(trending.j, '[]'::jsonb) = '[]'::jsonb
                              and exists (select 1 from week w2 where w2.area = areas.area)
           )
           order by
             -- Busiest first: the point of the board is where things are
             -- happening, not the alphabet.
             coalesce(recent.orders, 0) desc, areas.area
         )
    into v_out
    from areas
    left join stores    on stores.area = areas.area
    left join fresh     on fresh.area = areas.area
    left join recent    on recent.area = areas.area
    left join trending  on trending.area = areas.area;

  return coalesce(v_out, '[]'::jsonb);
end;
$fn$;

revoke all on function public.campus_pulse() from public, anon;
grant execute on function public.campus_pulse() to authenticated;

comment on function public.campus_pulse() is
  'Per-area summary of stores, busyness, new arrivals and trending items. Computed on read, stores nothing. Trending is suppressed below pulse_min_cohort distinct students in the area, and busyness is bucketed rather than counted, so no figure here identifies a person or publishes a vendor''s takings.';
