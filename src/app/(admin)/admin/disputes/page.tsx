/**
 * ROUTE: /admin/disputes
 * ACCESS: admin / super_admin only, enforced here and again in the action and
 *         the RPC.
 * PURPOSE: Read a dispute and decide where the escrowed money goes.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { DisputesQueue, type AdminDispute } from './(components)/disputes-queue';

export const metadata: Metadata = { title: 'Disputes — Admin' };

import type { Row } from '@/lib/supabase/row';

export default async function Page() {
  await requireStaffArea('disputes');

  const admin = createAdminClient();

  const [{ data: disputes }, { data: messages }, { data: profiles }, { data: holds }] =
    await Promise.all([
      admin
        .from('disputes')
        .select(
          'id, code, category, status, summary, raised_by, against_id, order_id, booking_id, request_id, resolution, refund_kobo, created_at',
        )
        .order('created_at', { ascending: false }),
      admin
        .from('dispute_messages')
        .select('id, dispute_id, author_id, body, is_internal, created_at')
        .order('created_at', { ascending: true }),
      // Names come from a separate read because `profiles` is own-row-only under
      // RLS; the service role can see them, but only here.
      admin.from('profiles').select('id, full_name'),
      admin.from('escrow_holds').select('order_id, booking_id, request_id, amount_kobo, status'),
    ]);

  const nameById = new Map(((profiles ?? []) as Row[]).map((p) => [p.id, p.full_name]));

  const msgsByDispute = new Map<string, AdminDispute['messages']>();
  for (const m of (messages ?? []) as Row[]) {
    const list = msgsByDispute.get(m.dispute_id) ?? [];
    list.push({
      id: m.id,
      body: m.body,
      isInternal: !!m.is_internal,
      authorName: nameById.get(m.author_id) ?? null,
      createdAt: m.created_at,
    });
    msgsByDispute.set(m.dispute_id, list);
  }

  /** A dispute points at exactly one subject; the hold does too. */
  function holdFor(d: Row) {
    return ((holds ?? []) as Row[]).find(
      (h) =>
        (d.order_id && h.order_id === d.order_id) ||
        (d.booking_id && h.booking_id === d.booking_id) ||
        (d.request_id && h.request_id === d.request_id),
    );
  }

  const rows: AdminDispute[] = ((disputes ?? []) as Row[]).map((d) => {
    const hold = holdFor(d);
    return {
      id: d.id,
      code: d.code,
      category: d.category,
      status: d.status,
      summary: d.summary,
      raisedByName: nameById.get(d.raised_by) ?? null,
      againstName: nameById.get(d.against_id) ?? null,
      orderId: d.order_id ?? null,
      resolution: d.resolution ?? null,
      refundKobo: d.refund_kobo ?? null,
      createdAt: d.created_at,
      holdKobo: hold?.amount_kobo ?? null,
      holdStatus: hold?.status ?? null,
      messages: msgsByDispute.get(d.id) ?? [],
    };
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / DISPUTES</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Open <span className="text-lime-deep">cases.</span>
        </h2>
      </div>
      <DisputesQueue disputes={rows} />
    </section>
  );
}
