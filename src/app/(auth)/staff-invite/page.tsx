/**
 * ROUTE: /staff-invite?token=...
 * ACCESS: public. The token IS the credential — it was mailed to one address
 *         and nowhere else, and every check that matters runs server-side in
 *         `accept_staff_invite`.
 * PURPOSE: Where a console invitation lands. Set a password, get an account,
 *          arrive holding the role you were invited into.
 *
 * DELIBERATELY NOT UNDER /admin. The person opening this link is, by
 * definition, not staff yet — a page inside the console would guard itself
 * against the only visitor it exists for. It lives in the auth group with
 * login and signup, which is what it is: a way in.
 */
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { previewStaffInvite } from '@/modules/admin/invite-actions';
import { StaffInviteForm } from './staff-invite-form';

export const metadata: Metadata = { title: 'Join the Sync team' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Resolved here rather than in the client: the preview reads the invite with
  // the service role, which a browser cannot and must not do.
  const preview = await previewStaffInvite(token ?? '');

  return (
    <AuthLayout
      eyebrow="Admin invitation"
      title={preview.valid ? 'Join the team that runs Sync' : 'This invitation'}
    >
      <StaffInviteForm token={token ?? ''} preview={preview} />
    </AuthLayout>
  );
}
