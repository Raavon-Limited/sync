'use client';

interface ListingBulkBarProps {
  count: number;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function ListingBulkBar({
  count,
  onEdit,
  onArchive,
  onDelete,
  onClear,
}: ListingBulkBarProps) {
  if (count === 0) return null;

  return (
    <div className="bg-ink text-cream flex items-center justify-between rounded-lg px-5 py-3">
      <p className="text-sm font-semibold">{count} selected</p>
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="rounded-lg bg-white/20 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/30"
        >
          Edit
        </button>
        <button
          onClick={onArchive}
          className="rounded-lg bg-white/20 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/30"
        >
          Archive
        </button>
        <button
          onClick={onClear}
          className="rounded-lg bg-white/20 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/30"
        >
          Clear
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg bg-red-500/80 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-red-500"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
