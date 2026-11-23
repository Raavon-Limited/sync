/**
 * NavIcon - one icon slot for the nav config's string names.
 *
 * Module rows use the brand kit's own section icons (SyncIcon), the same ones
 * the services dock shows, so Hostels looks like Hostels everywhere. Rows the
 * kit has no icon for (careers, policies, gist) fall back to lucide.
 */
import {
  Briefcase,
  Brush,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  Megaphone,
  Plus,
  ShieldCheck,
  Star,
  Store,
  Ticket,
  Truck,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import SyncIcon, { type SyncIconName } from '@/components/brand/SyncIcon';

/**
 * A copy of SYNC_ICON_NAMES, not an import of it. SyncIcon.tsx is a client
 * module, and when a SERVER component (the landing's Around section) imports a
 * plain value from one it gets a client reference, not the array - `.includes`
 * then throws at render. `satisfies` keeps this list honest against the kit.
 */
const KIT = new Set<string>([
  'around-you', 'hostels', 'events', 'food', 'beauty', 'workmanship', 'laundry', 'hot-spots', 'student', 'landlord', 'about',
] satisfies SyncIconName[]);

const LUCIDE: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  brush: Brush,
  doc: FileText,
  graduation: GraduationCap,
  help: HelpCircle,
  home: Home,
  megaphone: Megaphone,
  plus: Plus,
  shield: ShieldCheck,
  star: Star,
  store: Store,
  ticket: Ticket,
  truck: Truck,
  users: Users,
  wifi: Wifi,
};

export function NavIcon({ name, size = 18 }: { name?: string; size?: number }) {
  if (name && KIT.has(name)) {
    return <SyncIcon name={name as SyncIconName} size={size} />;
  }
  const Icon = (name && LUCIDE[name]) || FileText;
  return <Icon style={{ width: size, height: size }} aria-hidden="true" />;
}
