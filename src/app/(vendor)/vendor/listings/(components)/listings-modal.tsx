/**
 * The listing dialogs.
 *
 * TWO SHAPES, ON PURPOSE
 *   Add and Edit are SIDE PANELS. They are long forms   photo, name, category,
 *   price, and now which stores carry the item   and a centred box that tall
 *   fights the viewport on a laptop and scrolls its own header off the screen.
 *   A panel gets full height for free and leaves the catalogue visible beside
 *   it, which matters when the vendor is copying details off a row.
 *
 *   Delete, bulk delete and archive stay CENTRED. They are one sentence and a
 *   decision; putting them in a drawer makes a yes/no question feel like a
 *   place you have to navigate out of.
 *
 * WHY THE HAND-ROLLED MODAL WENT
 *   The old shell was a bare `fixed inset-0` div: no focus trap, no restore on
 *   close, no labelled title, and its headings were `text-ink`   a fixed near
 *   black   so on the dark theme "Add new listing" was drawn in #0e0e12 on a
 *   #0e0e12 panel and could not be read at all. Everything here is on the Radix
 *   primitives, which handle the first four, and on `text-content`, which is
 *   the token that follows the theme.
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { CategoryField } from './category-field';
import { Listing } from '@/modules/vendor/types';
import { ListingImageField } from './listing-image-field';
import { StoreAvailability, StorePicker } from './store-availability';

/** The panel Add and Edit share: full height, its own scroll, one close. */
function FormSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-line/10 shrink-0 border-b p-6 pb-4">
          <SheetTitle className="text-content">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {/* The form scrolls; the header and the actions do not. On a phone the
            alternative is a Save button that is only reachable after scrolling
            past everything you were unsure about. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6">{children}</div>

        <div className="border-line/10 flex shrink-0 justify-end gap-3 border-t p-6 py-4">
          {footer}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The centred box the three confirmations share. */
function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-content">{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{children}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-5 gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'outline' : 'primary'}
            onClick={onConfirm}
            className={cn(destructive && 'text-coral border-coral/30 hover:bg-coral/10')}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm ───────────────────────────────────────────────
interface DeleteModalProps {
  open: boolean;
  listing: Listing;
  onConfirm: () => void;
  onClose: () => void;
}
export function DeleteModal({ open, listing, onConfirm, onClose }: DeleteModalProps) {
  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      title="Delete listing"
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
    >
      Are you sure you want to delete{' '}
      <span className="text-content font-semibold">&ldquo;{listing?.name}&rdquo;</span>? This
      action cannot be undone.
    </ConfirmSheet>
  );
}

// ── Bulk delete confirm ──────────────────────────────────────────
interface BulkDeleteModalProps {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}
export function BulkDeleteModal({ open, count, onConfirm, onClose }: BulkDeleteModalProps) {
  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      title={`Delete ${count} listings`}
      confirmLabel="Delete all"
      destructive
      onConfirm={onConfirm}
    >
      Are you sure you want to delete{' '}
      <span className="text-content font-semibold">{count} listings</span>? This action cannot be
      undone.
    </ConfirmSheet>
  );
}

// ── Archive confirm ──────────────────────────────────────────────
interface ArchiveModalProps {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}
export function ArchiveModal({ open, count, onConfirm, onClose }: ArchiveModalProps) {
  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      title={`Archive ${count} listing${count > 1 ? 's' : ''}`}
      confirmLabel="Archive"
      onConfirm={onConfirm}
    >
      Archived listings are hidden from your storefront but can be restored anytime from your
      archive.
    </ConfirmSheet>
  );
}

// ── Edit ─────────────────────────────────────────────────────────
interface EditModalProps {
  open: boolean;
  listing: Listing;
  onSave: (updated: Listing) => void;
  onClose: () => void;
}
export function EditModal({ open, listing, onSave, onClose }: EditModalProps) {
  const [form, setForm] = useState({ ...listing });

  // Re-seeded during render whenever the panel opens against a different item.
  // Doing it in an effect painted the previous listing's name for one frame.
  const seedKey = open && listing ? listing.id : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seeded !== seedKey) {
    setSeeded(seedKey);
    if (listing) setForm({ ...listing });
  }

  if (!open || !listing) return null;

  const set = (key: keyof Listing, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Edit listing"
      description="Name, photo and price are shared across every store. Stock and each store's own price are set below."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={() => onSave(form)}>
            Save changes
          </Button>
        </>
      }
    >
      <ListingImageField value={form.imageUrl ?? ''} onChange={(url) => set('imageUrl', url)} />

      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="input-clean"
        />
      </Field>

      <CategoryField value={form.category} onChange={(name) => set('category', name)} />

      <Field label="Price (₦)">
        <Input
          type="number"
          value={form.price}
          onChange={(e) => set('price', Number(e.target.value))}
          className="input-clean"
        />
        <p className="text-content-muted mt-1 text-xs">
          The catalogue price. A store can charge something else below.
        </p>
      </Field>

      {/* The Stock field that used to sit here wrote `listings.stock`, which
          no student-facing read consults since the shared catalogue landed  
          a vendor could set it to 40 and watch nothing change. Stock is per
          store, and this is where it lives. */}
      <div className="border-line/10 border-t pt-3">
        <StoreAvailability listingId={form.id} catalogueNaira={form.price} />
      </div>
    </FormSheet>
  );
}

// ── Add ──────────────────────────────────────────────────────────
const EMPTY: Omit<Listing, 'id' | 'sold'> = {
  name: '',
  // No default: the correct category depends on the vendor's business type, and
  // pre-selecting a food one is how a clothing listing ends up under 'Rice'.
  category: '',
  price: 0,
  stock: 0,
  status: 'Active',
  imageUrl: '',
  archivedAt: null,
};

interface AddListingModalProps {
  open: boolean;
  /**
   * `storeIds` are the stores the item should be sold at. Applied by the caller
   * after the insert, because `storefront_listings` needs a listing id that
   * does not exist while this form is open.
   */
  onAdd: (listing: Listing, storeIds: string[]) => void;
  onClose: () => void;
  /** Pre-ticked. Defaults to every store   see StorePicker for why. */
  defaultStoreIds: string[];
}

export function AddListingModal({
  open,
  onAdd,
  onClose,
  defaultStoreIds,
}: AddListingModalProps) {
  const [form, setForm] = useState({ ...EMPTY });
  const [storeIds, setStoreIds] = useState<string[]>(defaultStoreIds);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The stores arrive asynchronously, so the default cannot be a useState
  // initialiser   on the first render there is nothing to tick. Seeded during
  // render rather than in an effect so the boxes are already ticked on the
  // first paint of the panel, not a frame later.
  const seedKey = open ? defaultStoreIds.join(',') : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seeded !== seedKey) {
    setSeeded(seedKey);
    if (seedKey !== null) setStoreIds(defaultStoreIds);
  }

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};

    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.category) e.category = 'Pick a category';
    if (form.price <= 0) e.price = 'Price must be greater than 0';
    if (form.stock < 0) e.stock = 'Stock cannot be negative';

    setErrors(e);

    return Object.keys(e).length === 0;
  };

  const reset = () => {
    setForm({ ...EMPTY });
    setStoreIds(defaultStoreIds);
    setErrors({});
  };

  const handleAdd = () => {
    if (!validate()) return;

    onAdd({ ...form, id: `lst-${Date.now()}`, sold: 0 }, storeIds);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <FormSheet
      open={open}
      onClose={handleClose}
      title="Add new listing"
      description="One item, sold at whichever of your stores you choose."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={handleAdd}>
            Add listing
          </Button>
        </>
      }
    >
      <ListingImageField value={form.imageUrl ?? ''} onChange={(url) => set('imageUrl', url)} />

      <Field label="Product name" error={errors.name}>
        <Input
          placeholder="e.g. Jollof Rice"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className={cn('input-clean', errors.name && 'border-red-400')}
        />
      </Field>

      <CategoryField
        value={form.category}
        onChange={(name) => set('category', name)}
        error={errors.category}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₦)" error={errors.price}>
          <Input
            type="number"
            placeholder="0"
            value={form.price || ''}
            onChange={(e) => set('price', Number(e.target.value))}
            className={cn('input-clean', errors.price && 'border-red-400')}
          />
        </Field>

        {/* Blank means "cooked to order", which is the common case and is why
            the placeholder no longer says 0   a literal 0 used to mean the
            listing was born sold out. */}
        <Field label="Opening stock" error={errors.stock}>
          <Input
            type="number"
            placeholder="Leave blank if you cook to order"
            value={form.stock || ''}
            onChange={(e) => set('stock', Number(e.target.value))}
            className={cn('input-clean', errors.stock && 'border-red-400')}
          />
        </Field>
      </div>

      {/* Asked here rather than only on the edit screen. A vendor with three
          branches used to add an item, see it appear at one of them, and have
          no reason to suspect the other two were missing it. */}
      <div className="border-line/10 border-t pt-3">
        <StorePicker value={storeIds} onChange={setStoreIds} />
      </div>
    </FormSheet>
  );
}

// ── tiny helper ──────────────────────────────────────────────────
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-content-muted text-xs font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
