/**
 * ROUTE: /workmanship
 * ACCESS: public to browse; signing in is required to request.
 * PURPOSE: Browse workmanship services and send a request to a vendor.
 *
 * All three service verticals share one browser — see
 * components/services/services-browser. The vertical is the only difference.
 */
import type { Metadata } from 'next';
import { ServicesBrowser } from '@/components/services/services-browser';

export const metadata: Metadata = { title: 'Workmanship' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <ServicesBrowser vertical="workmanship" />
    </section>
  );
}
