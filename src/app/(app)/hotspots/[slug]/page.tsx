/**
 * ROUTE: /hotspots/[slug]
 * ACCESS: public
 * PURPOSE: One hotspot — photo, hours, address and directions.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { fetchHotspotBySlug } from '@/modules/hotspots/queries';
import { HotspotDetail } from './(components)/hotspot-detail';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const h = await fetchHotspotBySlug(await createClient(), slug);
  return { title: h?.name ?? 'Hotspot' };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return (
    <section className="flex flex-col gap-3">
      <HotspotDetail slug={slug} />
    </section>
  );
}
