'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
  ColumnDef,
  PaginationState,
} from '@tanstack/react-table';

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

  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,

  toolbar,
  showToolbar = true,

  onRowClick,

  emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = React.useState('');

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
    },

    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,

    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4 rounded-md px-2 py-3 sm:px-4 md:px-6">
      {toolbar
        ? toolbar
        : showToolbar && (
            <DataTableToolbar
              table={table}
              searchValue={globalFilter}
              onSearchChange={setGlobalFilter}
            />
          )}

      <div className="border-line/5 bg-panel overflow-x-auto rounded-md border p-2">
        <Table className="min-w-max">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
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
