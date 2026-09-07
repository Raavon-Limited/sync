/**
 * Sync module registry - single source of truth for the 8 service modules
 * plus the "Around you" hub. Drives ModuleNav, the (app) sidebar, and the
 * mobile bottom nav.
 *
 * Order here is the display order in nav. Don't sort at render time.
 */
import type { LucideIcon } from 'lucide-react';
import type { SyncIconName } from '@/components/brand/SyncIcon';
import {
  Building2,
  Calendar,
  Compass,
  Hammer,
  Scissors,
  ShoppingBag,
  Sofa,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

export interface ModuleEntry {
  /** URL slug for `/app/<slug>`. */
  slug: string;
  /** Display label in nav. */
  label: string;
  /** Short tagline used on landing pages and the around-you hub. */
  tagline: string;
  /** Lucide icon component. Kept for surfaces the brand kit does not cover. */
  icon: LucideIcon;
  /**
   * The brand-kit section icon. Use this wherever a MODULE is being shown -
   * mobile tabs, section headers, listing badges, empty states - so the eight
   * modules read as one family. Two slugs differ from their icon name:
   * around -> around-you, hotspots -> hot-spots.
   */
  iconName: SyncIconName;
}

export const MODULES: readonly ModuleEntry[] = [
  { slug: 'around', label: 'Around you', tagline: 'Everything nearby, right now', icon: Compass, iconName: 'around-you' },
  { slug: 'hostels', label: 'Hostels', tagline: 'Verified rooms, no agent runaround', icon: Building2, iconName: 'hostels' },
  { slug: 'events', label: 'Events', tagline: 'Tickets for what’s on this week', icon: Calendar, iconName: 'events' },
  { slug: 'food', label: 'Food', tagline: 'Order from kitchens you can trust', icon: UtensilsCrossed, iconName: 'food' },
  { slug: 'beauty', label: 'Beauty', tagline: 'Stylists, nails, barbers - booked in a tap', icon: Sparkles, iconName: 'beauty' },
  { slug: 'workmanship', label: 'Workmanship', tagline: 'Plumbers, sparks, fixers - verified', icon: Hammer, iconName: 'workmanship' },
  { slug: 'laundry', label: 'Laundry', tagline: 'Pickup & dropoff, scheduled', icon: ShoppingBag, iconName: 'laundry' },
  { slug: 'hotspots', label: 'Hot spots', tagline: 'Lounges & spots worth knowing', icon: Sofa, iconName: 'hot-spots' },
];

export const getModule = (slug: string) => MODULES.find((m) => m.slug === slug);

/** Convenience re-export for the icon-only "scissors" used in beauty submenu later. */
export { Scissors };
