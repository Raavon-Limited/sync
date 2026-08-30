/**
 * ROUTE: /events/[slug]
 * ACCESS: public
 * PURPOSE: Event detail — poster, when, where, and its ticket tiers.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { fetchEventBySlug } from '@/modules/events/queries';
import { EventDetail } from './(components)/event-detail';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await fetchEventBySlug(await createClient(), slug);
  return { title: e?.name ?? 'Event' };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return (
    <section className="flex flex-col gap-3">
      <EventDetail slug={slug} />
    </section>
  );
}
