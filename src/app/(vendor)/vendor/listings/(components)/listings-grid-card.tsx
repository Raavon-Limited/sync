'use client';

/**
 * One product in the grid.
 *
 * THE ⋯ BUTTON USED TO DO NOTHING
 *   `onMore={() => {}}` — a literal no-op, so the only way to duplicate,
 *   archive or delete a product was to switch to the list view, which has had
 *   those actions all along. Promote was a second no-op beside it. Both are
 *   real now.
 *
 * STOCK IS PER STORE
 *   The card used to print `listings.stock` — the catalogue column that no
 *   student-facing read consults since the shared catalogue landed. A vendor
 *   could read "12 in stock" while the store they are standing in had none.
 *   It now shows the ACTIVE store's figure, and says which store that is.
 *
 * LAYOUT
 *   Name, then price, then the state of the thing. Price was previously tucked
 *   on a row shared with "0 sold", so the number a vendor scans for competed
 *   with a statistic they rarely need. Sold moves down beside stock, where
 *   both are secondary; the status pill leaves the image and joins them, so
 *   the photo is a photo rather than a notice board.
 */

import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Pencil,
  Megaphone,
  MoreHorizontal,
  Copy,
  Archive,
  Trash2,
  PackageX,
  PackageCheck,
  ImageOff,
} from 'lucide-react';
import { Listing } from '@/modules/vendor/types';
import { Checkbox } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface ListingGridCardProps {
  listing: Listing;
  selected: boolean;
  /** The active store's terms, or null while they load / if it is not carried. */
  storeStock?: number | null;
  storeCarries?: boolean;
  storeName?: string | null;
  onToggleSelect: (id: string) => void;
  onEdit: (listing: Listing) => void;
  onPromote: (listing: Listing) => void;
  onDuplicate: (listing: Listing) => void;
  onArchive: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onToggleSoldOut: (listing: Listing, soldOut: boolean) => void;
}

const statusStyle: Record<Listing['status'], string> = {
  Active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  Archived: 'bg-ink/10 text-content-muted',
  'Out of Stock': 'bg-red-500/10 text-red-600',
};

export function ListingGridCard({
  listing,
  selected,
  storeStock,
  storeCarries = true,
  storeName,
  onToggleSelect,
  onEdit,
  onPromote,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleSoldOut,
}: ListingGridCardProps) {
  const soldOut = storeCarries && storeStock === 0;

  return (
    <div
      className={cn(
        'bg-panel shadow-card group relative flex flex-col overflow-hidden rounded-xl transition-all duration-200',
        selected ? 'ring-lime-deep ring-2' : 'hover:shadow-pop',
      )}
    >
      {/* ── Image ─────────────────────────────────────────────────────── */}
      <div
        className="bg-surface-deep relative aspect-[4/3] cursor-pointer overflow-hidden"
        onClick={() => onToggleSelect(listing.id)}
      >
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              'object-cover transition-transform duration-300 group-hover:scale-105',
              // A sold-out product should look sold out at a glance, from
              // across a kitchen, without reading anything.
              soldOut && 'grayscale',
            )}
          />
        ) : (
          // The old placeholder was a bare X, which reads as an error. This
          // says what is missing and, implicitly, what to do about it.
          <div className="text-content-muted/50 absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <ImageOff className="size-6" />
            <span className="text-[11px]">No photo</span>
          </div>
        )}

        {/* Selection. Always visible once selected, so a chosen card cannot
            look unchosen the moment the pointer leaves it. */}
        <div
          className={cn(
            'absolute top-2.5 left-2.5 transition-opacity duration-200',
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(listing.id)} />
        </div>

        {soldOut && (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            Sold out
          </span>
        )}
      </div>

      {/* ── Detail ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-3">
        <div className="min-w-0">
          <p className="text-content truncate font-medium" title={listing.name}>
            {listing.name}
          </p>
          <p className="text-content-muted mt-0.5 truncate text-xs">{listing.category}</p>
        </div>

        {/* The number a vendor is actually scanning for, on its own line. */}
        <p className="text-content font-display text-lg leading-none font-semibold">
          ₦{listing.price.toLocaleString('en-NG')}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pb-3">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              statusStyle[listing.status],
            )}
          >
            {listing.status}
          </span>
          <span className="text-content-muted text-xs">
            {/* Three genuinely different states, and the old card could only
                say two of them. Untracked is the common case for a kitchen
                that cooks to order, and reading it as "0 in stock" is what
                made every new listing look sold out. */}
            {!storeCarries
              ? 'Not sold here'
              : storeStock === null || storeStock === undefined
                ? 'Made to order'
                : storeStock === 0
                  ? 'None left'
                  : `${storeStock} left`}
          </span>
          {listing.sold > 0 && (
            <span className="text-content-muted text-xs">· {listing.sold} sold</span>
          )}
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="border-line/10 flex items-center gap-1 border-t px-2 py-1.5">
        <button
          type="button"
          onClick={() => onEdit(listing)}
          className="text-content-muted hover:text-content hover:bg-surface-deep flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
        <button
          type="button"
          onClick={() => onPromote(listing)}
          className="text-content-muted hover:text-content hover:bg-surface-deep flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <Megaphone className="size-3.5" /> Promote
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${listing.name}`}
              className="text-content-muted hover:text-content hover:bg-surface-deep ml-auto rounded-md p-1.5 transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* The daily action, first: a kitchen runs out of something long
                before it wants to edit or archive it. */}
            {storeCarries && (
              <DropdownMenuItem onClick={() => onToggleSoldOut(listing, !soldOut)}>
                {soldOut ? (
                  <>
                    <PackageCheck className="size-3.5" /> Back in stock
                  </>
                ) : (
                  <>
                    <PackageX className="size-3.5" /> Mark sold out
                  </>
                )}
                {storeName && <span className="text-content-muted ml-1 text-[11px]">· {storeName}</span>}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(listing)}>
              <Copy className="size-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive(listing)}>
              <Archive className="size-3.5" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(listing)}
              className="text-coral focus:text-coral"
            >
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
