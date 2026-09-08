/**
 * The hostel behind a booking, and the paperwork that comes with it.
 *
 * IT WAS ONE LONG SCROLL, AND IT PRINTED AS ONE.
 *   Everything lived in a single column: proof of tenancy, then the verified
 *   badge, then the photographs, the price, the amenities and the house rules.
 *   Pressing print produced a page and a half containing a receipt, a gallery
 *   and a list of house rules - not a document, a screenshot of a sidebar.
 *
 *   They are separate documents that happen to share a subject, so they are
 *   separate tabs. Only one is on screen at a time, which is also what makes
 *   printing produce the right thing: the print stylesheet reveals
 *   `.print-sheet`, and only the open tab has one mounted.
 *
 * THE TABS ARE ORDERED BY WHY SOMEBODY OPENED THIS.
 *   Before paying there is one reason - tell me about this place - so an
 *   unpaid booking gets Listing alone and no tab bar at all. Once it is theirs
 *   the reason changes to "show me that it is mine", so Proof leads, the
 *   Agreement follows, and the listing drops to last: still worth having, no
 *   longer the point.
 *
 * IT IS A SHEET, NOT A ROUTE. The decision belongs next to the booking, and
 * navigating away to a public listing page loses the hold countdown, the
 * payment panel and the place in the list. Full screen on mobile, a side panel
 * from `sm` up, which is what SheetContent already does.
 *
 * THE DETAIL IS FETCHED, NOT PASSED. The bookings query joins only what the
 * card renders; asking for the full listing on every row would be a join per
 * booking for data almost nobody opens. `useHostel` is the same hook the
 * listing page uses, so this is a cache hit for anyone who arrived from there.
 */
'use client';

import Image from 'next/image';
import { MapPin, ShieldCheck, ShieldAlert, Home } from 'lucide-react';
import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useHostel } from '@/modules/hostels/hooks';
import { naira } from '@/modules/hostels/pricing';

export function BookingSheet({
  slug,
  open,
  onOpenChange,
  proof,
  agreement,
  children,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Proof of tenancy. Present only once the booking is paid for. */
  proof?: React.ReactNode;
  /** The tenancy agreement. Present on the same terms as `proof`. */
  agreement?: React.ReactNode;
  /** The booking's own actions, rendered under the listing detail. */
  children?: React.ReactNode;
}) {
  // Disabled until the sheet is actually opened - see the note above about not
  // paying for detail nobody looks at.
  const { data: hostel, isLoading } = useHostel(open ? slug : undefined);

  const listing = (
    <>
      {isLoading && <p className="text-content-muted text-sm">Loading…</p>}

      {hostel && (
        <>
          {/* An agent has physically stood in the building, or nobody has.
              Stated either way   a missing badge reads as "we forgot", and
              this is the fact a student most wants before travelling. */}
          {hostel.isVerified ? (
            <Badge className="w-fit bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="size-3" /> Visited by an agent
            </Badge>
          ) : (
            <Badge className="bg-ink/5 text-content-muted w-fit">
              <ShieldAlert className="size-3" /> Not visited yet
            </Badge>
          )}

          {hostel.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {hostel.images.slice(0, 4).map((img) => (
                <div
                  key={img.id}
                  className="bg-surface-deep relative aspect-4/3 overflow-hidden rounded-lg"
                >
                  <Image
                    src={img.url}
                    alt={hostel.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 240px"
                  />
                </div>
              ))}
            </div>
          ) : (
            // Not an empty grid. Most listings have no photos yet, and a row
            // of grey boxes says less than one sentence does.
            <p className="text-content-muted border-line/10 rounded-lg border border-dashed p-4 text-center text-xs">
              <Home className="mx-auto mb-1 size-4" aria-hidden="true" />
              The landlord has not uploaded photos of this one yet.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-content font-semibold">
              {naira(hostel.pricePerSessionKobo)}
              <span className="text-content-muted font-normal"> / session</span>
            </span>
            {hostel.area && (
              <span className="text-content-muted flex items-center gap-1 text-xs">
                <MapPin className="size-3.5" />
                {hostel.area}
              </span>
            )}
          </div>

          {hostel.description && (
            <p className="text-content-muted text-sm leading-relaxed">{hostel.description}</p>
          )}

          {hostel.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hostel.amenities.map((a) => (
                <span
                  key={a}
                  className="border-line/10 bg-surface-deep text-content rounded-lg border px-2 py-1 text-[11px]"
                >
                  {a}
                </span>
              ))}
            </div>
          )}

          {hostel.houseRules.length > 0 && (
            <div>
              <p className="text-content-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
                House rules
              </p>
              <ul className="text-content-muted list-disc space-y-0.5 pl-4 text-xs">
                {hostel.houseRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* The actions come last on purpose: read the listing, then decide. */}
      {children}
    </>
  );

  const hasDocuments = Boolean(proof || agreement);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="no-print p-0">
          <SheetTitle>{hostel?.name ?? 'Hostel'}</SheetTitle>
          <SheetDescription>
            {hostel?.address ?? hostel?.area ?? 'Loading the listing…'}
          </SheetDescription>
        </SheetHeader>

        {/* No documents means no tab bar. A single tab labelled "Listing" is a
            control that offers no choice. */}
        {!hasDocuments ? (
          listing
        ) : (
          <Tabs defaultValue="proof" className="flex flex-col gap-4">
            <TabsList className="no-print">
              {proof && <TabsTrigger value="proof">Proof</TabsTrigger>}
              {agreement && <TabsTrigger value="agreement">Agreement</TabsTrigger>}
              <TabsTrigger value="listing">Listing</TabsTrigger>
            </TabsList>

            {/* Each document is the ONLY `.print-sheet` mounted while its tab
                is open, which is what makes printing produce that document
                alone rather than everything in the panel. */}
            {proof && (
              <TabsContent value="proof" className="flex flex-col gap-4">
                {proof}
              </TabsContent>
            )}

            {agreement && (
              <TabsContent value="agreement" className="flex flex-col gap-4">
                {agreement}
              </TabsContent>
            )}

            <TabsContent value="listing" className="flex flex-col gap-4">
              {listing}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
