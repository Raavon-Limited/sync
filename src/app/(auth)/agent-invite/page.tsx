/**
 * ROUTE: /agent-invite?token=...
 * ACCESS: public. The token IS the credential   it was mailed to one address
 *         and nowhere else, and every check that matters runs server-side in
 *         `accept_agent_invite`.
 * PURPOSE: Where an agent invitation lands. Set a password, get an account,
 *          arrive holding the role.
 *
 * DELIBERATELY NOT UNDER /agent. The person opening this link is, by
 * definition, not an agent yet   a page inside the dashboard would be gated
 * against the only visitor it exists for. It lives with login and signup,
 * which is what it is: a way in.
 */
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { previewAgentInvite } from '@/modules/agents/invite-actions';
import { AgentInviteForm } from './agent-invite-form';

export const metadata: Metadata = { title: 'Join Sync as an agent' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Resolved here rather than in the client: the preview reads the invite with
  // the service role, which a browser cannot and must not do.
  const preview = await previewAgentInvite(token ?? '');

  return (
    <AuthLayout
      eyebrow="Agent invitation"
      title={preview.valid ? 'Verify listings for Sync' : 'This invitation'}
    >
      <AgentInviteForm token={token ?? ''} preview={preview} />
    </AuthLayout>
  );
}
