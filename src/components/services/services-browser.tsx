/**
 * Browse and request a service.
 *
 * ONE COMPONENT, THREE VERTICALS
 *   Beauty, laundry and workmanship are the same shape — a vendor lists
 *   services, a student requests one, the vendor quotes, both agree — and they
 *   already share `modules/services`. Three near-identical pages would be three
 *   places to fix every bug, so the vertical is a prop.
 *
 * QUOTE-PRICED SERVICES SHOW NO PRICE, DELIBERATELY
 *   `pricingModel === 'quote'` means `priceKobo` is null by schema constraint.
 *   Rendering ₦0 for a service whose whole point is "it depends" would be a
 *   lie the vendor then has to argue with.
 */
'use client';

import { useState } from 'react';
import { Sparkles, Shirt, Wrench, Loader2, Check, MessageCircle } from 'lucide-react';
import { Button, Badge, Input } from '@/components/ui';
import { useServices, useServiceCategories, useCreateServiceRequest } from '@/modules/services/hooks';
import { useOpenServiceConversation } from '@/modules/messaging/hooks';
import { openChat } from '@/lib/chat-events';
import { useSession } from '@/providers/session-provider';
import type { Service, Vertical } from '@/modules/services/types';

const VERTICAL_META: Record<Vertical, { title: string; blurb: string; icon: typeof Sparkles }> = {
  beauty: {
    title: 'Beauty',
    blurb: 'Braids, nails, barbers and more — book someone near you.',
    icon: Sparkles,
  },
  laundry: {
    title: 'Laundry',
    blurb: 'Wash, iron and fold. Drop off or have it collected.',
    icon: Shirt,
  },
  workmanship: {
    title: 'Workmanship',
    blurb: 'Carpenters, plumbers, electricians and tailors on campus.',
    icon: Wrench,
  },
};

function priceLabel(s: Service) {
  if (s.pricingModel === 'quote' || s.priceKobo == null) return 'Quote on request';
  const naira = `₦${(s.priceKobo / 100).toLocaleString()}`;
  return s.unitLabel ? `${naira} / ${s.unitLabel}` : naira;
}

export function ServicesBrowser({ vertical }: { vertical: Vertical }) {
  const meta = VERTICAL_META[vertical];
  const Icon = meta.icon;
  const { isAuthenticated } = useSession();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { data: categories = [] } = useServiceCategories(vertical);
  const { data: services = [], isLoading } = useServices(vertical, {
    categoryId: categoryId ?? undefined,
    search: search.trim() || undefined,
  });

  const request = useCreateServiceRequest();
  const openThread = useOpenServiceConversation();
  const [requested, setRequested] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-content-muted flex items-center gap-2 font-mono text-sm tracking-wide">
          <Icon className="size-4" /> {meta.title.toUpperCase()}
        </h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">{meta.title}</h2>
        <p className="text-content-muted mt-1 text-sm">{meta.blurb}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            categoryId === null
              ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
              : 'border-line/10 text-content-muted hover:text-content'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              categoryId === c.id
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {error && <p className="text-coral text-sm">{error}</p>}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-40 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && services.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-2xl border border-dashed p-10 text-center text-sm">
          No {meta.title.toLowerCase()} services listed yet.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <article
            key={s.id}
            className="border-line/10 bg-panel flex flex-col gap-2 rounded-2xl border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-content font-medium">{s.name}</h3>
              {s.categoryName && (
                <Badge className="bg-ink/5 text-content-muted shrink-0">{s.categoryName}</Badge>
              )}
            </div>
            <p className="text-content-muted line-clamp-2 text-xs">
              {s.description ?? 'No description provided.'}
            </p>
            <p className="text-content-muted text-xs">
              {s.vendorName ?? 'Vendor'}
              {s.durationMins ? ` · ${s.durationMins} mins` : ''}
            </p>
            <p className="text-content mt-auto pt-2 font-semibold">{priceLabel(s)}</p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                className="flex-1 gap-1"
                disabled={!isAuthenticated || request.isPending}
                onClick={() => {
                  setError(null);
                  request.mutate(
                    { vendorId: s.vendorId, vertical, serviceId: s.id },
                    {
                      // The request id is what the conversation door needs, so
                      // the thread can only be opened after the request exists.
                      onSuccess: (r) => setRequested(r.id),
                      onError: (e) =>
                        setError(e instanceof Error ? e.message : 'Could not send the request'),
                    },
                  );
                }}
              >
                {request.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : requested ? (
                  <Check className="size-4" />
                ) : null}
                {requested ? 'Requested' : 'Request'}
              </Button>

              {requested && (
                <Button
                  variant="outline"
                  className="gap-1"
                  disabled={openThread.isPending}
                  onClick={() =>
                    openThread.mutate(requested, {
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
    </div>
  );
}
