/**
 * OnboardingWizard - the 5-step vendor verification wizard
 * (profile → business → category → documents → review). Validated per step with
 * react-hook-form + the shared `vendorOnboardingSchema`. Submitting flips the
 * vendor to `pending`, which staff then decide on in the admin queue.
 *
 * IT LIVES HERE, NOT IN THE ROUTE FOLDER, BECAUSE IT HAS TWO HOSTS.
 *   /onboarding                 the first run, straight after signup: a fresh
 *                               account with no dashboard worth showing yet.
 *   <VerifyNowSheet>            "Verify Now" from a dashboard someone is
 *                               already using — a side panel over their own
 *                               screen, so the context they came from stays
 *                               behind it.
 *
 *   Both are the same five steps against the same schema and the same RPCs.
 *   The alternative — a second, sheet-shaped copy of this form — is how the
 *   two ended up disagreeing about what verification asks for the last time
 *   this flow was rebuilt.
 *
 * Documents upload to Supabase Storage best-effort; liveness/auto-ID via Smile
 * ID / Dojah is wired in later. Some fields are prefilled from signup.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CharCount, FormField } from '@/components/forms';
import { AddressAutocomplete } from '@/components/forms/address-autocomplete';
import { toast } from '@/components/ui/toast';
import { VerificationSubmittedModal } from '@/components/verification/verification-submitted-modal';
import {
  VerificationDocuments,
  emptyDocumentState,
  documentsProblem,
  queueForUpload,
  type DocumentState,
} from '@/components/verification/document-upload';
import type { VerificationRole } from '@/modules/verification/requirements';
import { claimedBusinessName } from '@/lib/business-name';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  vendorOnboardingSchema,
  type Trade,
  type VendorCategory,
  type VendorOnboardingInput,
} from '@/lib/validations';
import { submitVendorOnboarding, type UploadedDocument } from '@/modules/verification/actions';

const STEPS = ['Profile', 'Business', 'Category', 'Documents', 'Review'] as const;

/** Mirrors `sells` in vendorOnboardingSchema. Keep the two in step. */
const SELLS_MIN = 10;
const SELLS_MAX = 500;

const CATEGORY_OPTIONS: { value: VendorCategory; label: string }[] = [
  { value: 'landlord', label: 'Landlord (rooms & hostels)' },
  { value: 'food', label: 'Food vendor' },
  { value: 'beauty', label: 'Beauty pro' },
  { value: 'laundry', label: 'Laundry service' },
  { value: 'tradesman', label: 'Tradesman / artisan' },
];

const TRADE_OPTIONS: { value: Trade; label: string }[] = [
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'tailor', label: 'Tailor' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'painter', label: 'Painter' },
  { value: 'other', label: 'Other' },
];

export interface OnboardingWizardProps {
  /**
   * Prefill from what the account already holds. `businessName` matters most:
   * it is claimed once and then frozen, so a re-verification that opens with an
   * empty box is a step somebody can only get wrong.
   */
  initial: Partial<VendorOnboardingInput>;
  /**
   * Where the wizard is mounted. The route centres itself in a page column;
   * inside a sheet the panel already sets the width, and a second `max-w-xl`
   * would leave the form floating in a narrower column than the panel it is
   * in.
   */
  layout?: 'page' | 'panel';
  /**
   * Called when the submitted-modal's Continue is pressed, with the dashboard
   * the chosen category belongs to.
   *
   * Supplied by the sheet, which has to close ITSELF before anything
   * navigates — a Radix dialog left open across a route change keeps the
   * scroll lock and the aria-hidden on the page behind it, so the dashboard
   * they land on is inert and looks frozen. Omitted on the route, where the
   * wizard is the whole page and navigating away is the only exit.
   */
  onSubmitted?: (dashboardHref: string) => void;
}

export function OnboardingWizard({ initial, layout = 'page', onSubmitted }: OnboardingWizardProps) {
  const router = useRouter();
  // Empty when nothing has been claimed yet — a placeholder like
  // "Unnamed business 21e446ce" is the system's own filler and must never be
  // shown as though the person typed it.
  const claimedName = claimedBusinessName(initial.businessName);
  // A claimed name is FROZEN for the client: claim_business_name refuses to
  // change one, and only staff can. The field says so rather than letting
  // somebody edit their way into a refusal five steps later.
  const nameLocked = claimedName !== '';

  const [step, setStep] = useState(0);
  // Every requirement for this kind of account, keyed by requirement. Seeded
  // from 'vendor' because vendor and landlord are asked for the same four
  // things — `requirementsFor` is still what decides at validation and upload,
  // so a future divergence is picked up there rather than frozen in here.
  const [docState, setDocState] = useState<DocumentState>(() => emptyDocumentState('vendor'));
  const [docError, setDocError] = useState<string | null>(null);
  // Where Continue goes, and whether the modal is up. Held together because
  // the destination is only known once the server has told us which business
  // role the submitted category left them on.
  const [submitted, setSubmitted] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VendorOnboardingInput>({
    resolver: zodResolver(vendorOnboardingSchema),
    defaultValues: {
      fullName: initial.fullName ?? '',
      phone: initial.phone ?? '',
      vendorCategory: initial.vendorCategory,
      // Prefilled from the name this account has already claimed. A blank box
      // here was not merely inconvenient on a RE-verification: retyping the
      // name even slightly differently made claim_business_name refuse the
      // whole submission with "already set to X and cannot be changed here",
      // and typing it identically was the only way through a step that gave no
      // hint that was the rule.
      businessName: claimedName,
      sells: '',
      businessAddress: '',
      area: '',
    },
  });

  const category = watch('vendorCategory');
  // Watched so the counter tracks each keystroke; it is one field, and the
  // re-render is the point.
  const sells = watch('sells') ?? '';

  const stepFields: Record<number, (keyof VendorOnboardingInput)[]> = {
    0: ['fullName', 'phone'],
    1: ['businessName', 'sells', 'businessAddress', 'area'],
    2: category === 'tradesman' ? ['vendorCategory', 'trade'] : ['vendorCategory'],
    3: [],
    4: [],
  };

  /**
   * What the documents step will accept before it lets you past.
   *
   * Uploading is OPTIONAL — the copy says so and a business can add documents
   * later — but a HALF-uploaded document is not the same as none. Picking
   * "Driver's licence" and attaching only the front produces a review that
   * cannot be completed and a vendor who thinks they are done.
   */
  async function goNext() {
    if (step === 3) {
      const problem = documentsProblem(reqRole, docState);
      setDocError(problem);
      if (problem) return;
    }
    const fields = stepFields[step];
    if (fields.length === 0 || (await trigger(fields))) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  async function onSubmit(values: VendorOnboardingInput) {
    // Re-checked at submit, not only on Continue: the category can change on
    // step 3 AFTER the documents step was passed, and a landlord and a vendor
    // could one day be asked for different things.
    const problem = documentsProblem(reqRole, docState);
    if (problem) {
      setDocError(problem);
      setStep(3);
      return;
    }

    // Each file is described before it is uploaded, so what reaches
    // `verification_documents` says WHICH document and WHICH side rather than
    // just naming a path in a bucket.
    const queued = queueForUpload(reqRole, docState);

    const uploaded: UploadedDocument[] = [];
    if (queued.length) {
      try {
        const supabase = createClient();
        for (const [i, item] of queued.entries()) {
          // The index breaks ties: front and back are uploaded in the same
          // millisecond, so a timestamp alone had them overwrite each other.
          const path = `${Date.now()}-${i}-${item.file.name.replace(/\s+/g, '-')}`;
          const { error } = await supabase.storage
            .from('vendor-verification')
            .upload(path, item.file, { upsert: true });
          if (!error) {
            uploaded.push({
              docType: item.docType,
              subtype: item.subtype,
              title: item.title,
              storagePath: path,
            });
          }
        }
      } catch {
        // Storage not wired yet - submit the details anyway.
      }
    }

    const res = await submitVendorOnboarding(values, uploaded);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    // The modal carries the outcome now, so no toast: the two would say the
    // same thing at the same moment, and the toast would be the one that
    // disappears before it is read.
    //
    // Where they land follows the category they just chose. Hardcoding
    // '/vendor' sent every landlord to a route the proxy gates to
    // roles: ['vendor'] - a 403 at the end of a five-step wizard.
    setSubmitted(res.role === 'landlord' ? '/landlord' : '/vendor');
  }

  const v = getValues();
  const categoryLabel = CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? '—';

  // Which requirement set applies. Landlords and vendors are asked for the same
  // four today; this is read live so that stops being an assumption the moment
  // requirements.ts says otherwise.
  const reqRole: VerificationRole = category === 'landlord' ? 'landlord' : 'vendor';

  // What the review row says: which documents, named, not a file count. "1
  // file" told a vendor nothing about whether they had attached the right
  // thing, which is the only question the row exists to answer.
  const docSummary = (() => {
    const queued = queueForUpload(reqRole, docState);
    if (!queued.length) return 'None yet';
    const titles = Array.from(
      new Set(queued.map((q) => q.title.replace(/ \((front|back)\)$/, ''))),
    );
    return `${queued.length} file(s) · ${titles.join(', ')}`;
  })();

  return (
    // In a panel the wizard OWNS the height: it becomes the flex column that
    // fills the sheet, so the fields can scroll under a footer that does not.
    // On the page it is a plain block in a normal document flow.
    <div
      className={cn(
        'w-full',
        layout === 'page' && 'mx-auto max-w-xl',
        layout === 'panel' && 'flex h-full min-h-0 flex-col',
      )}
    >
      <VerificationSubmittedModal
        open={submitted !== null}
        onContinue={() => {
          const dest = submitted ?? '/vendor';
          if (onSubmitted) {
            onSubmitted(dest);
            return;
          }
          router.push(dest);
          router.refresh();
        }}
      />
      {/* Step indicator. shrink-0 in a panel so it stays put while the fields
          under it scroll — losing "which of five steps am I on" is the first
          thing a scrolling wizard costs you. */}
      <ol className={cn('mb-8 flex items-center', layout === 'panel' && 'shrink-0')}>
        {STEPS.map((label, i) => (
          <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                  i < step
                    ? 'bg-ink text-white'
                    : i === step
                      ? 'bg-lime text-ink'
                      : 'bg-ink/10 text-content-muted',
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-xs sm:inline',
                  i === step ? 'text-content font-medium' : 'text-content-muted',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="bg-line/15 mx-2 h-px flex-1" />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className={cn('flex flex-col gap-4', layout === 'panel' && 'min-h-0 flex-1')}
        noValidate
      >
        {/* THE SCROLLING PART. Only the fields move; the footer below is
            outside this box.

            `min-h-0` is load bearing on both this and the form above it: a flex
            child defaults to min-height:auto, which refuses to shrink below its
            content, so without it the box grows to fit every field and pushes
            the footer off the bottom of the panel instead of scrolling.

            `-mx-6 px-6` bleeds the scroll area to the panel edges so a focus
            ring or a select popover is not clipped by a mid-panel boundary,
            while the fields keep their inset. */}
        <div
          className={cn(
            'flex flex-col gap-4',
            layout === 'panel' && '-mx-6 min-h-0 flex-1 overflow-y-auto px-6',
          )}
        >
          {/* Step 1 - Profile */}
          {step === 0 && (
            <>
              <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
                <Input id="fullName" placeholder="Aisha Olawale" {...register('fullName')} />
              </FormField>
              <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" placeholder="0801 234 5678" {...register('phone')} />
              </FormField>
            </>
          )}

          {/* Step 2 - Business */}
          {step === 1 && (
            <>
              <FormField
                label="Business name"
                htmlFor="businessName"
                error={errors.businessName?.message}
                hint={
                  nameLocked
                    ? 'Your business name is already registered on Sync and cannot be changed here. Contact support if it is wrong.'
                    : undefined
                }
              >
                <Input
                  id="businessName"
                  placeholder="Mama Put Tanke"
                  readOnly={nameLocked}
                  // Still registered and still submitted — the server expects
                  // the field and re-claiming the same name is a no-op by
                  // design. `disabled` would drop it from the payload and turn
                  // a frozen name into a missing one.
                  className={nameLocked ? 'cursor-not-allowed opacity-70' : undefined}
                  {...register('businessName')}
                />
              </FormField>
              <FormField
                label="What do you sell or offer?"
                htmlFor="sells"
                error={errors.sells?.message}
                counter={<CharCount value={sells} min={SELLS_MIN} max={SELLS_MAX} />}
              >
                <Textarea
                  id="sells"
                  rows={4}
                  placeholder="Describe your menu, rooms, or services…"
                  {...register('sells')}
                />
              </FormField>
              <FormField
                label="Business address"
                htmlFor="businessAddress"
                error={errors.businessAddress?.message}
              >
                {/* Google Places suggestions. Falls back to a plain text input
                  whenever Places is unavailable, so an outage or a disabled API
                  can never block onboarding - the address is required to
                  finish, and typing it must always work. */}
                <Controller
                  name="businessAddress"
                  control={control}
                  render={({ field }) => (
                    <AddressAutocomplete
                      id="businessAddress"
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="Start typing your address…"
                    />
                  )}
                />
              </FormField>
              {/* Not the same thing as the address, and not cosmetic. Discovery
                is location-first: a business with no area is left out of the
                campus board and cannot be ranked by distance, so students
                simply never see it. Asking here means Settings opens filled
                in instead of asking again. */}
              <FormField
                label="Area"
                htmlFor="area"
                error={errors.area?.message}
                hint="The neighbourhood students would search for. You can change this later."
              >
                <Input id="area" placeholder="Tanke, Safari, Oke-Odo…" {...register('area')} />
              </FormField>
            </>
          )}

          {/* Step 3 - Category */}
          {step === 2 && (
            <>
              <FormField
                label="What do you offer?"
                htmlFor="vendorCategory"
                error={errors.vendorCategory?.message}
              >
                <Controller
                  name="vendorCategory"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="vendorCategory">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              {category === 'tradesman' && (
                <FormField label="Your trade" htmlFor="trade" error={errors.trade?.message}>
                  <Controller
                    name="trade"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="trade">
                          <SelectValue placeholder="Select your trade" />
                        </SelectTrigger>
                        <SelectContent>
                          {TRADE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}
            </>
          )}

          {/* Step 4 - Documents */}
          {step === 3 && (
            <div className="flex flex-col gap-6">
              {/* Every requirement for this kind of account, all mandatory.
                  Driven by requirementsFor(role), so the wizard asks for
                  exactly what the settings panel and the public ID card say it
                  asks for. */}
              <VerificationDocuments
                role={reqRole}
                value={docState}
                onChange={(next) => {
                  setDocState(next);
                  setDocError(null);
                }}
                error={docError ?? undefined}
              />
            </div>
          )}

          {/* Step 5 - Review */}
          {step === 4 && (
            <dl className="border-line/10 divide-line/10 divide-y rounded-xl border">
              {[
                ['Name', v.fullName],
                ['Phone', v.phone],
                ['Business', v.businessName],
                ['Offers', categoryLabel + (v.trade ? ` · ${v.trade}` : '')],
                ['Address', v.businessAddress],
                ['Area', v.area || 'Not set'],
                ['Documents', docSummary],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-content-muted">{k}</dt>
                  <dd className="text-content max-w-[60%] truncate text-right font-medium">
                    {val || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Footer. In a panel it is pinned to the bottom: the only two controls
            that move the wizard on must not be something you scroll to find,
            and on a phone the last field plus the keyboard would routinely
            hide them.

            It sits OUTSIDE the scroll box but INSIDE the form, so the submit
            button still belongs to the form it submits — hoisting it to the
            sheet would mean wiring it back with a `form=` attribute for no
            gain.

            The negative margin lets the top border and the solid ground run
            the full width of the panel, so content scrolling underneath
            disappears behind an edge rather than at an arbitrary inset. */}
        <div
          className={cn(
            'mt-2 flex gap-3',
            layout === 'panel' && 'border-line/10 bg-panel -mx-6 mt-0 shrink-0 border-t px-6 pt-4',
          )}
        >
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} className="flex-1">
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
