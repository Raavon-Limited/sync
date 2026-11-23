import { ColumnDef } from '@tanstack/react-table';
import { Transaction } from './types';
import { TxnDot, TxnStatusBadge } from './EarningsPage';

export const earningsColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'id',
    header: 'TRANSACTION ID',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium text-violet-600">{row.original.id}</span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'DESCRIPTION',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <TxnDot type={row.original.type} />
        <span>
          {row.original.customer
            ? `${row.original.description} – ${row.original.customer}`
            : row.original.description}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'date',
    header: 'DATE',
  },
  {
    accessorKey: 'amount',
    header: 'AMOUNT',
    cell: ({ row }) => (
      <span
        className={`font-display font-semibold ${
          row.original.amount > 0 ? 'text-accent-fg' : 'text-red-500'
        }`}
      >
        {row.original.amount > 0 ? '+' : ''}₦{Math.abs(row.original.amount).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'STATUS',
    cell: ({ row }) => <TxnStatusBadge status={row.original.status} />,
  },
];
