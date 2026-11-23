/**
 * WhySection - the old way vs the Sync way, one word per row.
 *
 * Replaces the two-column checklist (comparison.tsx). Every "Sync way" line is
 * something the product does today, except Move, which says "soon" because
 * dispatch is not built.
 */
import { BadgeCheck, Building2, Hammer, Megaphone, Tag, Truck, X, Check } from 'lucide-react';

const ROWS = [
  { topic: 'Find', Icon: Building2, old: 'Trekking round in the sun with an agent asking for inspection fee.', sync: 'Verified hostels with real photos and prices before you move an inch.' },
  { topic: 'Trust', Icon: BadgeCheck, old: 'Fake listings and agents that disappear after payment.', sync: 'A Verified badge only after Sync checks the vendor, and rent held in escrow till you move in.' },
  { topic: 'Move', Icon: Truck, old: 'Begging a friend with a bike to help you carry your stuff.', sync: 'Dispatch riders for pickups, errands and moves. Coming soon.' },
  { topic: 'Gist', Icon: Megaphone, old: 'Gist scattered across twenty WhatsApp groups.', sync: 'One place for what is happening around you.' },
  { topic: 'Book', Icon: Hammer, old: 'Asking around for a plumber, tailor or laundry guy.', sync: 'Book artisans, laundry and beauty in a few taps.' },
  { topic: 'Price', Icon: Tag, old: 'Surprise fees and prices that change on the spot.', sync: 'Prices shown upfront, and any Sync fee shown before you pay.' },
];

export function WhySection() {
  return (
    <section id="why" className="bg-stone text-forest px-4 pt-16 pb-[68px] md:px-8 md:pt-20 md:pb-[88px]">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-moss font-mono text-[11.5px] tracking-wider uppercase">Why Sync</span>
          <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
            The old way vs <span className="text-leaf">the Sync way</span>
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="text-moss hidden grid-cols-[180px_1fr_1fr] gap-4 px-5 font-mono text-[11px] tracking-wider uppercase lg:grid">
            <span />
            <span>The old way</span>
            <span>The Sync way</span>
          </div>
          {ROWS.map((r) => (
            <div
              key={r.topic}
              className="bg-paper grid grid-cols-1 gap-3 rounded-[22px] p-4 sm:grid-cols-2 lg:grid-cols-[180px_1fr_1fr] lg:items-center lg:gap-4 lg:p-5"
            >
              <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
                <span className="bg-sage/45 text-forest flex size-10 items-center justify-center rounded-xl">
                  <r.Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="font-display text-base font-bold">{r.topic}</span>
              </div>
              <p className="text-moss/80 flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="border-forest/25 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border">
                  <X className="size-3" aria-hidden="true" />
                </span>
                <span>
                  <span className="sr-only">The old way: </span>
                  {r.old}
                </span>
              </p>
              <p className="flex items-start gap-2.5 text-sm leading-relaxed font-medium">
                <span className="bg-sage text-forest mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                <span>
                  <span className="sr-only">With Sync: </span>
                  {r.sync}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
