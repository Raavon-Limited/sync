/**
 * The property list: search, filter, grid or list.
 *
 * THE ROWS ARE PROPS, NOT A HOOK
 *   This arrived from the landlord branch reading `useLandlordProperties`,
 *   which read `localStorage`, seeded from a mock array. The listings now come
 *   from `hostels` on the server and are handed down; everything this component
 *   still owns is presentation - which view, which filter, what was typed.
 *
 * REMOVING ARCHIVES. `archiveHostel` sets `archived_at` rather than deleting:
 * bookings, reviews and agent visits all point at a hostel, and one that
 * vanishes takes somebody's booking history with it.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, LayoutGrid, List, Search } from 'lucide-react';
import { Input, toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { archiveHostel } from '@/modules/hostels/actions';
import { PropertyFormSheet } from '../(components)/properties/property-form-sheet';
import { PropertyListCard } from '../(components)/properties/property-list-card';
import type { Area } from '@/lib/constants/areas';
import type { RoomTypeOption } from '@/modules/room-types/queries';
import type { Property } from '../(components)/landlord-types';

type Filter = 'all' | 'Active' | 'Inactive';

export function PropertiesClient({
  properties,
  areas,
  roomTypes,
}: {
  properties: Property[];
  areas: Area[];
  roomTypes: RoomTypeOption[];
}) {
  const router = useRouter();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [, startRemoving] = useTransition();

  const visible = properties.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q) ||
      (p.area ?? '').toLowerCase().includes(q)
    );
  });

  function remove(id: string) {
    startRemoving(async () => {
      const res = await archiveHostel(id);
      if (res.ok) {
        toast('Listing archived. Contact support to delete it permanently.');
        router.refresh();
      } else {
        toast(res.error ?? 'We could not archive that listing.');
      }
    });
  }

  if (properties.length === 0) {
    return (
      <div className="border-line/10 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Building2 className="text-content-muted size-8" aria-hidden="true" />
        <div>
          <p className="text-content font-medium">No properties yet</p>
          <p className="text-content-muted mt-1 text-sm">
            Add your first listing and a Sync agent will come and verify it before students can
            book.
          </p>
        </div>
        <PropertyFormSheet areas={areas} roomTypes={roomTypes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="text-content-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, address or area…"
            className="pl-9"
          />
        </div>

        {(['all', 'Active', 'Inactive'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors',
              filter === f
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content',
            )}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}

        <div className="flex items-center gap-1">
          {(
            [
              ['grid', LayoutGrid],
              ['list', List],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} view`}
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border transition-colors',
                view === value
                  ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                  : 'border-line/10 text-content-muted hover:text-content',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nothing matches that.
        </p>
      ) : (
        <div
          className={
            view === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-3'
          }
        >
          {visible.map((p) => (
            <PropertyListCard
              key={p.id}
              property={p}
              view={view}
              areas={areas}
              roomTypes={roomTypes}
              onArchive={() => remove(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
