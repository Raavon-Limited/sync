/**
 * A service pro's page   who they are and what they offer.
 *
 * ONE COMPONENT, ANY VERTICAL
 *   Same reasoning as ServicesBrowser: beauty, laundry and workmanship share
 *   `modules/services`, so the vertical is a prop rather than three copies.
 *
 * NO PORTFOLIO GALLERY
 *   The route header asks for one. `vendor_profiles` has `logo_url` and
 *   `cover_url` and nothing else   there is no portfolio table, so there are no
 *   images to show. Rendering a placeholder grid would imply the vendor
 *   uploaded work they have not.
 *
 * NO SLOT PICKER
 *   It also asks for a calendar. `service_requests.scheduled_for` is a single
 *   timestamp with no availability model behind it   no working hours, no
 *   existing-booking check, nothing to prevent double-booking. A picker over
 *   that would show slots the vendor never offered. The student proposes a time
 *   in the request instead, and the vendor confirms it.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { MapPin, ShieldCheck, Star, Loader2, Check, MessageCircle, Phone } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useServiceVendor, useServices, useCreateServiceRequest } from '@/modules/services/hooks';
import { useOpenServiceConversation } from '@/modules/messaging/hooks';
import { openChat } from '@/lib/chat-events';
import { useSession } from '@/providers/session-provider';
import type { Service, Vertical } from '@/modules/services/types';

function priceLabel(s: Service) {
  if (s.pricingModel === 'quote' || s.priceKobo == null) return 'Quote on request';
  const naira = `₦${(s.priceKobo / 100).toLocaleString()}`;
  return s.unitLabel ? `${naira} / ${s.unitLabel}` : naira;
}

export function ServiceVendorDetail({ slug, vertical }: { slug: string; vertical: Vertical }) {
  const { isAuthenticated } = useSession();
  const { data: vendor, isLoading, isError } = useServiceVendor(slug);
  const { data: services = [], isLoading: servicesLoading } = useServices(vertical, {
    vendorId: vendor?.id,
  });

  const request = useCreateServiceRequest();
  const openThread = useOpenServiceConversation();
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState('');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-56 w-full animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-6 w-1/3 animate-pulse rounded" />
      </div>
    );
  }
  if (isError || !vendor) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="border-line/10 relative h-56 overflow-hidden rounded-2xl border md:h-72">
        {vendor.coverUrl ?? vendor.logoUrl ? (
          <Image
            src={(vendor.coverUrl ?? vendor.logoUrl)!}
            alt={vendor.businessName}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-sm">
            No photo yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-section text-content">{vendor.businessName}</h1>
            {vendor.isVerified && (
              <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="size-3" /> Verified
              </Badge>
            )}
            {!vendor.isAcceptingOrders && (
              <Badge className="bg-ink/5 text-content-muted">Not taking bookings</Badge>
            )}
          </div>
          {vendor.tagline && <p className="text-content-muted text-sm">{vendor.tagline}</p>}
          <p className="text-content-muted flex items-center gap-1 text-sm">
            <MapPin className="size-4" />
            {vendor.address ?? vendor.area ?? 'Location not given'}
          </p>
          {/* rating_avg is maintained by the reviews trigger; 0 means no reviews
              yet rather than a bad score, so it is only shown when real. */}
          {vendor.ratingCount > 0 && (
            <p className="text-content-muted flex items-center gap-1 text-sm">
              <Star className="size-4" />
              {vendor.ratingAvg.toFixed(1)} · {vendor.ratingCount} review
              {vendor.ratingCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {vendor.publicPhone && (
          <Button asChild variant="outline" className="gap-2">
            <a href={`tel:${vendor.publicPhone}`}>
              <Phone className="size-4" /> Call
            </a>
          </Button>
        )}
      </div>

      {vendor.bio && (
        <section className="flex flex-col gap-2">
          <h2 className="text-content text-lg font-semibold">About</h2>
          <p className="text-content-muted max-w-2xl text-sm leading-relaxed">{vendor.bio}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-content text-lg font-semibold">Services</h2>

        {error && <p className="text-coral text-sm">{error}</p>}

        <label className="flex max-w-xs flex-col gap-1">
          <span className="text-content-muted text-xs">Preferred time (optional)</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(ev) => setWhen(ev.target.value)}
            className="border-line/10 bg-surface-deep text-content rounded-xl border px-3 py-2 text-sm outline-none"
          />
          <span className="text-content-muted text-[11px]">
            A request, not a confirmed slot   the vendor replies to agree a time.
          </span>
        </label>

        {servicesLoading && <div className="bg-ink/5 h-24 animate-pulse rounded-xl" />}

        {!servicesLoading && services.length === 0 && (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            This pro has not listed any {vertical} services yet.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <article key={s.id} className="border-line/10 bg-panel flex flex-col gap-2 rounded-xl border p-4">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-content font-medium">{s.name}</span>
                <span className="text-content font-semibold">{priceLabel(s)}</span>
              </span>
              {s.description && <p className="text-content-muted text-xs">{s.description}</p>}
              {s.durationMins && (
                <p className="text-content-muted text-xs">About {s.durationMins} mins</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  className="flex-1 gap-1"
                  disabled={!isAuthenticated || !vendor.isAcceptingOrders || request.isPending}
                  onClick={() => {
                    setError(null);
                    request.mutate(
                      {
                        vendorId: vendor.id,
                        vertical,
                        serviceId: s.id,
                        scheduledFor: when ? new Date(when).toISOString() : undefined,
                      },
                      {
                        onSuccess: (r) => setRequestedId(r.id),
                        onError: (e) =>
                          setError(e instanceof Error ? e.message : 'Could not send the request'),
                      },
                    );
                  }}
                >
                  {request.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : requestedId ? (
                    <Check className="size-4" />
                  ) : null}
                  {requestedId ? 'Requested' : 'Request'}
                </Button>

                {requestedId && (
                  <Button
                    variant="outline"
                    className="gap-1"
                    disabled={openThread.isPending}
                    onClick={() =>
                      openThread.mutate(requestedId, {
                        onSuccess: (id) => openChat(id),
                        onError: (e) =>
                          setError(e instanceof Error ? e.message : 'Could not open chat'),
                      })
                    }
                  >
                    <MessageCircle className="size-4" />
                    Message
                  </Button>
                )}
              </div>

              {!isAuthenticated && (
                <p className="text-content-muted text-[11px]">Sign in to request this.</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
