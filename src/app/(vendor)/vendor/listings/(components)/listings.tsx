'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Listing } from '@/modules/vendor/types';
import { koboToNaira, nairaToKobo } from '@/lib/query/helpers';
import {
  useMyListings,
  useUpsertListing,
  useDeleteListings,
  useArchiveListings,
  useListingCategories,
} from '@/modules/vendor/hooks';
import type { VendorListing } from '@/modules/vendor/queries';
import { ListingStatsBar } from './listings-stats-bar';
import { ListingFilters } from './listings-filters';
import { ListingBulkBar } from './listings-bulk-bar';
import { ListingGridCard } from './listings-grid-card';
import { ListingListView } from './listings-view';
import {
  AddListingModal,
  ArchiveModal,
  BulkDeleteModal,
  DeleteModal,
  EditModal,
} from './listings-modal';
import { useModalStore } from '@/store';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import { useStoreListings, useSetSoldOut } from '@/modules/storefronts/hooks';

/**
 * Fetched once with archived included, then filtered in memory.
 *
 * The stats bar counts archived and out-of-stock alongside active, so a
 * server-side status filter would make those tiles wrong. A vendor catalogue is
 * tens of rows, not thousands - the whole set is cheaper to hold than to
 * re-query on every filter change. Revisit past a few hundred listings.
 *
 * Declared at module scope, not inline: this object is part of the query key,
 * and a fresh literal each render would key a new cache entry every time.
 */
const LIST_FILTERS = { includeArchived: true } as const;

/**
 * DB row -> UI shape. `Listing` (what every child component consumes) predates
 * the schema and speaks Naira; the database stores kobo. Converting here keeps
 * that boundary in one function instead of scattering divisions through the
 * component tree.
 */
function toUiListing(row: VendorListing): Listing {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: koboToNaira(row.priceKobo),
    stock: row.stock,
    sold: row.sold,
    status: row.status,
    archivedAt: row.archivedAt,
    imageUrl: row.imageUrl ?? undefined,
  };
}

export default function ListingsPage() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All Status');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { data: rows, isLoading, isError, error } = useMyListings(LIST_FILTERS);

  // Stock and availability are per store, so the grid shows the store the
  // vendor is currently working in — the one in the switcher above.
  const { activeId, storefronts: managed } = useActiveStorefront();
  const { data: storeListings = [] } = useStoreListings(activeId ?? undefined);
  const storeTerms = useMemo(
    () => new Map(storeListings.map((sl) => [sl.listingId, sl])),
    [storeListings],
  );
  const activeStoreName = managed.find((m) => m.id === activeId)?.name ?? null;
  const soldOutIds = useMemo(
    () => new Set(storeListings.filter((sl) => sl.isListed && sl.stock === 0).map((sl) => sl.listingId)),
    [storeListings],
  );
  const setSoldOut = useSetSoldOut();
  const upsert = useUpsertListing();
  const remove = useDeleteListings();
  const archive = useArchiveListings(LIST_FILTERS);

  /*
   * Filter chips come from this vendor's taxonomy, not a constant - a clothing
   * vendor must not be offered Rice. 'All' is a UI sentinel and is never a
   * stored category.
   */
  const { data: categories = [] } = useListingCategories();
  const categoryOptions = useMemo(
    () => ['All', ...categories.map((c) => c.name)],
    [categories],
  );

  const listings = useMemo(() => (rows ?? []).map(toUiListing), [rows]);

  const {
    addListing,
    editListing,
    deleteListing,
    bulkDelete,
    archiveListings,
    openAddListing,
    closeAddListing,
    openEditListing,
    closeEditListing,
    openDeleteListing,
    closeDeleteListing,
    openBulkDelete,
    closeBulkDelete,
    openArchiveListings,
    closeArchiveListings,
  } = useModalStore();

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      const matchCat = category === 'All' || l.category === category;
      const matchStatus = status === 'All Status' || l.status === status;
      const matchSearch = l.name.toLowerCase().includes(search.toLowerCase());

      return matchCat && matchStatus && matchSearch;
    });
  }, [listings, category, status, search]);

  const filteredIds = filtered.map((listing) => listing.id);
  const selectedCount = selectedIds.size;
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id)) && !allSelected;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Every handler goes through the server; the cache is the source of truth.
  // `useArchiveListings` is optimistic internally because archiving is
  // reversible - create and delete are not, so they wait for confirmation.
  const handleAdd = (listing: Listing) => {
    upsert.mutate(
      {
        name: listing.name,
        category: listing.category,
        priceKobo: nairaToKobo(listing.price),
        stock: listing.stock,
        status: listing.status,
        imageUrl: listing.imageUrl ?? null,
      },
      {
        onSuccess: () => {
          toast.success('Listing added');
          closeAddListing();
        },
        onError: (e) => toast.error(e.message || 'Could not add the listing'),
      },
    );
  };

  const handleEdit = (updated: Listing) => {
    upsert.mutate(
      {
        id: updated.id,
        name: updated.name,
        category: updated.category,
        priceKobo: nairaToKobo(updated.price),
        stock: updated.stock,
        status: updated.status,
        imageUrl: updated.imageUrl ?? null,
      },
      {
        onSuccess: () => {
          toast.success('Listing updated');
          closeEditListing();
        },
        onError: (e) => toast.error(e.message || 'Could not save your changes'),
      },
    );
  };

  const handleDuplicate = (listing: Listing) => {
    // No id -> insert. `sold` is server-owned and deliberately not copied.
    upsert.mutate(
      {
        name: listing.name + ' (Copy)',
        category: listing.category,
        priceKobo: nairaToKobo(listing.price),
        stock: listing.stock,
        status: listing.status,
        imageUrl: listing.imageUrl ?? null,
      },
      {
        onSuccess: () => toast.success('Listing duplicated'),
        onError: (e) => toast.error(e.message || 'Could not duplicate'),
      },
    );
  };

  /**
   * Sold out is per store, so this needs one. Without an active store there is
   * nothing to mark, and silently doing nothing is how the ⋯ menu got its
   * reputation.
   */
  const handleToggleSoldOut = (listing: Listing, soldOut: boolean) => {
    if (!activeId) {
      toast.error('Pick a store first');
      return;
    }
    setSoldOut.mutate(
      { storefrontId: activeId, listingId: listing.id, soldOut },
      {
        onSuccess: () =>
          toast.success(soldOut ? `${listing.name} marked sold out` : `${listing.name} is back`),
        onError: (e) => toast.error(e.message || 'Could not update'),
      },
    );
  };

  /**
   * Promote was the other no-op on this card. Promotions are created on their
   * own page against a vendor-wide code, so this hands over rather than
   * pretending a listing-scoped campaign exists — `promotions` has no
   * listing_id.
   */
  const handlePromote = (listing: Listing) => {
    router.push(`/vendor/promotions?listing=${encodeURIComponent(listing.id)}`);
  };

  const handleDelete = (listing: Listing) => {
    remove.mutate([listing.id], {
      onSuccess: () => {
        toast.success('Listing deleted');
        closeDeleteListing();
      },
      onError: (e) => toast.error(e.message || 'Could not delete the listing'),
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);

    remove.mutate(ids, {
      onSuccess: () => {
        toast.success(ids.length + ' listings deleted');
        clearSelection();
        closeBulkDelete();
      },
      onError: (e) => toast.error(e.message || 'Could not delete the listings'),
    });
  };

  const handleArchive = () => {
    // The modal carries the ids it was opened with; fall back to the live
    // selection if it was opened without them.
    const ids = archiveListings.listingIds.length
      ? archiveListings.listingIds
      : Array.from(selectedIds);

    archive.mutate(ids, {
      onSuccess: () => {
        toast.success(ids.length + ' listings archived');
        clearSelection();
        closeArchiveListings();
      },
      onError: (e) => toast.error(e.message || 'Could not archive'),
    });
  };

  const activeCount = listings.filter((l) => l.status === 'Active').length;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-ink text-2xl font-bold">Listings</h1>
          <p className="text-muted text-sm">
            {isLoading
              ? 'Loading your catalogue...'
              : listings.length + ' products \u00b7 ' + activeCount + ' active'}
          </p>
        </div>
        <Button
          variant="primary"
          className="hover:bg-accent-fg bg-lime-500 text-white"
          onClick={openAddListing}
        >
          <Plus className="size-4" /> Add New Listing
        </Button>
      </div>

      {isError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load your listings: {(error as Error)?.message ?? 'unknown error'}
        </p>
      )}

      <ListingStatsBar listings={listings} soldOutIds={soldOutIds} />

      <ListingFilters
        categories={categoryOptions}
        selectedCategory={category}
        onCategoryChange={setCategory}
        selectedStatus={status}
        onStatusChange={setStatus}
        searchValue={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={(v) => {
          setView(v);
          clearSelection();
        }}
        allSelected={allSelected}
        someSelected={someSelected}
        selectedCount={selectedCount}
        onToggleSelectAll={toggleSelectAll}
      />

      <ListingBulkBar
        count={selectedIds.size}
        onEdit={() => {
          const first = listings.find((l) => selectedIds.has(l.id));

          if (first) {
            openEditListing(first);
          }
        }}
        onArchive={() => openArchiveListings(Array.from(selectedIds))}
        onDelete={openBulkDelete}
        onClear={clearSelection}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((listing) => (
            <ListingGridCard
              key={listing.id}
              listing={listing}
              selected={selectedIds.has(listing.id)}
              storeStock={storeTerms.get(listing.id)?.stock}
              storeCarries={storeTerms.get(listing.id)?.isListed ?? false}
              storeName={activeStoreName}
              onToggleSelect={toggleSelect}
              onEdit={openEditListing}
              onPromote={handlePromote}
              onDuplicate={handleDuplicate}
              onArchive={(l) => openArchiveListings([l.id])}
              onDelete={openDeleteListing}
              onToggleSoldOut={handleToggleSoldOut}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-muted col-span-full py-16 text-center text-sm">
              {listings.length === 0
                ? 'No listings yet. Add your first product to start selling.'
                : 'No listings match your filters.'}
            </p>
          )}
        </div>
      ) : (
        <ListingListView
          listings={filtered}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onEdit={openEditListing}
          onDuplicate={handleDuplicate}
          onDelete={openDeleteListing}
        />
      )}

      <AddListingModal open={addListing.open} onAdd={handleAdd} onClose={closeAddListing} />

      <EditModal
        open={editListing.open}
        listing={editListing.listing!}
        onSave={handleEdit}
        onClose={closeEditListing}
      />

      <DeleteModal
        open={deleteListing.open}
        listing={deleteListing.listing!}
        onConfirm={() => {
          if (deleteListing.listing) {
            handleDelete(deleteListing.listing);
          }
        }}
        onClose={closeDeleteListing}
      />

      <BulkDeleteModal
        open={bulkDelete.open}
        count={selectedIds.size}
        onConfirm={handleBulkDelete}
        onClose={closeBulkDelete}
      />

      <ArchiveModal
        open={archiveListings.open}
        count={archiveListings.listingIds.length}
        onConfirm={handleArchive}
        onClose={closeArchiveListings}
      />
    </section>
  );
}
