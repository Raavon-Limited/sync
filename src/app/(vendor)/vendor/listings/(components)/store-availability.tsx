/**
 * Which stores carry one catalogue item, and on what terms.
 *
 * WHY THIS EXISTS
 *   Since the shared catalogue (20260829090000) a `listings` row belongs to the
 *   BUSINESS, and `storefront_listings` decides which stores sell it, at what
 *   price and with how much stock. Without this panel the catalogue is
 *   shared in the schema and unreachable in the product: an item could only
 *   ever be sold by the store it was created at.
 *
 * IT ALSO CLOSES A TRAP
 *   The listing editor still has a Stock field, and it writes `listings.stock`
 *     a column no student-facing read consults any more. A vendor could set it
 *   to 40 and watch nothing change. Stock that matters is per store, and this
 *   is where it is set.
 *
 * SOLD OUT IS NOT THE SAME AS NOT CARRIED
 *   `stock = 0` means we ran out today. `is_listed = false` means we do not do
 *   this here. Collapsing them into one switch loses a distinction the vendor
 *   actually makes every day, so they are two controls.
 */
'use client';

import { useState } from 'react';
import { Store, PackageX, PackageCheck } from 'lucide-react';
import { Button, Input, Badge, Spinner, Checkbox } from '@/components/ui';
import { useMyStorefronts } from '@/modules/storefronts/hooks';
import { useStoreListings, useSetStoreListing, useSetSoldOut } from '@/modules/storefronts/hooks';
import { koboToNaira, nairaToKobo } from '@/lib/query/helpers';

/**
 * The same question, before the listing exists.
 *
 * WHY A SEPARATE COMPONENT AND NOT THE ONE BELOW
 *   Every control below writes a `storefront_listings` row keyed on a listing
 *   id, and on the create screen there is no id yet   the row cannot exist
 *   until the listing does. So this collects an intention and the caller
 *   applies it after the insert. Sharing one component would mean every write
 *   growing an "unless we are creating" branch.
 *
 * DEFAULTS TO EVERY STORE. A vendor adding a dish to a business with three
 * branches almost always sells it at three branches; the old behaviour put it
 * at whichever one happened to be primary and gave no hint that the other two
 * were missing it.
 */
export function StorePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: stores = [], isLoading } = useMyStorefronts();

  if (isLoading) return <Spinner />;
  if (!stores.length) {
    return <p className="text-content-muted text-sm">No stores yet.</p>;
  }

  const all = stores.length > 0 && stores.every((s) => value.includes(s.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-content-muted flex items-center gap-2 font-mono text-xs tracking-wide">
          <Store className="size-3" /> SELL AT
        </h4>
        {stores.length > 1 && (
          <button
            type="button"
            onClick={() => onChange(all ? [] : stores.map((s) => s.id))}
            className="text-lime-deep text-xs underline underline-offset-2"
          >
            {all ? 'Clear all' : 'Select all stores'}
          </button>
        )}
      </div>

      {stores.map((s) => (
        <label
          key={s.id}
          className="border-line/10 hover:border-line/25 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
        >
          <Checkbox checked={value.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
          <span className="text-content min-w-0 flex-1 truncate text-sm">{s.name}</span>
          <span className="text-content-muted text-xs">{s.area ?? 'No area'}</span>
        </label>
      ))}

      {value.length === 0 && (
        <p className="text-xs text-amber-600">
          Not sold anywhere yet   nobody will be able to order it. You can change this later.
        </p>
      )}
      <p className="text-content-muted text-xs">
        Price and stock are per store. Set them per branch after it is created.
      </p>
    </div>
  );
}

export function StoreAvailability({
  listingId,
  catalogueNaira,
}: {
  listingId: string;
  /** Shown as the fallback, so "inherits" has a visible number next to it. */
  catalogueNaira: number;
}) {
  const { data: stores = [], isLoading } = useMyStorefronts();
  const setListing = useSetStoreListing();
  const setSoldOut = useSetSoldOut();

  if (isLoading) return <Spinner />;
  if (!stores.length) {
    return <p className="text-content-muted text-sm">No stores yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-content-muted flex items-center gap-2 font-mono text-xs tracking-wide">
          <Store className="size-3" /> SOLD AT
        </h4>
        {/* One tap for the common case. Adding an item to every branch by hand is
            four round trips a vendor should not have to make. `stock: null` is
            untracked, not zero   see setSoldOut for why those differ. */}
        {stores.length > 1 && (
          <button
            type="button"
            disabled={setListing.isPending}
            onClick={() =>
              stores.forEach((s) =>
                setListing.mutate({
                  storefrontId: s.id,
                  listingId,
                  isListed: true,
                  stock: null,
                }),
              )
            }
            className="text-lime-deep text-xs underline underline-offset-2 disabled:opacity-50"
          >
            Sell at every store
          </button>
        )}
      </div>
      {stores.map((s) => (
        <StoreRow
          key={s.id}
          storefrontId={s.id}
          storeName={s.name}
          listingId={listingId}
          catalogueNaira={catalogueNaira}
          onSave={setListing.mutate}
          onSoldOut={setSoldOut.mutate}
          busy={setListing.isPending || setSoldOut.isPending}
        />
      ))}
      {(setListing.error || setSoldOut.error) && (
        <p className="text-coral text-xs">
          {((setListing.error ?? setSoldOut.error) as Error).message}
        </p>
      )}
    </div>
  );
}

function StoreRow({
  storefrontId,
  storeName,
  listingId,
  catalogueNaira,
  onSave,
  onSoldOut,
  busy,
}: {
  storefrontId: string;
  storeName: string;
  listingId: string;
  catalogueNaira: number;
  onSave: (v: {
    storefrontId: string;
    listingId: string;
    priceKobo?: number | null;
    stock?: number | null;
    isListed?: boolean;
  }) => void;
  onSoldOut: (v: { storefrontId: string; listingId: string; soldOut: boolean }) => void;
  busy: boolean;
}) {
  const { data: rows = [] } = useStoreListings(storefrontId);
  const row = rows.find((r) => r.listingId === listingId);

  const carried = !!row?.isListed;
  const soldOut = carried && row?.stock === 0;
  const [price, setPrice] = useState('');

  // Seeded once the row arrives, keyed on the store so a refetch cannot
  // overwrite a price the vendor is part-way through typing.
  const [seeded, setSeeded] = useState<string | null>(null);
  if (row && seeded !== storefrontId) {
    setSeeded(storefrontId);
    setPrice(row.priceKobo == null ? '' : String(koboToNaira(row.priceKobo)));
  }

  return (
    <div className="border-line/10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-content min-w-24 flex-1 text-sm">{storeName}</span>

      {carried && (
        <Badge
          className={
            soldOut ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'
          }
        >
          {soldOut ? 'Sold out' : 'Available'}
        </Badge>
      )}

      {carried ? (
        <>
          <label className="flex items-center gap-1">
            <span className="text-content-muted text-xs">₦</span>
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              // Empty means inherit, so the placeholder shows what it inherits.
              placeholder={String(catalogueNaira)}
              onBlur={() =>
                onSave({
                  storefrontId,
                  listingId,
                  priceKobo: price.trim() === '' ? null : nairaToKobo(Number(price)),
                })
              }
              className="w-24"
            />
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onSoldOut({ storefrontId, listingId, soldOut: !soldOut })}
            className="gap-1"
          >
            {soldOut ? (
              <>
                <PackageCheck className="size-3" /> Back in stock
              </>
            ) : (
              <>
                <PackageX className="size-3" /> Sold out
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onSave({ storefrontId, listingId, isListed: false })}
          >
            Remove
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          // Stock null on purpose: adding an item to a store says you have it,
          // not that you are committing to count it.
          onClick={() => onSave({ storefrontId, listingId, isListed: true, stock: null })}
        >
          Sell here
        </Button>
      )}
    </div>
  );
}
