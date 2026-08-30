-- ============================================================================
-- promotion_campaign_fields
--
-- Adds the two fields the Create Promotion form already collects and had
-- nowhere to store: the campaign KIND and its daily budget.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS
--   The form asked for "Promotion Type" and "Daily Budget (N)", validated both,
--   and then dropped them on the floor - `promotions` had neither column. The
--   vendor sets a budget, the campaign launches, and nothing anywhere records
--   what they agreed to spend. That is indistinguishable from working until
--   somebody asks why billing does not match.
--
--   `discount_type` is NOT the same thing: it is percent-vs-fixed for the
--   discount maths. `promotion_type` is what kind of campaign this is.
--
-- MONEY IS KOBO
--   `daily_budget_kobo bigint`, like every other amount in this schema. The form
--   collects whole Naira and the client converts at the boundary.
--
-- ROLLBACK
--   alter table public.promotions
--     drop column if exists promotion_type,
--     drop column if exists daily_budget_kobo;
-- ============================================================================

alter table public.promotions
  add column if not exists promotion_type text
    check (promotion_type in (
      'Featured Listing', 'Sponsored Product', 'Discount Campaign',
      'Coupon Campaign', 'Flash Sale'
    ));

alter table public.promotions
  add column if not exists daily_budget_kobo bigint
    check (daily_budget_kobo is null or daily_budget_kobo >= 0);

comment on column public.promotions.promotion_type is
  'Campaign kind shown in the vendor UI. Distinct from discount_type, which is the discount maths.';
comment on column public.promotions.daily_budget_kobo is
  'Vendor-set daily spend cap, in kobo. Enforcement lives with billing, not here.';

-- The budget is vendor-set, so unlike redemption_count it is intentionally NOT
-- added to guard_promotion_cols - a vendor may raise or lower their own spend.

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  missing int;
begin
  select count(*) into missing
    from unnest(array['promotion_type', 'daily_budget_kobo']) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'promotions' and column_name = c
   );

  if missing > 0 then
    raise exception '% campaign column(s) missing from promotions', missing;
  end if;

  raise notice 'promotions can record campaign type and daily budget.';
end $$;
