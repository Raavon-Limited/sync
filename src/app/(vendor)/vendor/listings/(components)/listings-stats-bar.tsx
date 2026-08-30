import { CustomCard } from '@/components/shared/card';
import { Listing } from '@/modules/vendor/types';
import { BadgeCheck, FilePenLine, Package, PackageX } from 'lucide-react';

interface ListingStatsBarProps {
  listings: Listing[];
  /**
   * Listing ids that the active store has run out of. Sold-out is per store —
   * see the shared catalogue migration — so this cannot be derived from the
   * catalogue rows alone.
   */
  soldOutIds?: Set<string>;
}

export function ListingStatsBar({ listings, soldOutIds }: ListingStatsBarProps) {
  const total = listings.length;
  const active = listings.filter((l) => l.status === 'Active').length;
  const archived = listings.filter((l) => l.status === 'Archived').length;
  // Counted from the STORE's stock, not `listings.status`. The old line was
  // `l.status === 'Out of Stock'` — a value the check constraint allows and
  // that nothing in the app or the database has ever written, so this tile
  // read 0 permanently no matter how much had actually run out.
  const outOfStock = soldOutIds
    ? listings.filter((l) => soldOutIds.has(l.id)).length
    : 0;

  const stats = [
    {
      label: 'TOTAL LISTINGS',
      value: total,
      valueColor: 'text-ink',
      icon: <Package className="size-5 text-blue-600" />,
      iconBg: 'bg-blue-100',
    },
    {
      label: 'ACTIVE',
      value: active,
      valueColor: 'text-green-600',
      icon: <BadgeCheck className="size-5 text-green-600" />,
      iconBg: 'bg-green-100',
    },
    {
      label: 'ARCHIVED',
      value: archived,
      valueColor: 'text-amber-600',
      icon: <FilePenLine className="size-5 text-amber-600" />,
      iconBg: 'bg-amber-100',
    },
    {
      label: 'SOLD OUT HERE',
      value: outOfStock,
      valueColor: 'text-red-600',
      icon: <PackageX className="size-5 text-red-600" />,
      iconBg: 'bg-red-100',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <CustomCard
          key={stat.label}
          label={stat.label}
          value={<span className={stat.valueColor}>{stat.value}</span>}
          icon={stat.icon}
          iconBg={stat.iconBg}
        />
      ))}
    </div>
  );
}
