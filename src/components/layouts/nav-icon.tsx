/**
 * NavIcon - every section/feature icon in the app, by name, from Lucide.
 *
 * ONE ICON SET (Nov 2026). This used to mix the brand kit's hand-drawn
 * section icons (SyncIcon), Lucide and react-icons. Everything is Lucide now,
 * so a hostel is the same hostel in the dock, the nav, the landing and the
 * empty states. The keys include the kit's old names ('hot-spots',
 * 'around-you'...) so existing `iconName` values keep working.
 *
 * `solid` is the landing page's style. Lucide is an OUTLINE set with no filled
 * variant, so "solid" means: closed shapes filled with currentColor and a
 * heavier stroke. SOLID_SAFE lists the glyphs that still read correctly when
 * filled; open shapes (Wi-Fi, utensils, compass) would vanish or turn into a
 * blob, so they stay outline at the same heavy weight.
 */
import {
  Briefcase,
  Brush,
  Building2,
  CalendarDays,
  Compass,
  FileText,
  Flame,
  GraduationCap,
  Hammer,
  HelpCircle,
  House,
  Info,
  KeyRound,
  Megaphone,
  Plus,
  Shirt,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Ticket,
  Truck,
  UtensilsCrossed,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  // Sections (keys match config/modules iconName)
  'around-you': Compass,
  hostels: Building2,
  events: CalendarDays,
  food: UtensilsCrossed,
  beauty: Sparkles,
  workmanship: Hammer,
  laundry: Shirt,
  'hot-spots': Flame,
  student: GraduationCap,
  landlord: KeyRound,
  about: Info,
  // Nav and landing extras
  briefcase: Briefcase,
  brush: Brush,
  doc: FileText,
  graduation: GraduationCap,
  help: HelpCircle,
  home: House,
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

/** Names whose Lucide glyph still reads correctly when filled. */
const SOLID_SAFE = new Set([
  'beauty', 'hot-spots', 'star', 'ticket', 'megaphone', 'shield', 'home', 'laundry',
  'landlord', 'briefcase', 'brush', 'workmanship', 'truck', 'users', 'student', 'graduation',
]);

export function NavIcon({
  name,
  size = 18,
  solid = false,
  className,
}: {
  name?: string;
  size?: number;
  solid?: boolean;
  className?: string;
}) {
  const Icon = (name && ICONS[name]) || FileText;
  const fill = solid && !!name && SOLID_SAFE.has(name);
  return (
    <Icon
      size={size}
      strokeWidth={solid ? 2.25 : 2}
      fill={fill ? 'currentColor' : 'none'}
      className={className}
      aria-hidden="true"
    />
  );
}
