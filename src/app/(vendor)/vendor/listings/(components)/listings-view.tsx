'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil, Copy, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Listing } from '@/modules/vendor/types';

/* Solid fills keep these legible on both the cream and ink card surfaces.
   `content` flips with the theme, so the Archived tint inverts with it. */
const statusStyle: Record<Listing['status'], string> = {
  Active: 'bg-green-500 text-white',
  'Out of Stock': 'bg-red-500 text-white',
  Archived: 'bg-content/10 text-content',
};

interface ListingListViewProps {
  listings: Listing[];

  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;

  onEdit: (listing: Listing) => void;
  onDuplicate: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
}

export function ListingListView({
  listings,
  selectedIds,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: ListingListViewProps) {
  return (
    <div className="bg-panel shadow-card overflow-hidden rounded-xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">PRODUCT</TableHead>
            <TableHead>CATEGORY</TableHead>
            <TableHead>PRICE</TableHead>
            <TableHead>STOCK</TableHead>
            <TableHead>SOLD</TableHead>
            <TableHead>STATUS</TableHead>
            <TableHead className="text-right">ACTIONS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-content-muted h-24 text-center">
                No listings found.
              </TableCell>
            </TableRow>
          )}
          {listings.map((listing) => (
            <TableRow key={listing.id}>
              {/* Product */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="bg-surface-deep size-10 shrink-0 overflow-hidden rounded-lg">
                    {listing.imageUrl ? (
                      <Image
                        src={listing.imageUrl}
                        alt={listing.name}
                        width={40}
                        height={40}
                        className="size-full object-cover"
                      />
                    ) : (
                      <svg
                        className="size-full"
                        xmlns="http://www.w3.org/2000/svg"
                        preserveAspectRatio="none"
                      >
                        <line x1="0" y1="0" x2="100%" y2="100%" stroke="#c5bfb5" strokeWidth="1" />
                        <line x1="100%" y1="0" x2="0" y2="100%" stroke="#c5bfb5" strokeWidth="1" />
                      </svg>
                    )}
                  </div>
                  <p className="text-content text-sm font-medium">{listing.name}</p>
                </div>
              </TableCell>
              <TableCell className="text-content-muted text-sm">{listing.category}</TableCell>
              <TableCell className="text-content text-sm font-semibold">
                ₦{listing.price.toLocaleString()}
              </TableCell>
              <TableCell
                className={cn(
                  'text-sm font-medium',
                  listing.stock === 0 ? 'text-red-500' : 'text-content',
                )}
              >
                {listing.stock}
              </TableCell>
              <TableCell className="text-content-muted text-sm">{listing.sold}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    statusStyle[listing.status],
                  )}
                >
                  {listing.status}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => onEdit(listing)}
                    className="text-content-muted hover:text-content transition-colors"
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => onDuplicate(listing)}
                    className="text-content-muted hover:text-content transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    onClick={() => onDelete(listing)}
                    className="text-content-muted transition-colors hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
