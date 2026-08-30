/**
 * ROUTE: /vendor/join?token=...
 * ACCESS: any signed-in user with a CONFIRMED email.
 *
 * Where an invite link lands. The token is validated server-side by
 * accept_storefront_invite(), which checks expiry, single use, and that the
 * caller's confirmed email matches the address invited.
 *
 * Deliberately under /vendor: the proxy now admits invited managers to this
 * prefix, so the person accepting arrives already inside the shell they are
 * joining rather than being bounced to /403 and told nothing.
 */
import type { Metadata } from 'next';
import { JoinContainer } from './(components)/join-container';

export const metadata: Metadata = { title: 'Join a store' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-3 py-10">
      <JoinContainer token={token ?? null} />
    </section>
  );
}
