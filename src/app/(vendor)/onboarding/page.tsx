/**
 * ROUTE: /onboarding
 * ACCESS: authenticated vendor (newly signed up)
 * PURPOSE: 5-step vendor onboarding wizard: profile → business → category → documents → review. Drives auto ID check (Smile ID/Dojah) and triggers an admin verification visit.
 * BUILT HERE: <OnboardingWizard> - per-step react-hook-form + zod, document upload to Supabase Storage.
 */
import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/auth/queries';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import type { VendorCategory } from '@/lib/validations';
import { OnboardingWizard } from '@/components/verification/onboarding-wizard';

export const metadata: Metadata = { title: 'Vendor onboarding' };

export default async function Page() {
  const user = await getCurrentUser();
  const meta = user?.user_metadata ?? {};

  // The business name comes from `vendor_profiles`, not from metadata.
  // vendor_profiles is what claim_business_name writes and what it checks
  // before refusing a change, so it is the only source that agrees with the
  // rule the form is about to be judged against. Metadata is a record of what
  // was typed at signup and can be stale by the time anybody re-verifies.
  let businessName: string | undefined;
  if (user?.id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('vendor_profiles')
      .select('business_name')
      .eq('id', user.id)
      .maybeSingle();
    businessName =
      ((data as unknown as Row | null)?.business_name as string | undefined) ?? undefined;
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 md:py-16">
      <div>
        <p className="eyebrow text-accent-fg">/onboarding</p>
        <h1 className="font-display text-content mt-1 text-3xl tracking-tight md:text-4xl">
          Set up your business
        </h1>
        <p className="text-content-muted mt-2 text-sm">
          A few steps to get verified — then you can start taking orders on Sync.
        </p>
      </div>

      <OnboardingWizard
        initial={{
          fullName: (meta.full_name as string | undefined) ?? '',
          phone: (meta.phone as string | undefined) ?? '',
          vendorCategory: meta.vendor_category as VendorCategory | undefined,
          businessName,
        }}
      />
    </section>
  );
}
