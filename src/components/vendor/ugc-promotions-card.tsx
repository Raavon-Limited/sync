/**
 * "Hire a creator to promote this" — announced, not yet built.
 *
 * WHY ANNOUNCE IT AT ALL
 *   A vendor with a promotion running is exactly the person who would pay for
 *   somebody to film it, and the moment they are thinking about promotion is
 *   the only moment they will read this. A feature that first appears the day
 *   it ships is a feature nobody was waiting for.
 *
 * IT IS NOT A LINK, AND IT DOES NOT COLLECT ANYTHING
 *   There is no brief flow, no creator roster and no escrow for it yet, so a
 *   button here would either 404 or open a form whose submissions nobody reads.
 *   A card that says plainly what is coming is honest; a dead control is not.
 *
 *   When the marketplace lands this becomes the entry point to it, which is why
 *   it is a component rather than a paragraph inside one dashboard.
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UgcPromotionsCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="text-lime-deep size-4 shrink-0" aria-hidden="true" />
        <h3 className="text-content text-sm font-medium">Get students to promote you</h3>
        <span className="border-line/20 text-content-muted rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase">
          Coming soon
        </span>
      </div>

      <p className="text-content-muted text-sm">
        Post what you need filmed: a plate, a room, a haircut. Say what you will pay, and student
        creators apply. You approve the work before any money leaves your wallet.
      </p>

      <ul className="text-content-muted flex flex-col gap-1 text-xs">
        <li>· You write the brief and set the price</li>
        <li>· Creators apply; you pick one</li>
        <li>· Payment is held until you accept the video</li>
      </ul>
    </div>
  );
}
