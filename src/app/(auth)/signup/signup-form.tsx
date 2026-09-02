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
 * STUDENTS NAME THEIR UNIVERSITY; VENDORS DO NOT GIVE AN ADDRESS HERE. The vendor's
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
import { PasswordRequirements } from '@/components/forms/password-requirements';
import { EmailInput } from '@/components/forms/email-input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { signupSchema, type SignupInput, type Trade, type VendorCategory } from '@/lib/validations';
import { signUp } from '@/modules/auth/actions';
import { readAppSurface } from '@/lib/pwa/use-install';
import { useCampuses, type Campus } from '@/modules/campuses';
import { CampusInput } from '@/components/forms/campus-input';

/**
 * The account types, including the ones you cannot pick yet.
 *
 * WHY LIST WHAT IS NOT BUILT
 *   Somebody arriving to sign up as a content creator should find out here,
 *   in one glance, rather than picking the nearest wrong thing and becoming a
 *   support ticket. Showing the shape of the platform is also how people learn
 *   it is coming   a role that only appears the day it ships is a role nobody
 *   was waiting for.
 *
 *   `id` is null for those. It cannot be a real role id: SignupInput['role']
 *   is a three-value union and the schema rejects anything else, which is the
 *   second line of defence if one of these ever became clickable by accident.
 */
type RoleCard =
  | { id: SignupInput['role']; label: string; desc: string; soon?: false }
  | { id: null; label: string; desc: string; soon: true };

const ROLES: RoleCard[] = [
  { id: 'student', label: "I'm a student", desc: 'Find hostels, food & services' },
  { id: 'vendor', label: 'I sell or rent', desc: 'Rooms, food, services & more' },
  // A rider answers nothing else here. Vehicle, plate and documents belong to
  // the onboarding they meet on their own dashboard   asking for a plate number
  // beside a password field is how a signup form stops being a signup form.
  { id: 'rider', label: 'I deliver', desc: 'Take delivery jobs on your campus' },
  {
    id: null,
    soon: true,
    label: 'I create content',
    desc: 'Shoot and post for campus businesses',
  },
  {
    id: null,
    soon: true,
    label: 'I run events',
    desc: 'List parties, shows and sell tickets',
  },
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
 * only raises an issue on the campus fields for students and on `vendorCategory` for
 * vendors, so naming both here is harmless and means the table does not have to
 * be re-derived every time the role changes.
 */
const STEP_FIELDS: Record<number, (keyof SignupInput)[]> = {
  0: ['role', 'campusId', 'campusOther', 'vendorCategory', 'trade'],
  1: ['fullName', 'phone'],
  2: ['email', 'password', 'confirmPassword', 'acceptedTerms'],
};

export function SignupForm({
  next,
  email: initialEmail,
  noAccount = false,
}: {
  next?: string;
  email?: string;
  /** Arrived from /login because this address has no account. Said, not assumed. */
  noAccount?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const { data: campuses = [], isPending: campusesLoading } = useCampuses();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    /**
     * EVERY text field defaults to '' rather than being left undefined.
     *
     * Undefined fails `z.string()` before any rule runs, so the message was
     * Zod's own "Invalid input: expected string, received undefined" - internal
     * wording shown to a user who had simply not typed anything yet. With ''
     * the field's real rules run and produce the copy they were written for.
     */
    defaultValues: {
      role: 'student',
      acceptedTerms: false,
      fullName: '',
      phone: '',
      // Prefilled when /login sent them here because this address has no
      // account. Step 3 still shows and validates it like any other field.
      email: initialEmail ?? '',
      password: '',
      confirmPassword: '',
    },
  });

  const role = watch('role');
  const vendorCategory = watch('vendorCategory');
  const acceptedTerms = watch('acceptedTerms');
  // The text in the box, and the campus it resolved to (null while free text).
  // Kept as local state rather than derived from the form: the box holds a NAME
  // while the form holds an id, so they are genuinely two different values.
  const [campusText, setCampusText] = useState('');
  const [campus, setCampus] = useState<Campus | null>(null);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  // The address as it stands now, so the banner keeps naming the right one if
  // they correct it on step 3 rather than going back to login.
  const emailValue = watch('email');
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
      setValue('campusOther', undefined);
      setCampus(null);
      setCampusText('');
    }
  }

  async function goNext() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (!ok) return;

    // Clear before advancing. `trigger` runs the WHOLE schema through the
    // resolver, so validating step 2 also evaluates the step 3 fields, and
    // those errors stayed in formState - which is why arriving on the last step
    // showed "Email is required" under a field nobody had touched yet. The
    // current step has just passed, so there is nothing worth keeping.
    clearErrors();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onSubmit(values: SignupInput) {
    const res = await signUp(values);
    if (!res.ok) {
      if (res.alreadyRegistered) {
        /*
         * Auth is keyed on email, so a second signup with the same address can
         * never succeed   and the old message ("account exists, please log in")
         * read as a refusal when the thing the person wants is genuinely
         * possible. You do not make a second account to sell; you add a
         * business account to the one you have, from the account menu.
         *
         * The intended role rides along so /login can say so specifically
         * rather than making them work it out.
         */
        const wantsBusiness = values.role !== 'student';
        const added = values.role === 'rider' ? 'rider' : 'vendor';
        toast(
          wantsBusiness
            ? `You already have an account with this email. Sign in, then add a ${added} account from the menu under your avatar.`
            : 'You already have an account with this email. Sign in to continue.',
        );
        router.push(
          `/login?email=${encodeURIComponent(values.email)}${wantsBusiness ? `&add=${added}` : ''}`,
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
      /*
       * A RIDER DOES NOT GO TO /onboarding. That route is the vendor wizard and
       * the proxy gates it to vendor/landlord, so `role !== 'student'` alone
       * would drop a new rider straight onto a 403. They land on their own
       * dashboard, which asks for the rest when they get there.
       *
       * A STUDENT ON A PHONE LANDS ON /around, the same as signing in   see
       * destFor in the login form. Home on a phone is the feed, and a brand new
       * account has nothing on its dashboard to look at yet, which makes it the
       * worst possible first screen.
       *
       * BUSINESS AND RIDER ROLES ARE NOT REROUTED, on any surface. Onboarding
       * and the rider's own setup are not preferences, they are the work that
       * has to happen before the account can do anything   sending them to a
       * feed first would be hiding the one screen they need.
       */
      const home =
        values.role === 'rider'
          ? '/rider'
          : values.role === 'student'
            ? readAppSurface()
              ? '/around'
              : '/me'
            : '/onboarding';
      router.push(next ?? home);
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
      {/* Why they are here.
          Somebody who typed their address into the LOGIN form and ended up on
          a signup form has to be told what happened, or the redirect reads as
          the site losing their place. It names the address, because the usual
          cause is a typo or the wrong one of two mailboxes   and offers the way
          back for exactly that case. */}
      {noAccount && (
        <div className="border-line/15 bg-surface-deep/60 flex flex-col gap-1 rounded-xl border p-4">
          <p className="text-content text-sm font-medium">
            {emailValue ? `No account for ${emailValue}` : 'No account for that email'}
          </p>
          <p className="text-content-muted text-xs">
            You are on the sign-up form because that address has never been used here. Create the
            account below, or{' '}
            <Link href={loginHref} className="text-accent-fg font-medium">
              log in with a different email
            </Link>
            .
          </p>
        </div>
      )}

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
            {/* One full-width card per row, not a 2-up grid.
                Three roles in two columns left a hole in the grid and squeezed
                each card into a narrow box, so "I'm a student" wrapped onto
                three lines and the cards grew tall enough to push the campus
                field off a phone screen. Full width gives the label a single
                line and lets the card be short.

                The "ROLE" eyebrow is gone with it: the tick already says which
                one is selected, and a word repeated on every card is not
                telling anyone anything. */}
            <div className="flex flex-col gap-2.5">
              {ROLES.map((r) => {
                const selected = r.id !== null && role === r.id;
                /*
                 * A role that is not built yet is rendered as a DISABLED
                 * button, not as a div styled to look inert. The button
                 * carries `disabled`, so the browser skips it in the tab order
                 * and screen readers announce it as unavailable   neither of
                 * which a div would do, and both of which are the actual point
                 * of showing it.
                 */
                const soon = r.soon === true;
                return (
                  <button
                    key={r.label}
                    type="button"
                    disabled={soon}
                    onClick={() => {
                      if (r.id) selectRole(r.id);
                    }}
                    aria-pressed={soon ? undefined : selected}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 pr-2 text-left transition-all',
                      soon
                        ? 'border-line/10 bg-panel/50 cursor-not-allowed'
                        : selected
                          ? 'border-line bg-lime shadow-[3px_3px_0_0_var(--color-ink)]'
                          : 'border-line/15 hover:border-line/40 bg-panel',
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'font-display block text-base font-bold',
                          soon ? 'text-content/40' : selected ? 'text-ink' : 'text-content',
                        )}
                      >
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block text-sm',
                          soon
                            ? 'text-content-muted/50'
                            : selected
                              ? 'text-ink/70'
                              : 'text-content-muted',
                        )}
                      >
                        {r.desc}
                      </span>
                    </span>
                    {soon ? (
                      <span className="border-line/20 text-content-muted/60 mr-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] tracking-wide whitespace-nowrap uppercase">
                        Not yet
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center border',
                          selected
                            ? 'border-line bg-ink rounded-md text-white'
                            : 'border-line/30 rounded-full',
                        )}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    )}
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
            <FormField label="Your university" htmlFor="campus" error={errors.campusOther?.message}>
              {/* Type-ahead, not a dropdown: there are a hundred-odd
                  institutions and a student knows exactly which is theirs, so
                  typing three letters beats scrolling. A university we do not
                  have is ACCEPTED as free text - a gap in our seed must never
                  be why someone cannot sign up - and the field says so, plus
                  where we actually operate, the moment it happens. */}
              <CampusInput
                id="campus"
                campuses={campuses}
                loading={campusesLoading}
                value={campusText}
                selected={campus}
                placeholder="Start typing, e.g. KWASU"
                onChange={(text) => {
                  setCampusText(text);
                  // Free text until a suggestion is picked. Trimmed to satisfy
                  // the schema's min length without trapping a trailing space.
                  const trimmed = text.trim();
                  setValue('campusOther', trimmed.length >= 2 ? trimmed : undefined, {
                    shouldValidate: false,
                  });
                }}
                onSelect={(c) => {
                  setCampus(c);
                  // Exactly one of the two is ever set, so they cannot disagree
                  // about which university this student attends.
                  setValue('campusId', c?.id, { shouldValidate: false });
                  setValue('campusOther', c ? undefined : campusText.trim() || undefined, {
                    shouldValidate: false,
                  });
                }}
              />
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
            {/* Placeholder follows the role. It was hardcoded to
                "you@student.edu.ng", which a vendor signing up was shown as an
                example of what THEY should type. */}
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <EmailInput
                  id="email"
                  name={field.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={role === 'vendor' ? 'you@yourbusiness.com' : 'you@gmail.com'}
                />
              )}
            />
          </FormField>

          {/* The live checklist replaces the field-level error: showing both
              means saying "one capital letter" twice, once in red and once with
              a tick. The list is the better of the two - it shows every rule
              before you fail it. */}
          <FormField label="Password" htmlFor="password">
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    placeholder="Choose a strong password"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                  <PasswordRequirements value={field.value ?? ''} />
                </>
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
          {/* items-center, not items-start: the label is one short line, so
              top-aligning the box left it sitting above the text. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={acceptedTerms}
              aria-label="Agree to Terms and Privacy Policy"
              onClick={() => setValue('acceptedTerms', !acceptedTerms, { shouldValidate: true })}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors',
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
