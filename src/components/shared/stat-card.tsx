'use client';

/**
 * A figure, its name, and an `i` that explains it.
 *
 * THE CARD IS THE NUMBER. Explanations were living on the cards themselves,
 * and the moment one of them needed a real paragraph - escrow, which has to say
 * which direction the money is going and when it moves - that tile grew four
 * times taller than the two beside it and the row stopped reading as a row.
 * Prose belongs behind the icon; the face of the card is a label and an amount.
 *
 * CLICK, NOT HOVER. This is read on a phone more than anywhere else, and a
 * hover tooltip on a phone is a explanation nobody can reach.
 *
 * ONE AT A TIME, AND IT GETS OUT OF THE WAY. Opening a second popover closes
 * the first - the parent owns which id is open, so that is structural rather
 * than something each card has to remember - and scrolling the PAGE closes
 * whatever is open, because a `fixed` panel does not travel with the page and
 * would end up floating over unrelated content pointing at nothing.
 *
 * SCROLLING THE PANEL IS NOT SCROLLING THE PAGE. It is capped to the room it
 * has and scrolls inside itself, with the bar hidden (`.no-scrollbar`). Long
 * explanations used to run off the bottom of the window unreadable, and the
 * first fix for that closed the panel the moment anybody scrolled it.
 *
 * PORTALLED, for the same reason `DeclineReasonPopover` is: these cards sit in
 * a grid of siblings, and an absolutely-positioned panel inside one card can
 * paint underneath the next card in the grid. Rendering at the body with fixed
 * coordinates sidesteps every ancestor's stacking and overflow.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

const PANEL_WIDTH = 288;
const GAP = 8;
/** Breathing room at the top and bottom of the viewport. */
const MARGIN = 12;

export interface StatCardProps {
  /** Stable id, used by the parent to track which single popover is open. */
  id: string;
  label: string;
  value: string;
  /** Optional second line on the face - a figure, never a paragraph. */
  detail?: React.ReactNode;
  /** The explanation. Omit it and no icon is rendered. */
  info?: React.ReactNode;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  className?: string;
}

export function StatCard({
  id,
  label,
  value,
  detail,
  info,
  openId,
  onOpenChange,
  className,
}: StatCardProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const open = openId === id;

  return (
    <Card className={cn('border-line/10 border p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-content-muted font-mono text-xs tracking-wide">{label}</p>
        {info && (
          <button
            ref={anchorRef}
            type="button"
            onClick={() => onOpenChange(open ? null : id)}
            aria-expanded={open}
            aria-label={`What does ${label.toLowerCase()} mean?`}
            className={cn(
              '-mt-1 -mr-1 shrink-0 rounded-full p-1 transition-colors',
              open ? 'text-content' : 'text-content-muted hover:text-content',
            )}
          >
            <Info className="size-4" />
          </button>
        )}
      </div>

      <p className="text-content mt-1 text-2xl font-bold">{value}</p>
      {detail}

      {open && info && (
        <InfoPanel anchorRef={anchorRef} onClose={() => onOpenChange(null)}>
          {info}
        </InfoPanel>
      )}
    </Card>
  );
}

function InfoPanel({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  /**
   * Either `top` (hanging below the icon) or `bottom` (sitting above it) is
   * set, never both. See the note in the effect for why the flipped case is
   * anchored by its bottom edge rather than by a computed top.
   */
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * PLACED ONCE, AND MADE TO FIT.
   *
   * The first version only ever hung the panel below the icon at its natural
   * height, so a long explanation ran off the bottom of the window and the last
   * two paragraphs were unreachable - the page could not scroll to them,
   * because a `fixed` element does not move with the page.
   *
   * So it takes whichever side of the icon has more room and is capped to that
   * room. When it opens upward the cap is measured against the icon's top edge;
   * downward, against the bottom of the window. Either way the panel is at most
   * as tall as the space it is actually in, and scrolls inside itself for the
   * rest.
   */
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();

    const left = Math.min(
      Math.max(8, rect.right - PANEL_WIDTH),
      Math.max(8, window.innerWidth - PANEL_WIDTH - 8),
    );

    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    // Only flip when there is meaningfully more room up there. Flipping for a
    // few pixels makes the panel jump sides between two cards on one row.
    const flip = above > below + 40;

    const room = Math.max(120, flip ? above : below);

    /*
     * THE FLIPPED CASE IS ANCHORED BY ITS BOTTOM EDGE, not by a computed top.
     *
     * Measuring the panel to work out where its top should go cannot work
     * here: the panel does not exist until `coords` is set, so a
     * `panelRef.current.scrollHeight` read in this effect is always 0 on the
     * pass that decides the position. The first attempt did exactly that and
     * fell back to the full available height, which pinned every upward panel
     * to the top of the window with a gap under it.
     *
     * `bottom` needs no height at all. The browser grows the panel upward from
     * the icon, and `maxHeight` stops it leaving the window.
     */
    setCoords(
      flip
        ? { bottom: window.innerHeight - rect.top + GAP, left, maxHeight: room }
        : { top: rect.bottom + GAP, left, maxHeight: room },
    );
  }, [anchorRef]);

  useEffect(() => {
    /*
     * SCROLLING THE PANEL ITSELF MUST NOT CLOSE IT.
     *
     * The listener is on capture because a scroll event does not bubble, which
     * means it also fires for scrolls INSIDE this panel - so reading to the
     * bottom of a long explanation dismissed it, which is the opposite of
     * useful. The page moving out from under the panel is the case worth
     * closing on; the panel's own overflow is not.
     */
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKey);
    // Pointerdown, not click: closing on the way DOWN means a press that lands
    // on a button behind the panel does not also activate that button.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      style={{
        position: 'fixed',
        top: coords.top,
        bottom: coords.bottom,
        left: coords.left,
        width: PANEL_WIDTH,
        maxHeight: coords.maxHeight,
        // Contained, so reaching the end of this list does not then start
        // scrolling the page behind it - which would close the panel via the
        // handler above the moment somebody read to the bottom.
        overscrollBehavior: 'contain',
      }}
      className="border-line/15 bg-panel text-content-muted no-scrollbar z-50 flex flex-col gap-2 overflow-y-auto rounded-xl border p-4 text-xs leading-relaxed shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}
