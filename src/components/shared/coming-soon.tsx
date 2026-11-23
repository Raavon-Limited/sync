/**
 * ComingSoon - the standard "not built yet" screen for a module.
 *
 * Used by routes that exist in the nav (so the app doesn't 404 or dead-end)
 * but have no product behind them. Says so plainly rather than showing an
 * empty list, which reads as "broken" instead of "not yet".
 *
 * Takes its icon and tagline from the module registry, so a module only ever
 * describes itself in one place (src/config/modules.ts).
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

import type { SyncIconName } from '@/components/brand/SyncIcon';
import { NavIcon } from '@/components/layouts/nav-icon';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ComingSoon({
  title,
  tagline,
  iconName,
  icon: Icon,
  note,
  className,
}: {
  title: string;
  /** One line on what this module will do. Usually the registry tagline. */
  tagline: string;
  /** Brand-kit section icon name, from the module registry. */
  iconName?: SyncIconName;
  /** Fallback for screens that are not one of the eight modules (e.g. /ai).
   *  The kit has no icon for those, and inventing one would break the set. */
  icon?: LucideIcon;
  /** Optional extra context, e.g. what has to land first. */
  note?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <span className="bg-lime/15 text-accent-fg mb-6 flex h-16 w-16 items-center justify-center rounded-2xl">
        {iconName ? (
          <NavIcon name={iconName} size={28} />
        ) : Icon ? (
          <Icon className="h-7 w-7" aria-hidden="true" />
        ) : null}
      </span>

      <p className="eyebrow text-content-muted">Coming soon</p>
      <h1 className="font-display text-section text-content mt-2">{title}</h1>

      <p className="text-content-muted mt-3 max-w-sm text-sm">{tagline}</p>
      {note && <p className="text-content-muted/80 mt-2 max-w-sm text-xs">{note}</p>}

      <Button asChild variant="outline" size="sm" className="mt-8">
        <Link href="/around">
          <ArrowLeft className="h-4 w-4" />
          Back to Around you
        </Link>
      </Button>
    </section>
  );
}
