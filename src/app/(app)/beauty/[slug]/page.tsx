/**
 * ROUTE: /beauty/[slug]
 * ACCESS: public to browse; signing in is required to request.
 * PURPOSE: A beauty pro   who they are and what they offer.
 *
 * All three verticals share one detail component; see
 * components/services/service-vendor-detail.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { fetchServiceVendorBySlug } from '@/modules/services/queries';
import { ServiceVendorDetail } from '@/components/services/service-vendor-detail';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const v = await fetchServiceVendorBySlug(await createClient(), slug);
  return { title: v?.businessName ?? 'Beauty' };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return (
    <section className="flex flex-col gap-3">
      <ServiceVendorDetail slug={slug} vertical="beauty" />
    </section>
  );
}
