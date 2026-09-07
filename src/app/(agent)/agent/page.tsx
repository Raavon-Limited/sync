/**
 * ROUTE: /agent
 * PURPOSE: Send an agent to the thing they opened the app for.
 *
 * The dashboard used to BE this route, which is why every agent notification
 * 404'd: `private.notify` sets href 'visits' and the bell resolves it as
 * `${rootHref}/${href}`, so they all pointed at `/agent/visits` while the page
 * sat at `/agent`. The page moved rather than the notifications changing -
 * rows already written cannot be rewritten, and a route that exists fixes both
 * the old ones and the new.
 *
 * Visits rather than requests, because being expected somewhere at four
 * o'clock outranks work you might choose to pick up.
 */
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/agent/visits');
}
