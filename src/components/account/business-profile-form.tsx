/**
 * The editable half of a vendor_profiles row.
 *
 * WHY THIS EXISTS
 *   A landlord's business name, phone and address are what students see on
 *   every hostel they list, and there was nowhere in the app to change any of
 *   it — the row was written once at onboarding and then frozen. Settings is
 *   where an account's own details belong.
 *
 * WHAT IS NOT HERE
 *   verification_status, verified_at, rating_avg, rating_count and slug.
 *   `guard_vendor_profile_cols` reverts client writes to the first four, so a
 *   field for them would look like it worked and silently do nothing. Slug is
 *   the public URL of a storefront that may already be linked to.
 *
 * The trading-hours and accepting-orders fields are deliberately absent too:
 *   a hostel is not open between two times, and this form is shared with
 *   surfaces that have their own controls for those.
 */
'use client';

import { useState } from 'react';
import { Button, Input, Textarea, Spinner } from '@/components/ui';
import { useMyStorefront, useUpdateStorefront } from '@/modules/vendor/hooks';

interface Draft {
  businessName: string;
  tagline: string;
  bio: string;
  publicPhone: string;
  businessAddress: string;
  area: string;
}

const FIELD =
  'w-full bg-surface-deep/40 border-line/15 text-content placeholder:text-content-muted/50';

export function BusinessProfileForm() {
  const { data: storefront, isPending, error } = useMyStorefront();
  const update = useUpdateStorefront();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  // Seeded from the query on first render that has data, tracked by row id so a
  // refetch cannot overwrite edits the user is part-way through typing.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (storefront && seededFor !== storefront.id) {
    setSeededFor(storefront.id);
    setDraft({
      businessName: storefront.businessName ?? '',
      tagline: storefront.tagline ?? '',
      bio: storefront.bio ?? '',
      publicPhone: storefront.publicPhone ?? '',
      businessAddress: storefront.businessAddress ?? '',
      area: storefront.area ?? '',
    });
  }

  if (isPending) return <Spinner />;

  if (error) {
    return (
      <p className="text-coral text-sm">Could not load your business profile: {error.message}</p>
    );
  }

  // No vendor_profiles row means onboarding never finished. Saying that is more
  // use than an empty form that would fail on save.
  if (!storefront || !draft) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
        No business profile yet. Finish onboarding to create one.
      </p>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await update.mutateAsync({
      businessName: draft.businessName.trim(),
      // Empty means "cleared", and the columns are nullable, so an empty box
      // writes null rather than an empty string nothing else knows to check.
      tagline: draft.tagline.trim() || null,
      bio: draft.bio.trim() || null,
      publicPhone: draft.publicPhone.trim() || null,
      businessAddress: draft.businessAddress.trim() || null,
      area: draft.area.trim() || null,
    });
    setSaved(true);
  }

  return (
    <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
          Business name
        </span>
        <Input
          value={draft.businessName}
          onChange={(e) => set('businessName', e.target.value)}
          required
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
          Tagline
        </span>
        <Input
          value={draft.tagline}
          onChange={(e) => set('tagline', e.target.value)}
          placeholder="One line students see under your name"
          className={FIELD}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
            Public phone
          </span>
          <Input
            type="tel"
            value={draft.publicPhone}
            onChange={(e) => set('publicPhone', e.target.value)}
            placeholder="08012345678"
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
            Area
          </span>
          <Input
            value={draft.area}
            onChange={(e) => set('area', e.target.value)}
            placeholder="Safari, Tanke, Oke-Odo…"
            className={FIELD}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
          Business address
        </span>
        <Input
          value={draft.businessAddress}
          onChange={(e) => set('businessAddress', e.target.value)}
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
          About
        </span>
        <Textarea
          value={draft.bio}
          onChange={(e) => set('bio', e.target.value)}
          rows={4}
          placeholder="What you offer and how you work."
          className={`${FIELD} resize-none rounded-md px-3 py-2`}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending || !draft.businessName.trim()}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {saved && !update.isPending && (
          <span className="text-sm text-emerald-600">Saved.</span>
        )}
        {update.error && (
          <span className="text-coral text-sm">{(update.error as Error).message}</span>
        )}
      </div>
    </form>
  );
}
