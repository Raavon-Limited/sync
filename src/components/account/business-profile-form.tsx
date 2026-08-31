/**
 * The business, as a card that flips into a form.
 *
 * WHY A CARD AND NOT A PERMANENT FORM
 *   A settings page made entirely of open input boxes reads as unfinished
 *   work — every field looks like it is waiting for something, and there is no
 *   moment where a vendor can see what students actually see. Reading is the
 *   common case and editing is the rare one, so reading is the default state
 *   and editing is a thing you ask for.
 *
 *   It also makes Save mean something. With permanent inputs there is no
 *   difference between "typed but not saved" and "saved", which is how people
 *   end up leaving a page believing a change stuck.
 *
 * IT OPENS FILLED IN. Everything here is seeded from what the vendor typed in
 * the onboarding wizard — `save_onboarding_business` moves those answers into
 * `vendor_profiles` instead of leaving them in auth metadata, where nothing
 * read them and this form came up empty.
 *
 * WHAT IS NOT HERE
 *   verification_status, verified_at, rating_avg, rating_count and slug.
 *   `guard_vendor_profile_cols` reverts client writes to the first four, so a
 *   field for them would look like it worked and silently do nothing. Slug is
 *   the public URL of a storefront that may already be linked to.
 *
 *   business_name is SHOWN but never editable, for the same reason plus one
 *   more: it is unique across the platform and claimed once. See
 *   20260901140000 — it is an identity, not a preference.
 *
 * The trading-hours and accepting-orders fields are deliberately absent too:
 *   a hostel is not open between two times, and this form is shared with
 *   surfaces that have their own controls for those.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Lock, Pencil, Phone, MapPin, Building2, Store } from 'lucide-react';
import { Button, Input, Textarea, Spinner, Badge } from '@/components/ui';
import { ImageField } from '@/components/forms';
import { BusinessIdCard } from './business-id-card';
import { SITE } from '@/config/site';
import { useMyStorefront, useUpdateStorefront } from '@/modules/vendor/hooks';

interface Draft {
  tagline: string;
  bio: string;
  publicPhone: string;
  businessAddress: string;
  area: string;
  logoUrl: string;
}

const FIELD =
  'w-full bg-surface-deep/40 border-line/15 text-content placeholder:text-content-muted/50';

export function BusinessProfileForm() {
  const { data: storefront, isPending, error } = useMyStorefront();
  const update = useUpdateStorefront();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  if (isPending) return <Spinner />;

  if (error) {
    return (
      <p className="text-coral text-sm">Could not load your business profile: {error.message}</p>
    );
  }

  // No vendor_profiles row means onboarding never finished. Saying that is more
  // use than an empty form that would fail on save.
  if (!storefront) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
        No business profile yet. Finish onboarding to create one.
      </p>
    );
  }

  // Seeded when Edit is pressed, not on every render. That is what makes a
  // background refetch unable to overwrite something half-typed: while the
  // form is open, `draft` is the only writer.
  const startEditing = () => {
    setDraft({
      tagline: storefront.tagline ?? '',
      bio: storefront.bio ?? '',
      publicPhone: storefront.publicPhone ?? '',
      businessAddress: storefront.businessAddress ?? '',
      area: storefront.area ?? '',
      logoUrl: storefront.logoUrl ?? '',
    });
    setSaved(false);
    update.reset();
    setEditing(true);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await update.mutateAsync({
      // businessName is NOT sent. The column guard reverts it for
      // `authenticated`, so including it would be a write that always looks
      // like it worked and never did.
      //
      // Empty means "cleared", and the columns are nullable, so an empty box
      // writes null rather than an empty string nothing else knows to check.
      tagline: draft.tagline.trim() || null,
      bio: draft.bio.trim() || null,
      publicPhone: draft.publicPhone.trim() || null,
      businessAddress: draft.businessAddress.trim() || null,
      area: draft.area.trim() || null,
      logoUrl: draft.logoUrl.trim() || null,
    });
    // Back to the card. The mutation has already written the cache, so this
    // renders the saved values rather than the draft — which is the point:
    // what you see afterwards is what the server has.
    setEditing(false);
    setSaved(true);
  }

  // ── Reading ──────────────────────────────────────────────────────────────
  if (!editing || !draft) {
    return (
      <div className="flex max-w-xl flex-col gap-6">
        {/* The card comes FIRST. It is the thing a vendor came here to get —
            something to show a customer — and the fields below it are the
            settings that produce it. */}
        <BusinessIdCard
          businessName={storefront.businessName}
          slug={storefront.slug}
          category={storefront.category}
          area={storefront.area}
          logoUrl={storefront.logoUrl}
          verificationStatus={storefront.verificationStatus}
        />

        <div className="border-line/10 bg-panel flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex items-start gap-4">
          <div className="border-line/10 bg-surface-deep/40 relative size-16 shrink-0 overflow-hidden rounded-full border">
            {storefront.logoUrl ? (
              <Image src={storefront.logoUrl} alt="" fill sizes="64px" className="object-cover" />
            ) : (
              <span className="text-content-muted flex size-full items-center justify-center">
                <Store className="size-6" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-content flex flex-wrap items-center gap-2 text-lg">
              {storefront.businessName}
              {storefront.verificationStatus === 'verified' && (
                <Badge className="bg-lime/15 text-lime-deep">Verified</Badge>
              )}
            </h3>
            <p className="text-content-muted text-sm">
              {storefront.tagline || 'No tagline yet.'}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={startEditing} className="gap-1">
            <Pencil className="size-3" /> Edit
          </Button>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact icon={<Phone className="size-3.5" />} label="Public phone">
            {storefront.publicPhone || 'Not set'}
          </Fact>
          <Fact icon={<MapPin className="size-3.5" />} label="Area">
            {/* Not cosmetic: discovery is location-first, and a business with
                no area is left out of the campus board entirely. */}
            {storefront.area || (
              <span className="text-amber-600">Not set — students cannot find you by area</span>
            )}
          </Fact>
          <Fact icon={<Building2 className="size-3.5" />} label="Address" wide>
            {storefront.businessAddress || 'Not set'}
          </Fact>
        </dl>

        <div>
          <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
            About
          </span>
          <p className="text-content mt-1 text-sm whitespace-pre-line">
            {storefront.bio || (
              <span className="text-content-muted">
                Nothing yet. Students read this before they order.
              </span>
            )}
          </p>
        </div>

          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        </div>
      </div>
    );
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={save}
      className="border-line/10 bg-panel flex max-w-xl flex-col gap-4 rounded-2xl border p-5"
    >
      <ImageField
        value={draft.logoUrl}
        onChange={(url) => set('logoUrl', url)}
        label="Business logo"
        hint="Square works best. JPEG, PNG, WebP or AVIF, up to 5MB."
        folder="logos"
        shape="circle"
      />

      {/* Claimed once, then held. See 20260901140000: the name is unique
          across the platform and `guard_vendor_profile_cols` freezes it for
          `authenticated`, so an editable box here would accept a change and
          silently discard it on save — the worst of both. Read-only and
          explained is honest; staff can still correct a genuine mistake. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
          Business name
        </span>
        <div
          className={`${FIELD} flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm opacity-80`}
        >
          <Lock className="text-content-muted size-3.5 shrink-0" />
          <span className="text-content min-w-0 truncate">{storefront.businessName}</span>
        </div>
        <span className="text-content-muted text-xs">
          Your name is yours alone — no other business can take it, and it is what students
          recognise you by. {SITE.support.email} can change it if it is wrong.
        </span>
      </div>

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
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={update.isPending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        {update.error && (
          <span className="text-coral text-sm">{(update.error as Error).message}</span>
        )}
      </div>
    </form>
  );
}

function Fact({
  icon,
  label,
  children,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-content-muted flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
        {icon}
        {label}
      </dt>
      <dd className="text-content mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
