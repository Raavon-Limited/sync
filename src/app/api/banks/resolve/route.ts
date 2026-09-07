/**
 * ROUTE: /api/banks/resolve  (GET ?account_number=&bank_code=)
 *
 * Returns the ACCOUNT HOLDER'S NAME for a (number, bank) pair   the check a
 * banking app does the moment you finish typing, and the only thing here that
 * actually proves anything. `suggest.ts` narrows the bank list from a hundred
 * to a handful; this confirms which one it is by coming back with a name.
 *
 * WHY IT MATTERS MORE THAN THE SUGGESTION
 *   A payout goes to whoever owns the account, not whoever the form says owns
 *   it. Letting a vendor type their own name next to somebody else's account
 *   number means the first withdrawal is the moment anyone finds out. Resolving
 *   makes the name server-supplied and unforgeable from the browser.
 *
 * WHY IT IS NOT CACHED
 *   The bank list is public and static; an account name is neither. It is
 *   somebody's name attached to their account number, so it is fetched per
 *   request, logged nowhere, and returned to the one person who asked.
 *
 * AUTHENTICATED ONLY
 *   Otherwise this is an open name-lookup oracle for any Nigerian account
 *   number, sitting on the public internet with our Paystack key paying for it.
 */
import { createClient } from '@/lib/supabase/server';
import { paystackConfigured } from '@/lib/paystack/server';
import { normaliseAccountNumber } from '@/lib/banks/suggest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountNumber = normaliseAccountNumber(url.searchParams.get('account_number') ?? '');
  const bankCode = (url.searchParams.get('bank_code') ?? '').replace(/\D/g, '');

  if (accountNumber.length !== 10 || !bankCode) {
    return Response.json({ error: 'A 10-digit account number and a bank are required.' }, { status: 400 });
  }

  if (!paystackConfigured) {
    // The same honesty as /api/banks: say the check could not run rather than
    // returning a blank name that the form would treat as a valid answer.
    return Response.json(
      { error: 'Account check unavailable: Paystack is not configured.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        cache: 'no-store',
      },
    );

    const payload = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { account_name?: string; account_number?: string };
    };

    if (!res.ok || !payload.status || !payload.data?.account_name) {
      // Paystack says "Could not resolve account name. Check parameters or try
      // again." for a wrong pairing, which is exactly what the user needs to
      // see   it means "this account number is not at this bank".
      return Response.json(
        { error: payload.message ?? 'Could not find that account at this bank.' },
        { status: 404 },
      );
    }

    return Response.json({ accountName: payload.data.account_name });
  } catch {
    return Response.json({ error: 'Could not reach the bank right now.' }, { status: 502 });
  }
}
