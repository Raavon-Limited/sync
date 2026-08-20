/**
 * LocationSelector - the app-wide "where am I shopping" control.
 *
 * Extracted out of ServicesDock so it is a component rather than a slab of that
 * file: the dock renders it, but so can any surface that needs to scope a feed
 * (a module header, a filter panel, a checkout step).
 *
 * It owns no state. Everything comes from LocationContext, which is mounted
 * once at the root, so every instance shows the same selection and changing it
 * anywhere changes it everywhere - including across navigations, which is the
 * whole point of hoisting the provider out of the /around layout.
 *
 * Two shapes, same state:
 *   variant="dropdown" - the pill + popover used in the dock rail
 *   variant="inline"   - flat chips, for inside a bottom sheet where a popover
 *                        would be a second layer on top of an existing one
 */
'use client';

import { useState } from 'react';
import { Check, ChevronDown, LocateFixed, MapPin } from 'lucide-react';

import { useLocationScope } from '@/providers/location-provider';
import { cn } from '@/lib/utils';

export function LocationSelector({
  variant = 'dropdown',
  className,
  onNavigate,
}: {
  variant?: 'dropdown' | 'inline';
  className?: string;
  /** Called after any selection - lets a sheet close itself. */
  onNavigate?: () => void;
}) {
  const {
    areas,
    area: selected,
    setArea,
    mode,
    outsideServiceArea: outside,
    placeName,
    geoStatus,
    geoError,
    requestLocation,
    showAllLocations,
    supportsGeo,
  } = useLocationScope();

  const [open, setOpen] = useState(false);

  const nearMe = mode === 'near-me';
  const showingAll = mode === 'all';
  const busy = geoStatus === 'prompting';
  // A denial is sticky - the browser won't re-prompt - so hide the affordance
  // rather than offer a button that can no longer do anything.
  const canUseGeo = supportsGeo && geoStatus !== 'denied' && geoStatus !== 'unavailable';

  // Outside coverage we show where they ACTUALLY are, resolved by reverse
  // geocoding. "Outside Malete" names a place they aren't; "Victoria Island,
  // Lagos" names the one they are.
  const label = outside
    ? (placeName ?? 'Outside Malete')
    : nearMe
      ? `Near me · ${selected}`
      : (selected ?? 'All locations');

  const geoLabel = busy ? 'Locating…' : nearMe ? 'Using your location' : 'Use my location';

  const pick = (next: string | null) => {
    setArea(next);
    setOpen(false);
    onNavigate?.();
  };

  const locate = () => {
    requestLocation();
    setOpen(false);
    onNavigate?.();
  };

  if (variant === 'inline') {
    return (
      <div className={className}>
        {canUseGeo && (
          <button
            type="button"
            disabled={busy}
            onClick={locate}
            className={cn(
              'mb-3 inline-flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
              nearMe
                ? 'bg-lime text-ink border-transparent font-medium'
                : 'border-line/15 text-content hover:bg-ink/5',
              busy && 'opacity-60',
            )}
          >
            <LocateFixed className="h-4 w-4 shrink-0" aria-hidden="true" />
            {geoLabel}
          </button>
        )}

        {/* Denial is not a dead end - the chips below still work. */}
        {geoError && <p className="text-content-muted mb-3 text-xs">{geoError}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              showAllLocations();
              onNavigate?.();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              showingAll
                ? 'bg-lime text-ink border-transparent font-medium'
                : 'border-line/15 text-content hover:bg-ink/5',
            )}
          >
            All locations
          </button>

          {areas.map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => pick(a.name)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                a.name === selected
                  ? 'bg-lime text-ink border-transparent font-medium'
                  : 'border-line/15 text-content hover:bg-ink/5',
              )}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {a.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change location"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="border-line/15 hover:bg-ink/5 inline-flex h-9 max-w-52 items-center gap-1.5 rounded-full border px-3 text-sm"
      >
        <MapPin className="text-accent-fg h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{label}</span>
        <ChevronDown
          className={cn(
            'text-content-muted h-3.5 w-3.5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className="border-line/10 bg-panel shadow-pop absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border py-1"
          >
            {canUseGeo && (
              <>
                <li role="presentation">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={locate}
                    className="menu-item text-content w-full justify-between disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <LocateFixed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {geoLabel}
                    </span>
                    {nearMe && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
                <li role="presentation" className="border-line/10 my-1 border-t" aria-hidden="true" />
              </>
            )}

            {geoError && (
              <li role="presentation" className="text-content-muted px-3.5 py-1.5 text-xs">
                {geoError}
              </li>
            )}

            <li role="option" aria-selected={showingAll}>
              <button
                type="button"
                onClick={() => pick(null)}
                className="menu-item text-content w-full justify-between"
              >
                All locations
                {showingAll && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            </li>

            {areas.map((a) => {
              const isSelected = a.name === selected;
              return (
                <li key={a.name} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => pick(a.name)}
                    className="menu-item text-content w-full justify-between"
                  >
                    {a.name}
                    {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
