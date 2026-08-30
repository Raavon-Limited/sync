/**
 * ROUTE: /hostels/[slug]
 * ACCESS: public to browse; signing in is required to book or message.
 * PURPOSE: Hostel detail + booking flow. Gallery, amenities, rooms, and the two
 *          actions that matter — request a room, or ask the landlord first.
 *
 * The shell stays a server component so metadata renders on the server; the
 * detail itself is a client island reading hostels + hostel_availability.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { fetchHostelBySlug } from '@/modules/hostels/queries';
import { HostelDetail } from './(components)/hostel-detail';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hostel = await fetchHostelBySlug(await createClient(), slug);
  return { title: hostel ? `${hostel.name} — ${hostel.area}` : 'Hostel' };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return (
    <section className="flex flex-col gap-3">
      <HostelDetail slug={slug} />
    </section>
  );
}
