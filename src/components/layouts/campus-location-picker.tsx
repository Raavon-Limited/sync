/**
 * CampusLocationPicker - the "where are you looking?" chip in the public header.
 *
 * Two levels, because they answer two different questions:
 *   1. CAMPUS (useCampusChoice) - any university, live or not. Picking one Sync
 *      does not run at is allowed and honest: the page then says "we are not
 *      here yet" instead of showing nothing or pretending.
 *   2. AREA (LocationProvider) - only for a live campus, and the same scope the
 *      rest of the app already uses, so a pick here follows the student into
 *      /around and every module.
 *
 * "Use my location" asks for GPS through the existing provider. It narrows the
 * AREA; it never changes the CAMPUS - see the header of use-campus-choice.
 */
'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCampusChoice } from '@/hooks/use-campus-choice';
import { useLocationScope } from '@/providers/location-provider';
import { searchCampuses } from '@/modules/campuses';

export function CampusLocationPicker({ className }: { className?: string }) {
  const { campuses, campus, live, setCampus } = useCampusChoice();
  const loc = useLocationScope();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const live_ = useMemo(() => campuses.filter((c) => c.isServiced), [campuses]);
  // The full list is ~100 universities. Unfiltered, show a handful; typed,
  // rank properly - "UI" should surface Ibadan, not every name with a u and i.
  const soon = useMemo(
    () => searchCampuses(campuses.filter((c) => !c.isServiced), q, q ? 8 : 6),
    [campuses, q],
  );

  const label = !campus ? 'Set location' : live && loc.area ? `${loc.area}` : campus.code;
  const kicker = !campus ? '' : !live ? 'Coming soon' : loc.mode === 'near-me' ? 'Near you' : 'Exploring';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={campus ? `Location: ${label}. Change location` : 'Set your location'}
          className={cn(
            'border-line/15 bg-panel/70 hover:bg-panel text-foreground flex min-h-11 items-center gap-2 rounded-full border py-1 pr-3 pl-1 transition-colors',
            className,
          )}
        >
          <span className="bg-sage text-ink flex size-8 shrink-0 items-center justify-center rounded-full">
            <MapPin className="size-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            {kicker && (
              <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
                {kicker}
              </span>
            )}
            <span className="max-w-32 truncate text-sm font-semibold">{label}</span>
          </span>
          <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="bg-panel text-foreground border-line/10 shadow-pop z-50 flex w-80 flex-col gap-4 rounded-3xl border p-4"
        >
          {loc.supportsGeo && (
            <button
              type="button"
              onClick={() => loc.requestLocation()}
              className="bg-ink text-cream flex min-h-11 items-center gap-2.5 rounded-2xl px-3 text-left text-sm font-semibold"
            >
              <LocateFixed className="text-lime size-4" aria-hidden="true" />
              {loc.geoStatus === 'prompting' ? 'Finding you...' : 'Use my current location'}
            </button>
          )}
          {loc.outsideServiceArea && (
            <p role="status" className="text-content-muted px-1 text-xs">
              You are not near a campus we cover yet{loc.placeName ? ` (${loc.placeName})` : ''}. You
              can still explore any campus below.
            </p>
          )}

          {/* Live campuses, with their areas once selected. */}
          <div className="flex flex-col gap-2">
            <p className="eyebrow text-content-muted px-1">Live now</p>
            {live_.map((c) => {
              const on = campus?.id === c.id;
              return (
                <div key={c.id} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCampus(c.id);
                      loc.showAllLocations();
                    }}
                    aria-pressed={on}
                    className={cn(
                      'flex min-h-10 items-center justify-between rounded-xl px-3 text-left text-sm font-semibold',
                      on ? 'bg-ink text-cream' : 'hover:bg-surface-deep',
                    )}
                  >
                    <span>
                      {c.code} <span className="font-normal opacity-75">· {c.name}</span>
                    </span>
                    {on && <Check className="size-4" aria-hidden="true" />}
                  </button>
                  {on && loc.areas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {loc.areas.map((a) => {
                        const active = loc.area === a.name;
                        return (
                          <button
                            key={a.slug}
                            type="button"
                            onClick={() => {
                              loc.setArea(active ? null : a.name);
                              setOpen(false);
                            }}
                            aria-pressed={active}
                            className={cn(
                              'border-line/20 min-h-8 rounded-full border px-3 text-xs font-medium',
                              active ? 'bg-ink text-cream border-transparent' : 'hover:bg-surface-deep',
                            )}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Everywhere else - selectable, labelled honestly. */}
          <div className="flex flex-col gap-2">
            <p className="eyebrow text-content-muted px-1">Coming soon</p>
            <label className="border-line/20 flex items-center gap-2 rounded-xl border px-3">
              <Search className="text-content-muted size-4" aria-hidden="true" />
              <span className="sr-only">Find a campus</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find your campus"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <div className="flex max-h-48 flex-col overflow-y-auto" data-lenis-prevent>
              {soon.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCampus(c.id);
                    setOpen(false);
                  }}
                  className="hover:bg-surface-deep flex min-h-10 items-center justify-between rounded-xl px-3 text-left text-sm"
                >
                  <span className="truncate">
                    <span className="font-semibold">{c.code}</span>{' '}
                    <span className="text-content-muted">· {c.state ?? c.name}</span>
                  </span>
                  {campus?.id === c.id && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </button>
              ))}
              {soon.length === 0 && (
                <p className="text-content-muted px-3 py-2 text-xs">No campus matches that.</p>
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
