'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Archive, Eye, Home, MapPin, Pencil, Star, TrendingUp } from 'lucide-react';
import { Button, Card, CardContent, toast } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatNaira, type Property } from '../landlord-types';
import { cn } from '@/lib/utils';
import { StatusBadge } from '../shared/status-badge';
import { PropertyDetailsSheet } from './property-details-sheet';
import { PropertyFormSheet } from './property-form-sheet';
import type { Area } from '@/lib/constants/areas';
import type { RoomTypeOption } from '@/modules/room-types/queries';

type PropertyListCardProps = {
  property: Property;
  view: 'grid' | 'list';
  /**
   * ARCHIVES. Named for what it does: `archiveHostel` sets `archived_at` and
   * nothing is deleted, because bookings, reviews and agent visits all point at
   * a hostel. It was called `onDelete` behind a button labelled Delete, over a
   * dialog promising "this cannot be undone"   three statements of a thing that
   * was never true.
   */
  onArchive: (id: string) => void;
  /** For the edit sheet, which is the same form the add flow uses. */
  areas: Area[];
  roomTypes: RoomTypeOption[];
};

function PropertyImage({ property, className }: { property: Property; className?: string }) {
  return (
    <div className={cn('bg-surface-deep relative overflow-hidden', className)}>
      {property.imageUrl ? (
        <Image
          src={property.imageUrl}
          alt={property.name}
          fill
          sizes="(max-width: 1024px) 100vw, 33vw"
          className="object-cover"
        />
      ) : null}
    </div>
  );
}

function PropertyActions({
  property,
  onArchive,
  areas,
  roomTypes,
  compact = false,
}: Omit<PropertyListCardProps, 'view'> & { compact?: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function archiveProperty() {
    onArchive(property.id);
    setConfirmOpen(false);
    toast.success(`“${property.name}” archived`);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* A SHEET, NOT A LINK. This pointed at
            /landlord/properties/<id>/edit, a route that has never existed   so
            Edit was a 404, exactly as "Add a property" was before the add sheet
            was built. Same form, same reason: the list is the context. */}
        <PropertyFormSheet
          property={property}
          areas={areas}
          roomTypes={roomTypes}
          trigger={
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
              <Pencil className="size-3.5" />
              Edit
            </Button>
          }
        />
        {!compact ? (
          <Button
            variant="outline"
            size="sm"
            className="border-line/20 text-content-muted hover:bg-surface-deep hover:text-content flex-1 sm:flex-none"
            onClick={() => setConfirmOpen(true)}
          >
            <Archive className="size-3.5" />
            Archive
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="border-lime-deep/25 text-lime-deep hover:bg-lime/10 hover:text-lime-deep flex-1 sm:flex-none"
          aria-label={`View ${property.name}`}
          onClick={() => setDetailsOpen(true)}
        >
          <Eye className="size-3.5" />
          View
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Archive this property?"
        description={`${property.name} comes off search and no student can book it. Its bookings, reviews and visit history are kept. Only a Sync admin can delete a listing permanently   contact support if that is what you need.`}
        confirmLabel="Archive listing"
        onConfirm={archiveProperty}
      />
      <PropertyDetailsSheet property={property} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}

function PropertyMeta({ property }: { property: Property }) {
  return (
    <div className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {/* BED AND BATH COUNTS ARE GONE, not stubbed.
          They rendered '0' for every listing because there is no column behind
          either one   the Property type says so, under a comment asking for the
          columns before the numbers. And the building type now carries the part
          that mattered: '3 bedroom flat' says the bedrooms, so two icons
          permanently reading zero were worse than nothing. */}
      {property.roomType ? (
        <span className="flex items-center gap-1.5">
          <Home className="size-4" />
          {property.roomType}
        </span>
      ) : null}
      {property.availability ? <StatusBadge status={property.availability} /> : null}
      {property.rating ? (
        <span className="text-content flex items-center gap-1 font-medium">
          <Star className="fill-lime-deep text-lime-deep size-4" />
          {property.rating.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

function GridPropertyCard(props: Omit<PropertyListCardProps, 'view'>) {
  const { property } = props;
  const isReview = property.availability === 'review';

  return (
    <Card className="border-line/10 group overflow-hidden border py-0 transition-shadow hover:shadow-lg">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="relative">
          <PropertyImage property={property} className="h-52 rounded-xl" />
          <StatusBadge status={property.status ?? 'Active'} className="absolute top-3 right-3" />
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">{property.name}</h2>
            {property.address ? (
              <p className="text-content-muted mt-1 flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" />
                <span className="truncate">{property.address}</span>
              </p>
            ) : null}
          </div>
          <p className="text-content-muted text-sm">
            {property.roomsBooked}/{property.roomsTotal} rooms booked
          </p>
          <PropertyMeta property={property} />
        </div>

        <div
          className={cn(
            'flex items-center justify-between rounded-xl px-3.5 py-3',
            isReview ? 'bg-coral/10' : 'bg-lime/10',
          )}
        >
          <p className="font-display text-lg font-semibold">
            {formatNaira(property.price ?? 0)}
            <span className="text-content-muted ml-2 font-sans text-sm font-normal">
              {property.term ?? 'per session'}
            </span>
          </p>
          <TrendingUp className={cn('size-6', isReview ? 'text-coral' : 'text-lime-deep')} />
        </div>

        <PropertyActions {...props} />
      </CardContent>
    </Card>
  );
}

function ListPropertyRow(props: Omit<PropertyListCardProps, 'view'>) {
  const { property } = props;
  return (
    <div className="border-line/10 grid gap-4 border-b px-4 py-5 last:border-b-0 lg:grid-cols-[minmax(250px,2fr)_minmax(125px,.85fr)_minmax(90px,.6fr)_minmax(95px,.6fr)_minmax(110px,.7fr)_minmax(125px,.8fr)_minmax(75px,.45fr)_minmax(110px,.75fr)] lg:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <PropertyImage property={property} className="size-24 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h2 className="font-display truncate font-semibold">{property.name}</h2>
          {property.address ? (
            <p className="text-content-muted mt-1 flex gap-1.5 text-sm">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2">{property.address}</span>
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-content-muted text-sm">
        <span className="text-content font-medium lg:hidden">Rooms: </span>
        {property.roomsBooked}/{property.roomsTotal} rooms booked
      </p>
      {/* Same reason as the grid card: no column behind beds or baths, and
          the building type says the bedrooms. */}
      <div className="text-content-muted flex items-center gap-3 text-sm">
        {property.roomType ? (
          <span className="flex items-center gap-1">
            <Home className="size-4" />
            {property.roomType}
          </span>
        ) : null}
      </div>
      <StatusBadge status={property.status ?? 'Active'} />
      {property.availability ? <StatusBadge status={property.availability} /> : null}
      <p className="font-display font-semibold">
        {formatNaira(property.price ?? 0)}
        <span className="text-content-muted mt-1 block font-sans text-xs font-normal">
          {property.term ?? 'per session'}
        </span>
      </p>
      <span className="flex items-center gap-1 text-sm font-medium">
        <Star className="fill-lime-deep text-lime-deep size-4" />
        {property.rating ? property.rating.toFixed(1) : '-'}
      </span>
      <PropertyActions {...props} compact />
    </div>
  );
}

export function PropertyListCard({ view, ...rest }: PropertyListCardProps) {
  return view === 'grid' ? <GridPropertyCard {...rest} /> : <ListPropertyRow {...rest} />;
}
