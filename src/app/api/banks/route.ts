/**
 * ROUTE: /api/banks  (GET)
 *
 * Returns the Nigerian bank list for the payout account form.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A CONSTANT
 * A payout needs a `bank_code`, not a bank name   `bank_accounts.bank_code` is
 * what Paystack's transfer-recipient API is keyed on. The previous UI collected
 * a NAME from a hardcoded list, which means it could never have produced a valid
 * payout destination.
 *
 * Codes also change: banks merge, fintechs get licensed, codes are reassigned.
 * Paystack publishes the authoritative list, so this proxies it rather than
 * freezing a copy that silently rots.
 *
 * It is a server route because the Paystack secret key must not reach the
 * browser. The response contains no secrets   it is the same list Paystack
 * serves publicly   so it is cached hard.
 */
import { paystackConfigured } from '@/lib/paystack/server';

export interface BankOption {
  name: string;
  code: string;
  slug: string;
}

// Banks change on the order of months, not minutes.
export const revalidate = 86_400;

export async function GET() {
  if (!paystackConfigured) {
    // Explicit and empty rather than a stale hardcoded list: a form that offers
    // banks it cannot produce codes for creates payouts that fail later, which
    // is far worse to debug than a form that says it is unavailable.
    return Response.json(
      { banks: [], error: 'Bank list unavailable: Paystack is not configured.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=100', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      next: { revalidate },
    });

    if (!res.ok) {
      return Response.json({ banks: [], error: 'Could not load banks.' }, { status: 502 });
    }

    const payload = (await res.json()) as {
      data?: Array<{ name: string; code: string; slug: string }>;
    };

    const banks: BankOption[] = (payload.data ?? [])
      .map((b) => ({ name: b.name, code: b.code, slug: b.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ banks });
  } catch {
    return Response.json({ banks: [], error: 'Could not load banks.' }, { status: 502 });
  }
}
