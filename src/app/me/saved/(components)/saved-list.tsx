/**
 * Everything the student has saved, across five different tables.
 *
 * WHY THIS NEEDS SIX QUERIES AND NOT ONE
 *   `favorites` stores only (entity_type, entity_id)   no denormalised title or
 *   image. That is the right call for a join table: a saved listing whose price
 *   changed should show the NEW price, and a copy would go stale the moment the
 *   vendor edited it. The cost is that rendering a save means resolving it
 *   against whichever table it points at.
 *
 *   The types are batched (one `in` per table, not one query per row), so this
 *   is at most five lookups regardless of how many things are saved.
 *
 * A SAVE CAN OUTLIVE WHAT IT POINTS AT
 *   Nothing deletes a favourite when its target is archived, and entity_id has
 *   no foreign key (it is polymorphic). Rows that no longer resolve are dropped
 *   rather than rendered as blanks.
 */
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { ListingCard, EmptyState } from '@/components/shared';
import type { ListingCardData } from '@/components/shared/listing-card';
import { useSession } from '@/providers/session-provider';

const db = () => createClient();

import type { Row } from '@/lib/supabase/row';

/** Where each entity type lives, and how it becomes a card. */
const RESOLVERS: Record<
  string,
  { table: string; select: string; toCard: (r: Row) => ListingCardData }
> = {
  listing: {
    table: 'listings',
    select: 'id, name, category, price_kobo, image_url, storefront_id',
    toCard: (r) => ({
      href: `/food`,
      title: r.name,
      location: r.category ?? undefined,
      image: r.image_url ?? undefined,
      price: r.price_kobo != null ? { amount: r.price_kobo / 100 } : null,
    }),
  },
  vendor: {
    table: 'vendor_profiles',
    select: 'id, business_name, slug, area, logo_url, cover_url, rating_avg, rating_count, verification_status',
    toCard: (r) => ({
      href: `/food/${r.slug}`,
      title: r.business_name ?? 'Vendor',
      location: r.area ?? undefined,
      image: r.cover_url ?? r.logo_url ?? undefined,
      price: null,
      rating: { value: Number(r.rating_avg ?? 0), count: r.rating_count ?? 0 },
      verified: r.verification_status === 'verified',
    }),
  },
  event: {
    table: 'events',
    select: 'id, name, slug, venue, starts_at',
    toCard: (r) => ({
      href: `/events/${r.slug}`,
      title: r.name,
      location: r.venue ?? undefined,
      price: null,
    }),
  },
  service: {
    table: 'services',
    select: 'id, name, vertical, price_kobo, unit_label, pricing_model, image_url',
    toCard: (r) => ({
      href: `/${r.vertical}`,
      title: r.name,
      location: r.vertical ?? undefined,
      image: r.image_url ?? undefined,
      // Quote-priced services have no price by schema constraint.
      price:
        r.pricing_model === 'quote' || r.price_kobo == null
          ? null
          : { amount: r.price_kobo / 100, unit: r.unit_label ?? undefined },
    }),
  },
  hotspot: {
    table: 'hotspots',
    select: 'id, name, slug, area, cover_url',
    toCard: (r) => ({
      href: `/hotspots/${r.slug}`,
      title: r.name,
      location: r.area ?? undefined,
      image: r.cover_url ?? undefined,
      price: null,
    }),
  },
};

export function SavedList() {
  const { isAuthenticated } = useSession();

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['favorites', 'resolved'],
    enabled: isAuthenticated,
    queryFn: async (): Promise<ListingCardData[]> => {
      const client = db();
      // RLS scopes favorites to the caller, so no user filter is needed here.
      const { data: favs, error } = await client
        .from('favorites')
        .select('entity_type, entity_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!favs?.length) return [];

      const byType = new Map<string, string[]>();
      for (const f of favs) {
        if (!RESOLVERS[f.entity_type]) continue;
        byType.set(f.entity_type, [...(byType.get(f.entity_type) ?? []), f.entity_id]);
      }

      const resolved = new Map<string, ListingCardData>();
      // The generated client types `from()` and `select()` as literal unions,
      // which cannot express "whichever table this favourite points at". The
      // cast is confined to this one polymorphic lookup; every row that comes
      // back is narrowed by its own resolver on the way out.
      const dynamic = client as unknown as {
        from: (t: string) => {
          select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: Row[] | null }> };
        };
      };

      await Promise.all(
        [...byType.entries()].map(async ([type, ids]) => {
          const r = RESOLVERS[type];
          const { data } = await dynamic.from(r.table).select(r.select).in('id', ids);
          for (const row of data ?? []) {
            resolved.set(`${type}:${row.id}`, r.toCard(row));
          }
        }),
      );

      // Preserve save order, and drop anything that no longer resolves.
      return favs
        .map((f) => resolved.get(`${f.entity_type}:${f.entity_id}`))
        .filter((c): c is ListingCardData => !!c);
    },
  });

  const content = useMemo(() => {
    if (!isAuthenticated) {
      return <p className="text-content-muted text-sm">Sign in to see what you have saved.</p>;
    }
    if (isLoading) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      );
    }
    if (!cards.length) {
      return (
        <EmptyState
          title="Nothing saved yet"
          description="Tap the heart on a hostel, vendor or event and it will show up here."
        />
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <ListingCard key={`${c.href}-${i}`} {...c} />
        ))}
      </div>
    );
  }, [isAuthenticated, isLoading, cards]);

  return content;
}
