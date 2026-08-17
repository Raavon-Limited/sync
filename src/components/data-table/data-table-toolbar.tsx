'use client';

import { Input } from '@/components/ui/input';

/**
 * Default toolbar for <DataTable>: just the search box.
 *
 * It used to also render a status <Select> hardcoded with the *order* statuses
 * (Pending/Processing/Delivered/Cancelled). Since this is the fallback toolbar
 * for every DataTable, any other table silently inherited an orders filter -
 * Earnings only escaped it by passing `showToolbar={false}`. Filters that mean
 * something to one screen belong to that screen; pass your own via the
 * `toolbar` prop, as the orders page now does with its status cards.
 */
interface Props {
  searchValue: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  placeholder = 'Search...',
}: Props) {
  return (
    <div className="bg-panel flex items-center justify-between gap-4 rounded-md p-4">
      <Input
        placeholder={placeholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        className="!border-line/20 max-w-sm !ring-0 !outline-none focus:!ring-0 focus-visible:!ring-0 focus-visible:!outline-none"
      />
    </div>
  );
}
