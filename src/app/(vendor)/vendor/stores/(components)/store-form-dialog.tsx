/**
 * Add a store, or edit one, in a modal.
 *
 * ONE FORM FOR BOTH, because they are the same fields and a second component
 * is a second place for "we forgot to add the phone number to the edit
 * screen" to happen. `store` present means edit; absent means create.
 *
 * WHY ADDING A STORE IS GATED ON VERIFICATION
 *   A store is an address on the campus map. An unreviewed account opening a
 *   second one is the cheap version of a fake shopfront, and unlike a listing
 *   there is nothing about it a student can tell apart from the real thing.
 *   The FIRST store is never blocked — every vendor gets one on signup and
 *   needs it to complete onboarding — so this only ever stands between a
 *   business and its second location. `guard_storefront_insert` enforces the
 *   same rule in the database; this is the part that explains it.
 */
'use client';

import { useState } from 'react';
import { Plus, Pencil, TriangleAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@/components/ui';
import { ImageField } from '@/components/forms';
import { useCreateStorefront, useUpdateStorefront } from '@/modules/storefronts/hooks';
import type { Storefront } from '@/modules/storefronts/types';

interface StoreFormDialogProps {
  /** Absent = create a new store. */
  store?: Storefront;
  /** From `vendor_profiles.verification_status`. Only consulted on create. */
  verificationStatus?: string;
  /** True when this vendor has no store yet — the one case verification cannot block. */
  isFirstStore?: boolean;
  /** Rendered as the trigger. Defaults to a button that matches the mode. */
  trigger?: React.ReactNode;
}

const EMPTY = {
  name: '',
  area: '',
  address: '',
  publicPhone: '',
  opensAt: '',
  closesAt: '',
  imageUrl: '',
};

export function StoreFormDialog({
  store,
  verificationStatus,
  isFirstStore = false,
  trigger,
}: StoreFormDialogProps) {
  const editing = !!store;
  const create = useCreateStorefront();
  const update = useUpdateStorefront();
  const mutation = editing ? update : create;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  // Seeded during render rather than in an effect. The same dialog instance
  // serves whichever store the vendor picked last, so the form has to re-seed
  // when the identity behind it changes — and doing that in an effect means a
  // first paint showing the PREVIOUS store's name before it corrects itself.
  const seedKey = open ? (store?.id ?? 'new') : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seeded !== seedKey) {
    setSeeded(seedKey);
    if (seedKey) {
      setForm(
        store
          ? {
              name: store.name,
              area: store.area ?? '',
              address: store.address ?? '',
              publicPhone: store.publicPhone ?? '',
              // Postgres `time` reads back as HH:MM:SS; <input type="time">
              // wants HH:MM and silently rejects the rest.
              opensAt: store.opensAt?.slice(0, 5) ?? '',
              closesAt: store.closesAt?.slice(0, 5) ?? '',
              imageUrl: store.imageUrl ?? '',
            }
          : { ...EMPTY },
      );
    }
  }

  const locked = !editing && !isFirstStore && verificationStatus !== 'verified';
  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) return;

    // Empty strings are not blanks in the database — `area` drives discovery
    // and `opens_at` is a `time` that rejects "". Null is the absence.
    const payload = {
      name: form.name.trim(),
      area: form.area.trim() || null,
      address: form.address.trim() || null,
      publicPhone: form.publicPhone.trim() || null,
      opensAt: form.opensAt || null,
      closesAt: form.closesAt || null,
      imageUrl: form.imageUrl || null,
    };

    if (editing) {
      update.mutate({ id: store.id, ...payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Clear a previous failure on close, so reopening does not greet the
        // vendor with the error from the last attempt.
        if (!v) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={editing ? 'outline' : 'primary'} className="gap-2">
            {editing ? (
              <>
                <Pencil className="size-4" /> Edit store
              </>
            ) : (
              <>
                <Plus className="size-4" /> Add store
              </>
            )}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-content">
            {editing ? `Edit ${store.name}` : 'Add a store'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Trading details for this location. The name and area are what students see.'
              : 'A store is one location. It gets its own hours, stock and order queue.'}
          </DialogDescription>
        </DialogHeader>

        {locked ? (
          <div className="border-line/10 flex flex-col items-start gap-3 rounded-xl border border-dashed p-5">
            <span className="bg-lime/15 text-accent-fg flex size-10 items-center justify-center rounded-full">
              <ShieldCheck className="size-5" />
            </span>
            <p className="text-content text-sm font-medium">
              {verificationStatus === 'pending'
                ? 'Your verification is still with a reviewer'
                : 'Verify your business to open another store'}
            </p>
            <p className="text-content-muted text-sm">
              {verificationStatus === 'pending'
                ? 'Nothing more is needed from you. You will be able to add locations as soon as it is approved.'
                : 'Extra locations show up on the campus map under your name, so we check the business behind them first. Your existing store is unaffected.'}
            </p>
            {verificationStatus !== 'pending' && (
              <Button asChild size="sm">
                <Link href="/onboarding">
                  {verificationStatus === 'rejected' ? 'Submit again' : 'Verify now'}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            {/* The shopfront, not the logo. The brand mark is the same at
                every location, which tells a student nothing about which door
                to walk through — and discovery currently repeats one logo down
                the whole results list. */}
            <ImageField
              value={form.imageUrl}
              onChange={(url) => set('imageUrl', url)}
              label="Store photo"
              hint="A picture of this location. Optional — your business logo is used if you skip it."
              folder="stores"
            />

            <Field label="Store name" hint="What students see, e.g. “Tanke store”.">
              <Input
                autoFocus
                value={form.name}
                onChange={(ev) => set('name', ev.target.value)}
                placeholder="Tanke store"
              />
            </Field>

            <Field
              label="Area"
              // Not cosmetic. Discovery is location-first: a store with no area
              // is left out of the campus board and cannot be ranked by
              // distance, so students simply never see it.
              hint="Students find stores by area. Without one, this store does not appear."
            >
              <Input
                value={form.area}
                onChange={(ev) => set('area', ev.target.value)}
                placeholder="Tanke"
              />
            </Field>

            <Field label="Address" hint="Optional. Shown to riders and customers collecting.">
              <Input
                value={form.address}
                onChange={(ev) => set('address', ev.target.value)}
                placeholder="12 Unity Road"
              />
            </Field>

            <Field label="Phone for this store" hint="Optional. Leave blank to use your main line.">
              <Input
                type="tel"
                value={form.publicPhone}
                onChange={(ev) => set('publicPhone', ev.target.value)}
                placeholder="080…"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens">
                <Input
                  type="time"
                  value={form.opensAt}
                  onChange={(ev) => set('opensAt', ev.target.value)}
                />
              </Field>
              <Field label="Closes">
                <Input
                  type="time"
                  value={form.closesAt}
                  onChange={(ev) => set('closesAt', ev.target.value)}
                />
              </Field>
            </div>

            {mutation.error && (
              <p className="text-coral flex items-start gap-1 text-xs">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                {(mutation.error as Error).message}
              </p>
            )}

            <DialogFooter className="mt-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending || !form.name.trim()}
                className="gap-2"
              >
                {mutation.isPending
                  ? 'Saving…'
                  : editing
                    ? 'Save changes'
                    : 'Add store'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-content-muted text-xs">{label}</span>
      {children}
      {hint && <span className="text-content-muted text-xs opacity-80">{hint}</span>}
    </label>
  );
}
