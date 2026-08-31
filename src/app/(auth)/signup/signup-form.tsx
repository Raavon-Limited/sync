/**
 * SignupForm - account creation as a 3-step wizard, validated with the shared
 * `signupSchema` (react-hook-form + zod).
 *
 *   1. Who you are    role, plus the one thing that depends on it -
 *                     school for students, category (and trade) for vendors
 *   2. About you      full name, phone
 *   3. Your account   email, password, confirm, terms -> create
 *
 * WHY STEPS. As one column this was eight fields, two of which appeared only
 * after a role was picked, and the whole thing shifted under you when it did.
 * Splitting it means the role choice actually leads somewhere instead of
 * quietly re-laying-out the page below it.
 *
 * VALIDATION IS PER STEP, via `trigger(fields)`, so you cannot carry a bad
 * email to the end and find out there. The schema is still the single source
 * of truth - the steps only decide WHEN each field is checked, never what
 * counts as valid. Same approach as the vendor onboarding wizard.
 *
 * STUDENTS PICK A SCHOOL; VENDORS DO NOT GIVE AN ADDRESS HERE. The vendor's
 * business address is collected in the onboarding wizard (step 2), and asking
 * in two places is how the two answers end up disagreeing. Students have no
 * onboarding wizard, so their campus has to be captured here.
 *
 * `next` is preserved so the flow can resume at the originally-requested page.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/forms';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  signupSchema,
  type SignupInput,
  type Trade,
  type VendorCategory,
} from '@/lib/validations';
import { signUp } from '@/modules/auth/actions';
import { campusLabel, useCampuses } from '@/modules/campuses';

const ROLES: { id: SignupInput['role']; label: string; desc: string }[] = [
  { id: 'student', label: "I'm a student", desc: 'Find hostels, food & services' },
  { id: 'vendor', label: 'I sell or rent', desc: 'Rooms, food, services & more' },
];

const VENDOR_CATEGORIES: { value: VendorCategory; label: string }[] = [
  { value: 'landlord', label: 'Landlord (rooms & hostels)' },
  { value: 'food', label: 'Food vendor' },
  { value: 'beauty', label: 'Beauty pro' },
  { value: 'laundry', label: 'Laundry service' },
  { value: 'tradesman', label: 'Tradesman / artisan' },
];

const TRADES: { value: Trade; label: string }[] = [
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'tailor', label: 'Tailor' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'painter', label: 'Painter' },
  { value: 'other', label: 'Other' },
];

const STEPS = ['Who you are', 'About you', 'Your account'];

/**
 * Which fields each step is responsible for.
 *
 * The role-conditional ones are listed on step 0 whatever the role: the schema
 * only raises an issue on `campusId` for students and on `vendorCategory` for
 * vendors, so naming both here is harmless and means the table does not have to
 * be re-derived every time the role changes.
 */
const STEP_FIELDS: Record<number, (keyof SignupInput)[]> = {
  0: ['role', 'campusId', 'vendorCategory', 'trade'],
  1: ['fullName', 'phone'],
  2: ['email', 'password', 'confirmPassword', 'acceptedTerms'],
};

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const { data: campuses = [], isPending: campusesLoading } = useCampuses();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: 'student', acceptedTerms: false },
  });

  const role = watch('role');
  const vendorCategory = watch('vendorCategory');
  const acceptedTerms = watch('acceptedTerms');
  const campusId = watch('campusId');
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  const isLast = step === STEPS.length - 1;

  function selectRole(id: SignupInput['role']) {
    setValue('role', id, { shouldValidate: true });
    // Clear the other role's answers rather than carrying them along invisibly:
    // switching to student with a stale vendorCategory would submit both.
    if (id === 'student') {
      setValue('vendorCategory', undefined);
      setValue('trade', undefined);
    } else {
      setValue('campusId', undefined);
    }
  }

  async function goNext() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onSubmit(values: SignupInput) {
    const res = await signUp(values);
    if (!res.ok) {
      if (res.alreadyRegistered) {
        /*
         * Auth is keyed on email, so a second signup with the same address can
         * never succeed — and the old message ("account exists, please log in")
         * read as a refusal when the thing the person wants is genuinely
         * possible. You do not make a second account to sell; you add a
         * business account to the one you have, from the account menu.
         *
         * The intended role rides along so /login can say so specifically
         * rather than making them work it out.
         */
        const wantsBusiness = values.role !== 'student';
        toast(
          wantsBusiness
            ? 'You already have an account with this email. Sign in, then add a business account from the menu under your avatar.'
            : 'You already have an account with this email. Sign in to continue.',
        );
        router.push(
          `/login?email=${encodeURIComponent(values.email)}${wantsBusiness ? '&add=vendor' : ''}`,
        );
        return;
      }
      toast(res.error);
      return;
    }
    // "Confirm email" off in Supabase => signUp already returned a session, so
    // the account is live and nothing was emailed. Sending them to /verify to
    // type a code that does not exist is a dead end with no way out, so go
    // straight in. Business roles still need the onboarding wizard.
    if (res.signedIn) {
      const wantsBusiness = values.role !== 'student';
      router.push(next ?? (wantsBusiness ? '/onboarding' : '/me'));
      router.refresh();
      return;
    }

    router.push(`/verify?email=${encodeURIComponent(values.email)}`);
  }

  return (
    <form
      // Enter must ADVANCE on steps 1-2, not submit a half-filled form. Only
      // the last step actually creates the account.
      onSubmit={(e) => {
        if (!isLast) {
          e.preventDefault();
          void goNext();
          return;
        }
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {/* Progress. Labelled, not just dots: "step 2 of 3" is only useful if you
          can also see what step 2 is going to ask for. */}
      <ol className="flex items-center gap-2" aria-label="Signup progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                'h-1 rounded-full transition-colors',
                i < step ? 'bg-lime' : i === step ? 'bg-lime' : 'bg-cream/15',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'text-[11px] transition-colors',
                i === step ? 'text-content font-medium' : 'text-content-muted',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {/* ── Step 1 · Who you are ─────────────────────────────────────── */}
      {step === 0 && (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-content mb-1.5 text-sm font-medium">I am a…</legend>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map((r) => {
                const selected = role === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectRole(r.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col rounded-2xl border p-5 text-left transition-all',
                      selected
                        ? 'border-line bg-lime shadow-[3px_3px_0_0_var(--color-ink)]'
                        : 'border-line/15 hover:border-line/40 bg-panel',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('eyebrow', selected ? 'text-ink/60' : 'text-content/60')}>
                        {selected ? 'Role · Selected' : 'Role'}
                      </span>
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center border',
                          selected
                            ? 'border-line bg-ink rounded-md text-white'
                            : 'border-line/30 rounded-full',
                        )}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'font-display mt-4 text-xl font-bold',
                        selected ? 'text-ink' : 'text-content',
                      )}
                    >
                      {r.label}
                    </span>
                    <span
                      className={cn(
                        'mt-1 text-sm',
                        selected ? 'text-ink/70' : 'text-content-muted',
                      )}
                    >
                      {r.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
          </fieldset>

          {/* Students: which campus. The school's ADDRESS comes from the school
              row, so this one answer is worth more than a typed address would
              be - and it cannot be misspelt. */}
          {role === 'student' && (
            <FormField label="Your school" htmlFor="campusId" error={errors.campusId?.message}>
              <Select
                value={campusId}
                onValueChange={(v) => setValue('campusId', v, { shouldValidate: true })}
              >
                <SelectTrigger id="campusId">
                  <SelectValue
                    placeholder={campusesLoading ? 'Loading campuses…' : 'Select your school'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {campusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Only campuses we actually serve are selectable, so say so
                  rather than leaving someone hunting for a school that is
                  seeded but not switched on yet. */}
              {!campusesLoading && campuses.length === 0 && (
                <p className="text-content-muted mt-1.5 text-xs">
                  No campuses are available yet. Please try again shortly.
                </p>
              )}
            </FormField>
          )}

          {/* Vendor specialisation - only when "vendor" is selected. */}
          {role === 'vendor' && (
            <FormField
              label="What do you offer?"
              htmlFor="vendorCategory"
              error={errors.vendorCategory?.message}
            >
              <Select
                value={vendorCategory}
                onValueChange={(v) => {
                  setValue('vendorCategory', v as VendorCategory, { shouldValidate: true });
                  if (v !== 'tradesman') setValue('trade', undefined);
                }}
              >
                <SelectTrigger id="vendorCategory">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {role === 'vendor' && vendorCategory === 'tradesman' && (
            <FormField label="Your trade" htmlFor="trade" error={errors.trade?.message}>
              <Select
                value={watch('trade')}
                onValueChange={(v) => setValue('trade', v as Trade, { shouldValidate: true })}
              >
                <SelectTrigger id="trade">
                  <SelectValue placeholder="Select your trade" />
                </SelectTrigger>
                <SelectContent>
                  {TRADES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {role === 'vendor' && (
            <p className="text-content-muted text-xs">
              Your business address and documents come next, after you create the account.
            </p>
          )}
        </>
      )}

      {/* ── Step 2 · About you ───────────────────────────────────────── */}
      {step === 1 && (
        <>
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="Aisha Olawale"
              {...register('fullName')}
            />
          </FormField>

          <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="0801 234 5678"
              {...register('phone')}
            />
          </FormField>
        </>
      )}

      {/* ── Step 3 · Your account ────────────────────────────────────── */}
      {step === 2 && (
        <>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@student.edu.ng"
              {...register('email')}
            />
          </FormField>

          <FormField label="Password" htmlFor="password" error={errors.password?.message}>
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </FormField>

          <FormField
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </FormField>

          {/* Terms */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={acceptedTerms}
              aria-label="Agree to Terms and Privacy Policy"
              onClick={() => setValue('acceptedTerms', !acceptedTerms, { shouldValidate: true })}
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors',
                acceptedTerms ? 'bg-lime border-lime' : 'border-line/25 bg-transparent',
              )}
            >
              {acceptedTerms && <span className="text-ink text-xs font-bold">✓</span>}
            </button>
            <p className="text-content-muted text-xs">
              I agree to Sync&rsquo;s{' '}
              {/* /terms is not a route - the legal pages live under /legal. The
                  old link 404'd on the one thing a user must read before
                  agreeing to it. */}
              <Link href="/legal/terms" className="text-content underline">
                Terms
              </Link>{' '}
              &amp;{' '}
              <Link href="/legal/privacy" className="text-content underline">
                Privacy Policy
              </Link>
            </p>
          </div>
          {errors.acceptedTerms && (
            <p className="-mt-1 text-xs text-red-500">{errors.acceptedTerms.message}</p>
          )}
        </>
      )}

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <div className="mt-1 flex items-center gap-3">
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStep((s) => s - 1)}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Back</span>
          </Button>
        )}

        {isLast ? (
          <Button type="submit" size="lg" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={() => void goNext()} className="flex-1">
            Continue
          </Button>
        )}
      </div>

      <p className="text-content-muted text-center text-sm">
        Already have an account?{' '}
        <Link href={loginHref} className="text-accent-fg font-medium">
          Log in
        </Link>
      </p>
    </form>
  );
}
