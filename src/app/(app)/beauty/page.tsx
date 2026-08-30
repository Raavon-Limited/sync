/**
 * ROUTE: /beauty
 * ACCESS: public to browse; signing in is required to request.
 * PURPOSE: Browse beauty services and send a request to a vendor.
 *
 * All three service verticals share one browser — see
 * components/services/services-browser. The vertical is the only difference.
 */
import type { Metadata } from 'next';
import { ServicesBrowser } from '@/components/services/services-browser';

export const metadata: Metadata = { title: 'Beauty' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <ServicesBrowser vertical="beauty" />
    </section>
  );
}
