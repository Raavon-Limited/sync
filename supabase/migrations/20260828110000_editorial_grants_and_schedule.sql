-- ============================================================================
-- editorial_grants_and_schedule
--
-- `articles_staff` says staff can do anything to public.articles:
--
--   create policy "articles_staff" on public.articles
--     for all to authenticated using (public.is_staff()) ...
--
-- and it has never been able to. The same migration revokes everything from
-- `authenticated` and then grants back only SELECT:
--
--   revoke all on public.articles from anon, authenticated;
--   grant select on public.articles to anon, authenticated;
--
-- A policy cannot hand out a privilege the role does not hold. RLS narrows
-- what a grant already allows; it never widens it. So the policy is dead text:
-- a signed-in admin writing an article through the normal client gets
-- "permission denied for table articles", and the policy above looks like
-- proof that they should not have.
--
-- The same omission covers public.banners, which has an identical staff policy
-- and an identical SELECT-only grant.
--
-- WHY THIS MATTERS WHEN THE ADMIN PAGES USE THE SERVICE ROLE
--   They do, and the service role bypasses both grants and RLS, so
--   /admin/editorial works either way. But a policy that claims to authorise
--   something it cannot is worse than no policy: the next person to write an
--   editorial feature will read `articles_staff`, believe the request-scoped
--   client is enough, and get a permission error with no obvious cause. Making
--   the grant match the policy costs two lines and removes that trap.
--
-- NOT A WIDENING
--   Writes are still gated by `articles_staff` / `banners_staff`, which call
--   is_staff(). A student holds the grant and is refused by the policy, which
--   is the ordinary arrangement everywhere else in this schema.
--
-- AND WHILE WE ARE HERE: SCHEDULING DID NOT MEAN ANYTHING
--   `articles_select_published` reads
--
--     using (status = 'published')
--
--   with no reference to `published_at`. There is no separate 'scheduled'
--   status in the check constraint, so the only way to express "goes live on
--   Friday" is a published row with a future published_at — and that row was
--   world-readable the moment it was saved. The scheduling in /admin/editorial
--   would have been a label on an article anyone could already read.
--
--   `banners_select_live` already gets this right: it checks starts_at and
--   ends_at. This brings articles into line with it.
--
--   `published_at is null` is still allowed through: nothing in the table
--   requires the column, and an article marked published without a date is a
--   published article, not one scheduled for never.
--
-- ROLLBACK
--   revoke insert, update, delete on public.articles from authenticated;
--   revoke insert, update, delete on public.banners  from authenticated;
--   create policy "articles_select_published" on public.articles
--     for select to anon, authenticated using (status = 'published');
-- ============================================================================

grant insert, update, delete on public.articles to authenticated;
grant insert, update, delete on public.banners  to authenticated;
drop policy if exists "articles_select_published" on public.articles;
create policy "articles_select_published" on public.articles
  for select to anon, authenticated
  using (status = 'published' and (published_at is null or published_at <= now()));
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_missing text;
begin
  select string_agg(t.tbl || '.' || t.priv, ', ')
    into v_missing
    from (
      select tbl, priv
        from unnest(array['articles', 'banners']) as tbl
        cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as priv
    ) t
   where not has_table_privilege('authenticated', 'public.' || t.tbl, t.priv);

  if v_missing is not null then
    raise exception 'editorial grants missing: %', v_missing;
  end if;
end $$;
