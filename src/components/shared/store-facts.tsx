/**
 * StoreFacts - everything a branch claims, for the screen deciding whether it
 * is real.
 *
 * THE SAME ARGUMENT AS HostelFacts, one table across.
 *   The verification panel showed a store's business name, address and phone
 *   and nothing else. An agent's photograph is evidence FOR something, and the
 *   reviewer holding it could not see most of what it was meant to corroborate:
 *   no shopfront photo to compare against, no trading hours to check the doors
 *   were open when somebody stood there, no map pin, no sign of whether the
 *   shop is even taking orders. A decision was being made against three lines.
 *
 * SHARED, so the vendor's own screens and this one cannot drift the way the
 * hostel screens did. Presentational only: it takes a plain object, fetches
 * nothing, and decides nothing.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   `slug`, `campus_id` and the internal ids. They are plumbing, and a panel
 *   somebody reads under time pressure is worse for every line that cannot
 *   change the decision.
 */
import { Clock, MapPin, Phone, ShieldCheck, Store } from 'lucide-react';
import { Badge } from '@/components/ui';
import { PhotoGrid } from '@/components/shared/photo-grid';
import type { Row } from '@/lib/supabase/row';

/** One branch's claims. Every screen showing a store builds this shape. */
export interface StoreFactsData {
  /** The branch, e.g. "Tanke store". */
  name: string;
  /** The business it belongs to. Null only if the brand row went missing. */
  brand?: string | null;
  /** The shopfront photo, which is the thing the agent's photos are checked
   *  against. Null falls back to the business logo everywhere else, but here
   *  its absence is worth saying out loud. */
  imageUrl?: string | null;
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  /** Postgres `time`, "HH:MM:SS". Null means hours were never set. */
  opensAt?: string | null;
  closesAt?: string | null;
  isAcceptingOrders?: boolean | null;
  /** Cooldown deadline, and why it is closed. */
  pausedUntil?: string | null;
  pauseReason?: string | null;
  /** Pause automatically at this many unfinished orders. 0 = never. */
  autoPauseAfter?: number | null;
  autoPauseMinutes?: number | null;
  isPrimary?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  /** When an agent last confirmed this address. Null means never. */
  verifiedAt?: string | null;
  createdAt?: string | null;
}

/** "10:00:00" -> "10:00 am". Postgres `time` is not a Date, so this is string
 *  work rather than a formatter: building a Date to print two numbers invents
 *  a timezone the value never had. */
function clock(t?: string | null): string | null {
  if (!t) return null;
  const [hRaw, m] = t.split(':');
  const h = Number(hRaw);
  if (Number.isNaN(h)) return t;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m ?? '00'} ${suffix}`;
}

function day(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function StoreFacts({
  store,
  /**
   * False for a business visited as a whole rather than one branch: there is no
   * badge on it to report, and "no agent has confirmed this address" would be
   * answering a question nobody asked.
   */
  showVerification = true,
  headingClassName = 'font-display text-content flex flex-wrap items-center gap-2 text-2xl',
}: {
  store: StoreFactsData;
  showVerification?: boolean;
  headingClassName?: string;
}) {
  const opens = clock(store.opensAt);
  const closes = clock(store.closesAt);
  const paused = store.pausedUntil ? new Date(store.pausedUntil) > new Date() : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className={headingClassName}>
          {store.name}
          {showVerification &&
            (store.verifiedAt ? (
              <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="size-3" /> verified
              </Badge>
            ) : (
              <Badge className="bg-ink/5 text-content-muted">unverified</Badge>
            ))}
          {store.isPrimary && <Badge className="bg-lime/15 text-lime-deep">primary</Badge>}
        </h2>

        {store.brand && (
          <p className="text-content-muted flex items-center gap-1 text-sm">
            <Store className="size-4" />
            {store.brand}
          </p>
        )}

        <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" />
            {store.address ?? store.area ?? 'No address given'}
            {store.address && store.area ? ` · ${store.area}` : ''}
          </span>

          {store.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-4" />
              {store.phone}
            </span>
          )}

          {/* The pin, as a link out. The agent standing at a gate and the
              reviewer checking their photos are looking for the same door. */}
          {store.lat != null && store.lng != null ? (
            <a
              className="text-lime-deep underline underline-offset-2"
              href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              map
            </a>
          ) : (
            // Said rather than omitted: discovery is location-first, so an
            // unpinned store cannot be ranked by distance and students will not
            // find it. This is a screen where somebody can act on that.
            <span className="text-amber-600">no map pin</span>
          )}
        </p>
      </div>

      {/* THE SHOPFRONT, which is what the agent's photographs are compared
          against. Same tile and lightbox as the evidence below it, so the two
          are read side by side rather than at different sizes. */}
      {store.imageUrl ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            Store photo
          </p>
          <PhotoGrid photos={[store.imageUrl]} label={`${store.name} photo`} />
        </div>
      ) : (
        <p className="text-content-muted text-sm">
          No shopfront photo on the store, so there is nothing to compare the agent&rsquo;s
          pictures against.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-content-muted font-mono text-xs tracking-wide uppercase">Trading</p>
        <dl className="text-content-muted flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <dt className="flex items-center gap-1">
              <Clock className="size-4" /> Hours
            </dt>
            <dd className="text-content">
              {opens && closes ? `${opens} to ${closes}` : 'Not set'}
            </dd>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <dt>Right now</dt>
            <dd className="text-content">
              {store.isAcceptingOrders === false
                ? 'Closed'
                : paused
                  ? `Paused until ${new Date(store.pausedUntil!).toLocaleString('en-NG')}${
                      store.pauseReason ? ` · ${store.pauseReason.replace(/_/g, ' ')}` : ''
                    }`
                  : 'Accepting orders'}
            </dd>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <dt>Auto-pause</dt>
            <dd className="text-content">
              {store.autoPauseAfter && store.autoPauseAfter > 0
                ? `After ${store.autoPauseAfter} unfinished order(s), for ${store.autoPauseMinutes ?? 10} min`
                : 'Off'}
            </dd>
          </div>

          {store.createdAt && (
            <div className="flex flex-wrap items-center gap-2">
              <dt>Opened</dt>
              <dd className="text-content">{day(store.createdAt)}</dd>
            </div>
          )}

          {showVerification && (
            <div className="flex flex-wrap items-center gap-2">
              <dt>Last verified</dt>
              <dd className="text-content">
                {store.verifiedAt
                  ? day(store.verifiedAt)
                  : 'Never   no agent has confirmed this address'}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

/**
 * One `storefronts` row -> the shape above.
 *
 * Beside the component for the same reason `hostelFactsFromRow` is: two pages
 * building this by hand is how the hostel screens drifted. Expects
 * `vendor_profiles(business_name)` to have been embedded; without it the brand
 * line is simply absent rather than an error.
 */
export function storeFactsFromRow(s: Row): StoreFactsData {
  return {
    name: (s.name as string) ?? 'Unnamed store',
    brand: (s.vendor_profiles as { business_name?: string } | null)?.business_name ?? null,
    imageUrl: (s.image_url as string) ?? null,
    area: (s.area as string) ?? null,
    address: (s.address as string) ?? null,
    phone: (s.public_phone as string) ?? null,
    opensAt: (s.opens_at as string) ?? null,
    closesAt: (s.closes_at as string) ?? null,
    isAcceptingOrders: (s.is_accepting_orders as boolean) ?? null,
    pausedUntil: (s.paused_until as string) ?? null,
    pauseReason: (s.pause_reason as string) ?? null,
    autoPauseAfter: (s.auto_pause_after as number) ?? null,
    autoPauseMinutes: (s.auto_pause_minutes as number) ?? null,
    isPrimary: (s.is_primary as boolean) ?? null,
    lat: (s.lat as number) ?? null,
    lng: (s.lng as number) ?? null,
    verifiedAt: (s.verified_at as string) ?? null,
    createdAt: (s.created_at as string) ?? null,
  };
}
