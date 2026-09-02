/**
 * ROUTE: /admin/notifications
 * ACCESS: any staff account, enforced HERE as well as by the proxy.
 * PURPOSE: The staff inbox   verification requests and anything else routed to
 *          this account.
 *
 * WHY THIS ROUTE HAD TO EXIST
 *   The bell in the dashboard header renders "View all notifications" pointing
 *   at `${basePath}/notifications`, and for staff the base is /admin. Only
 *   /user/notifications was ever built, so on every admin screen that link was a
 *   404   the one place an admin would go to catch up on what they had missed.
 *
 * IT WAS THE ONE ADMIN PAGE WITH NO GUARD
 *   Every other page in the console calls requireStaff or requireStaffArea; this
 *   one was a bare client component exported as the page, so there was no server
 *   render in which to ask the question at all. That was survivable only while
 *   something else asked it   and nothing did: the /admin line in the proxy's
 *   PROTECTED_PREFIXES was commented out. Both halves are fixed; both stay.
 *
 * NO AREA IS REQUIRED, deliberately. This is the caller's own inbox, and a
 * reviewer granted `riders` alone still gets told when something needs them.
 *
 * DELIBERATELY NOT A COPY OF /user/notifications
 *   That page carries a preferences tab whose toggles are not persisted (it
 *   says so). There is no reason to grow a second copy of an unwired control.
 *   This is the inbox and nothing else.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { NotificationsInbox } from './(components)/notifications-inbox';

export const metadata: Metadata = { title: 'Notifications   Admin' };

export default async function Page() {
  await requireStaff();
  return <NotificationsInbox />;
}
