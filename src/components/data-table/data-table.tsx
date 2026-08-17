'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchColumn?: string;

  toolbar?: React.ReactNode;
  showToolbar?: boolean;

  onRowClick?: (row: TData) => void;

  /** Sort applied on first render, e.g. newest-first for a queue. */
  initialSorting?: SortingState;

  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,

  toolbar,
  showToolbar = true,

  onRowClick,

  initialSorting = [],

  emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);

  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useReactTable({
    data,
    columns,

    state: {
      globalFilter,
      pagination,
      sorting,
    },

    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,

    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4 rounded-md px-2 py-3 sm:px-4 md:px-6">
      {toolbar
        ? toolbar
        : showToolbar && (
            <DataTableToolbar searchValue={globalFilter} onSearchChange={setGlobalFilter} />
          )}

      <div className="border-line/5 bg-panel overflow-x-auto rounded-md border p-2">
        <Table className="min-w-max">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  if (header.isPlaceholder) return <TableHead key={header.id} />;

                  const label = flexRender(header.column.columnDef.header, header.getContext());

                  /*
                   * Sortable headers become buttons so they're keyboard
                   * reachable; the rest stay plain text. Columns opt out with
                   * `enableSorting: false` (e.g. the row-action column).
                   */
                  if (!header.column.getCanSort()) {
                    return <TableHead key={header.id}>{label}</TableHead>;
                  }

                  const sorted = header.column.getIsSorted();
                  const SortIcon =
                    sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;

                  return (
                    <TableHead key={header.id}>
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${header.column.id}`}
                        className="focus-visible:ring-accent-fg inline-flex items-center gap-1.5 rounded whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {label}
                        <SortIcon
                          className={cn('size-3.5 shrink-0', sorted ? 'opacity-100' : 'opacity-40')}
                          aria-hidden="true"
                        />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  /*
                   * A <tr> isn't focusable, so a click-only row is unreachable
                   * by keyboard. Make it tabbable and accept Enter/Space.
                   */
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  // Hover color is owned by TableRow; only add the affordance here.
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
