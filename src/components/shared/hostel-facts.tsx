/**
 * HostelFacts - everything about a listing that a reviewer checks, in one place.
 *
 * WHY THIS IS SHARED AND NOT TWO SCREENS' WORTH OF MARKUP
 *   Two screens answer questions about the same hostel: the account view
 *   (/admin/landlord/<slug>/hostels/<hostelSlug>) and the verification visit
 *   itself. They were showing different subsets   the visits queue showed a
 *   name, an area and a verified flag, and NOT the address, price, room type,
 *   amenities or house rules, which are precisely the claims an agent's
 *   photographs are supposed to corroborate. A reviewer was deciding on
 *   evidence without the assertions the evidence is evidence FOR.
 *
 *   One component means they cannot drift again: a field added for the account
 *   page appears on the decision screen the same day.
 *
 * PRESENTATIONAL ONLY. It takes a plain object and renders it   no fetching, no
 * actions. The decision buttons belong to the screen that owns the decision,
 * because only one of these two screens is allowed to make one.
 */
import { MapPin, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatKobo } from '@/lib/query/helpers';
import { PhotoGrid } from '@/components/shared/photo-grid';
import { WalkthroughVideo } from '@/components/shared/walkthrough-video';
import type { Row } from '@/lib/supabase/row';

/** The hostel's own claims. Every screen showing a hostel builds this shape. */
export interface HostelFactsData {
  name: string;
  verified: boolean;
  area: string;
  address?: string | null;
  landmark?: string | null;
  roomType?: string | null;
  /** The landlord own words. Rendered below the meta line. */
  description?: string | null;
  pricePerSessionKobo?: number | null;
  inspectionFeeKobo?: number | null;
  amenities?: string[] | null;
  houseRules?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  /** In display order   the first is the primary image. */
  images?: string[] | null;
  /** Walkthrough video, if the landlord uploaded any. */
  videos?: string[] | null;
}

export function HostelFacts({
  hostel,
  /** The heading level is the page's business, not this component's. */
  headingClassName = 'font-display text-content flex flex-wrap items-center gap-2 text-2xl',
}: {
  hostel: HostelFactsData;
  headingClassName?: string;
}) {
  const images = hostel.images ?? [];
  const amenities = hostel.amenities ?? [];
  const rules = hostel.houseRules ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className={headingClassName}>
          {hostel.name}
          {hostel.verified ? (
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="size-3" /> verified
            </Badge>
          ) : (
            <Badge className="bg-ink/5 text-content-muted">unverified</Badge>
          )}
        </h2>

        <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" />
            {hostel.address ?? hostel.area}
            {hostel.landmark ? ` · ${hostel.landmark}` : ''}
          </span>
          {hostel.roomType && <span>{hostel.roomType}</span>}
          {typeof hostel.pricePerSessionKobo === 'number' && (
            <span>{formatKobo(hostel.pricePerSessionKobo)} / session</span>
          )}
          {typeof hostel.inspectionFeeKobo === 'number' && (
            <span>inspection {formatKobo(hostel.inspectionFeeKobo)}</span>
          )}
          {/* The pin, as a link out. An agent standing at the wrong gate and a
              reviewer checking the photos are the same address either way. */}
          {hostel.lat != null && hostel.lng != null ? (
            <a
              className="text-lime-deep underline underline-offset-2"
              href={`https://www.google.com/maps/search/?api=1&query=${hostel.lat},${hostel.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              map
            </a>
          ) : (
            // Said rather than omitted: an unpinned listing is invisible under
            // "near me", and this is a screen where somebody can act on that.
            <span className="text-amber-600">no map pin</span>
          )}
        </p>
      </div>

      {hostel.description ? (
        <p className="text-content-muted text-sm whitespace-pre-line">{hostel.description}</p>
      ) : null}

      {/* THE LANDLORD'S PHOTOS, which are the thing the agent's photos are
          checked against. Showing only the agent's evidence made that
          comparison impossible. */}
      {images.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            Listing photos · {images.length}
          </p>
          {/* EXPANDABLE. These were 96px cover-crops   a reviewer deciding
              whether a building matches its listing was looking at a square
              inch of it, with no way to see the rest. PhotoGrid is the same
              tile with a lightbox behind it, shared with the agent evidence
              so the two cannot diverge again. */}
          <PhotoGrid photos={images} label={hostel.name + " photo"} />
        </div>
      )}

      {(hostel.videos ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            Walkthrough
          </p>
          {/* The thing a reviewer actually wants: a continuous pan of the room,
              which a set of stills cannot fake as easily. */}
          <div className="flex flex-wrap gap-2">
            {(hostel.videos ?? []).map((src) => (
              <WalkthroughVideo key={src} src={src} />
            ))}
          </div>
        </div>
      )}

      {amenities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">Amenities</p>
          <div className="flex flex-wrap gap-1">
            {amenities.map((am) => (
              <Badge key={am} className="bg-ink/5 text-content-muted">
                {am}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            House rules
          </p>
          <ul className="text-content-muted flex flex-col gap-1 text-sm">
            {rules.map((rule, i) => (
              <li key={`${i}-${rule}`} className="flex items-start gap-2">
                <span className="text-lime-deep mt-0.5 shrink-0" aria-hidden="true">
                  &bull;
                </span>
                <span className="min-w-0 flex-1 break-words">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One `hostels` row -> the shape above.
 *
 * Lives beside the component rather than in each page, because two pages
 * building this by hand is how the two screens drifted apart in the first
 * place. Takes the raw row so a caller only has to get the SELECT right.
 *
 * Expects `hostel_images(url, position)` to have been selected; without it the
 * photo strip is simply empty rather than an error, since a listing with no
 * photos is a real state.
 */
export function hostelFactsFromRow(h: Row): HostelFactsData {
  const rows = (
    (h.hostel_images as { url: string; position: number; kind?: string }[] | null) ?? []
  )
    .slice()
    // PostgREST does not promise an order on an embedded resource unless it is
    // asked for, and "which photo is primary" must not depend on luck.
    .sort((a, b) => a.position - b.position);
  const images = rows.filter((i) => i.kind !== 'video').map((i) => i.url);
  const videos = rows.filter((i) => i.kind === 'video').map((i) => i.url);

  return {
    name: (h.name as string) ?? 'Unnamed hostel',
    verified: h.verified === true,
    area: (h.area as string) ?? 'No area',
    address: (h.address as string) ?? null,
    landmark: (h.landmark as string) ?? null,
    roomType: (h.room_type as string) ?? null,
    description: (h.description as string) ?? null,
    pricePerSessionKobo: (h.price_per_session_kobo as number) ?? null,
    inspectionFeeKobo: (h.inspection_fee_kobo as number) ?? null,
    amenities: (h.amenities as string[]) ?? [],
    houseRules: (h.house_rules as string[]) ?? [],
    lat: (h.lat as number) ?? null,
    lng: (h.lng as number) ?? null,
    images,
    videos,
  };
}
