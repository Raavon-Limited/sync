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
import SyncIcon, { SYNC_ICON_NAMES, type SyncIconName } from '@/components/brand/SyncIcon';

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
  if (name && (SYNC_ICON_NAMES as readonly string[]).includes(name)) {
    return <SyncIcon name={name as SyncIconName} size={size} />;
  }
  const Icon = (name && LUCIDE[name]) || FileText;
  return <Icon style={{ width: size, height: size }} aria-hidden="true" />;
}
