/**
 * Manage stores   the locations themselves.
 *
 * WHAT MOVED OUT AND WHY
 *   The roster, the invitations and the activity feed used to live at the
 *   bottom of this page, scoped to whichever store card was highlighted. That
 *   made "who works for me" a per-store question, which is not how an owner
 *   thinks about it   they hire a person, then decide where and what. Those
 *   sections are /vendor/team now, across every store at once.
 *
 * TWO AUDIENCES, ONE ROUTE
 *   Every write here (create, promote, archive) is owner-scoped in the
 *   database, so a manager arriving would get controls that refuse. Rather
 *   than hide the route   which needs the shared nav config to become
 *   role-aware   this renders a manager view: the store they run, what they
 *   were given, and a plain statement of where their authority ends.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Store,
  Star,
  ShieldCheck,
  Clock,
  MapPinOff,
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  Plus,
  BarChart3,
  TriangleAlert,
} from 'lucide-react';
import { CooldownSheet } from './cooldown-sheet';
import { StoreFormDialog } from './store-form-dialog';
import { StoreAnalytics } from './store-analytics';
import { StoreTransactions } from './store-transactions';
import {
  Button,
  Badge,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StoreFacts, type StoreFactsData } from '@/components/shared/store-facts';
import { useModalStore } from '@/store/use-modal-store';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import {
  isStoreOpen,
  pauseMinutesLeft,
  scopeLabel,
  type Storefront,
} from '@/modules/storefronts/types';
import {
  useMyStorefronts,
  useSetPrimaryStorefront,
  useSetStorefrontArchived,
} from '@/modules/storefronts/hooks';
import { useMyStorefront } from '@/modules/vendor/hooks';

/** The one line that says what a student would see right now. */
function statusLine(s: Storefront) {
  if (s.archivedAt) return 'Archived   hidden from students';
  if (!s.isAcceptingOrders) return 'Closed';
  // Three states, not two. "Paused" used to mean the manual switch was off; it
  // now means a cooldown, and a store closed indefinitely is a different thing
  // from one that reopens in six minutes.
  return isStoreOpen(s) ? 'Accepting orders' : `Paused · ${pauseMinutesLeft(s.pausedUntil)} min left`;
}

/**
 * A branch, in the shape the shared panel renders.
 *
 * The mapper lives here rather than in the component because the vendor's
 * `Storefront` and the admin's raw row are two different sources for one panel
 * - which is the point of sharing it. `coords` is already the pair that the
 * admin reads as lat/lng columns.
 */
function storeFacts(store: Storefront, brandName?: string | null): StoreFactsData {
  return {
    name: store.name,
    brand: brandName ?? null,
    imageUrl: store.imageUrl ?? null,
    area: store.area ?? null,
    address: store.address ?? null,
    phone: store.publicPhone ?? null,
    opensAt: store.opensAt ?? null,
    closesAt: store.closesAt ?? null,
    isAcceptingOrders: store.isAcceptingOrders,
    pausedUntil: store.pausedUntil ?? null,
    pauseReason: store.pauseReason ?? null,
    autoPauseAfter: store.autoPauseAfter,
    autoPauseMinutes: store.autoPauseMinutes,
    isPrimary: store.isPrimary,
    lat: store.coords?.lat ?? null,
    lng: store.coords?.lng ?? null,
    verifiedAt: store.verifiedAt ?? null,
    createdAt: store.createdAt,
  };
}

export function StoresContainer() {
  const { activeId, setActive, isOwner, storefronts: managed } = useActiveStorefront();
  // Archived stores are the owner's own history and nobody else's   the public
  // policy filters them out at the database, so this cannot leak one.
  const { data: stores = [], isLoading } = useMyStorefronts({ includeArchived: true });
  const { data: brand, isLoading: brandLoading } = useMyStorefront();

  /**
   * OWNING A BUSINESS, NOT OWNING A STORE.
   *
   * `isOwner` comes from the ACTIVE branch's capacity, and there is no active
   * branch until a branch exists. So a vendor with no stores read as a manager,
   * got the manager view below, and that view has no way to add a store. You
   * needed a store to be recognised as the owner, and owner rights to make one:
   * the first store could never be created, by anybody. Every account on the
   * platform had zero stores, and therefore nowhere to put a listing.
   *
   * `brand` is the caller's own `vendor_profiles` row, which is what actually
   * makes somebody a business owner. A manager invited to staff a branch has no
   * such row, so they still get the manager view.
   */
  const ownsBusiness = !!brand;

  const [selected, setSelected] = useState<string | null>(null);
  const active = stores.filter((s) => !s.archivedAt);
  const archived = stores.filter((s) => s.archivedAt);

  // Never resolves to an archived store: it is the one you cannot work in, and
  // a cooldown panel pointed at it would be controls that do nothing.
  const branchId =
    (selected && active.some((s) => s.id === selected) ? selected : null) ??
    (active.some((s) => s.id === activeId) ? activeId : null) ??
    active[0]?.id ??
    null;
  const selectedStore = active.find((s) => s.id === branchId) ?? null;

  const promote = useSetPrimaryStorefront();
  const setArchived = useSetStorefrontArchived();
  const [confirming, setConfirming] = useState<Storefront | null>(null);

  // Both, or the manager view flashes up for an owner while the business row is
  // still in flight   which is the wrong page, not just an early one.
  if (isLoading || brandLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  // A MANAGER GETS A DIFFERENT PAGE, NOT AN EMPTY ONE.
  // Every write below is owner-scoped in the database, so a manager would see
  // controls that refuse. Showing them the store they actually run   and the
  // sections they were handed   is both honest and more useful than hiding the
  // route, and it states the permission boundary rather than leaving them to
  // discover it by hitting an error.
  if (!isOwner && !ownsBusiness) {
    return (
      <div className="flex flex-col gap-4">
        {managed.map((s) => (
          <div key={s.id} className="border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4">
            <span className="flex flex-wrap items-center gap-2">
              <Store className="text-lime-deep size-4" />
              <span className="text-content font-medium">{s.name}</span>
              <Badge className="bg-blue-100 text-blue-700">You manage this</Badge>
            </span>
            {s.area ? (
              <span className="text-content-muted text-xs">{s.area}</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <MapPinOff className="size-3 shrink-0" />
                No area   students cannot find this store
              </span>
            )}
            <span className="text-content-muted text-xs">{statusLine(s)}</span>
            {/* What they were actually given. Without this a manager finds out
                they cannot touch the menu by tapping it and being refused. */}
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {s.scopes.map((sc) => (
                <Badge key={sc} className="bg-ink/5 text-content-muted">
                  {scopeLabel(sc)}
                </Badge>
              ))}
            </span>
          </div>
        ))}
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
          You can work the sections listed above. Adding or archiving stores, inviting other
          managers and the owner&apos;s earnings stay with the owner.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Stores ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
            <Store className="size-4" /> Your stores
          </h2>
          {/* Both page-level actions in one place. The cooldown still applies
              to ONE store   the one being worked   so the trigger names it
              rather than sitting here unlabelled: a control that silently
              closed whichever card was highlighted is the easiest possible way
              to shut the wrong shop. */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedStore && <CooldownSheet store={selectedStore} />}
            <StoreFormDialog
              verificationStatus={brand?.verificationStatus}
              isFirstStore={active.length === 0}
            />
          </div>
        </div>
        {selectedStore && active.length > 1 && (
          <p className="text-content-muted -mt-1 text-xs">
            Cooldown applies to <span className="text-content">{selectedStore.name}</span>, the
            store you are working in.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((s) => (
            <StoreCard
              key={s.id}
              store={s}
              brandName={brand?.businessName ?? null}
              isWorking={s.id === branchId}
              onWorkHere={() => {
                setSelected(s.id);
                setActive(s.id);
              }}
              onPromote={() => promote.mutate(s.id)}
              onArchive={() => setConfirming(s)}
              busy={promote.isPending || setArchived.isPending}
              canArchive={active.length > 1}
            />
          ))}
        </div>

        {/* The state every new business starts in. Without it the page is a
            heading and a button over dead space, which reads as a screen that
            failed to load rather than one waiting to be used. */}
        {active.length === 0 && (
          <div className="border-line/10 rounded-xl border border-dashed p-6">
            <p className="text-content text-sm font-medium">No store yet</p>
            <p className="text-content-muted mt-1 max-w-xl text-sm">
              A store is one location, with its own trading hours and order queue. You need one
              before a listing has anywhere to live.
            </p>
          </div>
        )}

        {setArchived.error && (
          <p className="text-coral flex items-start gap-1 text-xs">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            {(setArchived.error as Error).message}
          </p>
        )}
        {promote.isError && (
          <p className="text-coral text-xs">{(promote.error as Error)?.message}</p>
        )}
      </section>

      {/* ── Archived ─────────────────────────────────────────────────────── */}
      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
            <Archive className="size-4" /> Archived
          </h2>
          <p className="text-content-muted text-sm">
            Hidden from students and out of search. Their orders and history are kept. A store you
            bring back comes back <em>closed</em>, so you can check its stock before it starts
            taking orders again.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((s) => (
              <div
                key={s.id}
                className="border-line/10 bg-panel/60 flex flex-col gap-1 rounded-xl border border-dashed p-4"
              >
                <span className="text-content-muted font-medium line-through">{s.name}</span>
                <span className="text-content-muted text-xs">
                  {s.area ?? 'No area'} · archived{' '}
                  {new Date(s.archivedAt!).toLocaleDateString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-fit gap-1"
                  disabled={setArchived.isPending}
                  onClick={() => setArchived.mutate({ id: s.id, archived: false })}
                >
                  <ArchiveRestore className="size-3" /> Bring back
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── How they are doing ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="size-4" /> Performance
        </h2>
        <StoreAnalytics />
      </section>

      {/* ── The orders behind those numbers ──────────────────────────────── */}
      {/* Scoped to the store being worked when there is more than one, so the
          table answers the same question as the cards above it rather than
          merging every location into one undifferentiated list. */}
      <StoreTransactions
        storefrontId={active.length > 1 ? branchId : null}
        storeName={active.length > 1 ? (selectedStore?.name ?? null) : null}
      />

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(v) => !v && setConfirming(null)}
        title={`Archive ${confirming?.name ?? 'this store'}?`}
        description="Students stop seeing it immediately and it drops out of search. Its orders, listings and history are kept, and you can bring it back at any time."
        confirmLabel="Archive"
        destructive
        loading={setArchived.isPending}
        onConfirm={() => {
          if (!confirming) return;
          setArchived.mutate(
            { id: confirming.id, archived: true },
            // Left open on failure on purpose   the refusals here are real
            // ("finish these orders first") and closing the dialog would throw
            // the reason away before it was read.
            { onSuccess: () => setConfirming(null) },
          );
        }}
      />
    </div>
  );
}

function StoreCard({
  store,
  brandName,
  isWorking,
  onWorkHere,
  onPromote,
  onArchive,
  busy,
  canArchive,
}: {
  store: Storefront;
  /** The business this branch trades under. Shown in the panel, where the
   *  branch name alone ("Phase 1") does not say whose it is. */
  brandName?: string | null;
  isWorking: boolean;
  onWorkHere: () => void;
  onPromote: () => void;
  onArchive: () => void;
  busy: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const openAddListing = useModalStore((s) => s.openAddListing);

  /**
   * Stock this branch, from the branch.
   *
   * Listings are shown for the store being WORKED, so sending somebody to
   * /vendor/listings without setting that first lands them on a different
   * store's menu and the item they add belongs to the wrong shop. Three steps,
   * in this order: point the dashboard here, open the form, then navigate.
   * The modal store is global, so it is already open when the page arrives.
   */
  const addItems = () => {
    onWorkHere();
    openAddListing();
    router.push('/vendor/listings');
  };

  return (
    // A div, not a button. The card used to be a <button> with clickable spans
    // inside it, which is invalid HTML and gave keyboard users an action they
    // could not reach. The header below is the one button; the actions are
    // their own, and neither is nested in the other.
    <div
      className={`border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4 transition-colors ${
        isWorking ? 'border-lime-deep/40 ring-lime-deep/20 ring-2' : 'hover:border-line/25'
      }`}
    >
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="hover:bg-ink/5 -m-1 flex w-full items-start gap-3 rounded-lg p-1 text-left transition-colors"
          >
            {/* THE SHOPFRONT. A vendor with three branches was reading three
                identical cards distinguished only by a line of text, and the
                photo is the fastest way to tell which door a card is about. */}
            <span className="bg-surface-deep relative size-14 shrink-0 overflow-hidden rounded-lg">
              {store.imageUrl ? (
                <Image
                  src={store.imageUrl}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <span className="text-content-muted absolute inset-0 grid place-items-center text-[10px]">
                  No photo
                </span>
              )}
            </span>

            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-content font-medium">{store.name}</span>
                {store.isPrimary && (
                  <Badge className="bg-lime/15 text-lime-deep gap-1">
                    <Star className="size-3" /> Primary
                  </Badge>
                )}
                {/*
                  SAID ON EVERY STORE, not only the verified ones.
                  A new branch is queued for a visit the moment it is created
                  (20260912120000), and until an agent has been there the vendor
                  has no way of knowing that is happening. An absent badge would
                  read as "nothing to see"; "Visit pending" says the check is
                  coming and that nothing is required of them, which is the
                  whole difference between waiting and being ignored.
                */}
                {store.verifiedAt ? (
                  <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
                    <ShieldCheck className="size-3" /> Verified
                  </Badge>
                ) : (
                  <Badge className="bg-ink/5 text-content-muted gap-1">
                    <Clock className="size-3" /> Visit pending
                  </Badge>
                )}
              </span>

              {/* Not cosmetic. Discovery is location-first: a store with no area
                  is left out of the campus board and cannot be ranked by
                  distance, so students simply never see it. Nothing errors   it
                  is just absent, which is the hardest kind of bug to notice
                  from the vendor's side. */}
              {store.area ? (
                <span className="text-content-muted text-xs">{store.area}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <MapPinOff className="size-3 shrink-0" />
                  No area   students cannot find this store
                </span>
              )}

              <span className="text-content-muted text-xs">
                {store.coords ? 'Pinned on the map' : 'No map pin'} · {statusLine(store)}
              </span>
            </span>
          </button>
        </SheetTrigger>

        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
          <SheetHeader className="pr-8 pb-4">
            <SheetTitle>{store.name}</SheetTitle>
            <SheetDescription>
              Everything students see about this branch, and what it has been doing.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="flex flex-col gap-6">
            {/* THE SAME COMPONENT the reviewer sees on /admin/verify-visits.
                One shape means a vendor and the person deciding whether their
                shop is real are looking at the same facts, and a field added
                for either appears on both the same day. */}
            <StoreFacts
              store={storeFacts(store, brandName)}
              headingClassName="font-display text-content flex flex-wrap items-center gap-2 text-lg"
            />

            {/* The reason most vendors open a store at all, and it was two
                screens away: Stores, then Listings, then work out which branch
                the listings screen was pointed at. */}
            <section className="border-line/10 flex flex-col gap-2 rounded-xl border border-dashed p-4">
              <p className="text-content text-sm font-medium">Stock this branch</p>
              <p className="text-content-muted text-sm">
                An item belongs to the store it is sold from. This points the dashboard at{' '}
                {store.name} and opens a new item straight away.
              </p>
              <Button onClick={addItems} className="gap-1 self-start">
                <Plus className="size-4" /> Add an item to this store
              </Button>
            </section>

            {/* Its own orders, not the brand's. The page-level table follows
                whichever store is being worked; this one is always about the
                branch whose card was opened. */}
            <StoreTransactions storefrontId={store.id} storeName={store.name} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* "Work here" points the rest of the dashboard at this store: the
            order queue, the listings grid, the stock switches and the cooldown
            all read one active store, and this is what sets it. It is the
            sidebar's store switcher, repeated on the card the vendor is
            already looking at. The label says the state rather than the verb
            once it is on, because "Work here" on the store you are already in
            reads as a button that does nothing. */}
        <Button
          variant={isWorking ? 'ghost' : 'outline'}
          size="sm"
          onClick={onWorkHere}
          disabled={isWorking}
          className="gap-1"
          title={
            isWorking
              ? 'Orders, listings and stock on this dashboard are showing this store'
              : 'Point orders, listings and stock at this store'
          }
        >
          {isWorking ? (
            <>
              <Check className="size-3" /> Working here
            </>
          ) : (
            'Work here'
          )}
        </Button>

        {/* Per card, not per page. One Edit button tied to the highlighted
            store meant editing a second store took two clicks and a guess
            about which one it would open. */}
        <StoreFormDialog
          store={store}
          trigger={
            <Button variant="ghost" size="sm" className="gap-1">
              <Pencil className="size-3" /> Edit
            </Button>
          }
        />

        {!store.isPrimary && (
          <Button variant="ghost" size="sm" onClick={onPromote} disabled={busy}>
            Make primary
          </Button>
        )}

        {/* Hidden rather than disabled when it is the only store: there is
            nothing the vendor could do about it, and a greyed control invites
            a hunt for the reason. */}
        {canArchive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArchive}
            disabled={busy}
            className="text-content-muted hover:text-coral gap-1"
          >
            <Archive className="size-3" /> Archive
          </Button>
        )}
      </div>
    </div>
  );
}
