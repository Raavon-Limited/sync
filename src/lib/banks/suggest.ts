/**
 * Guessing the bank from a Nigerian account number.
 *
 * WHY THIS IS POSSIBLE AT ALL
 *   A traditional bank issues a 10-digit NUBAN that carries no clue about who
 *   issued it. The mobile-money providers do something different: your account
 *   number IS your phone number with the leading zero removed. So 08129337783
 *   becomes 8129337783, and a number that matches a Nigerian mobile prefix is
 *   almost certainly one of a handful of fintechs rather than a high-street
 *   bank.
 *
 * THIS IS A HINT, NOT A DETERMINATION
 *   Nothing here proves which bank an account belongs to, and it never can  
 *   several providers can issue the same phone-derived number, and a legacy
 *   bank could coincidentally issue a NUBAN that looks like a phone number.
 *   The only authority is Paystack's resolve endpoint, which returns the
 *   account HOLDER'S NAME for a given (number, bank) pair. This narrows the
 *   list a person has to scan from ~100 to ~4; the resolve call confirms it.
 *
 *   So the UI must never auto-select on the strength of this alone. It offers.
 */

export interface BankOption {
  name: string;
  code: string;
  slug: string;
}

/**
 * Nigerian mobile network prefixes, with the leading 0 dropped   which is the
 * form an account number takes.
 *
 * Kept as data rather than a regex range because the ranges are not
 * contiguous: 812 is Airtel and is valid, 819 is not allocated to any network,
 * and treating "any 8xx" as a phone number would suggest fintechs for ordinary
 * NUBANs that merely happen to start with 8.
 */
const MOBILE_PREFIXES = new Set([
  // MTN
  '703', '704', '706', '803', '806', '810', '813', '814', '816', '903', '906', '913', '916',
  // Glo
  '705', '805', '807', '811', '815', '905', '915',
  // Airtel
  '701', '708', '802', '808', '812', '901', '902', '904', '907', '911', '912',
  // 9mobile
  '809', '817', '818', '908', '909',
]);

/**
 * Providers that issue the customer's phone number as their account number.
 *
 * Matched on slug fragments because Paystack's display names carry suffixes
 * that change   "Moniepoint MFB", "OPay Digital Services Limited (OPay)",
 * "PalmPay Limited"   and pinning the exact string would break the day one of
 * them is renamed.
 */
const PHONE_NUMBER_BANKS = ['opay', 'palmpay', 'moniepoint', 'paga', 'kuda'];

export interface Suggestion {
  /** Ordered best guess first. Empty when nothing can be inferred. */
  banks: BankOption[];
  /** Shown to the user so the suggestion does not look like magic. */
  reason: string | null;
}

/** Digits only   people paste numbers with spaces and dashes in them. */
export function normaliseAccountNumber(input: string): string {
  return input.replace(/\D/g, '').slice(0, 10);
}

/**
 * True when the account number is a Nigerian mobile number with its leading
 * zero removed.
 */
export function looksLikePhoneNumber(accountNumber: string): boolean {
  const digits = normaliseAccountNumber(accountNumber);
  return digits.length === 10 && MOBILE_PREFIXES.has(digits.slice(0, 3));
}

/**
 * Banks worth trying first for this account number.
 *
 * Returns an empty list rather than a bad guess: for an ordinary NUBAN there
 * genuinely is no signal, and offering three arbitrary banks would teach people
 * to trust a suggestion that is noise.
 */
export function suggestBanks(accountNumber: string, banks: BankOption[]): Suggestion {
  const digits = normaliseAccountNumber(accountNumber);
  if (digits.length !== 10) return { banks: [], reason: null };

  if (!looksLikePhoneNumber(digits)) return { banks: [], reason: null };

  const matches = PHONE_NUMBER_BANKS.flatMap((needle) =>
    banks.filter((b) => b.slug.includes(needle) || b.name.toLowerCase().includes(needle)),
  );

  // De-duplicated by code: Paystack lists some providers more than once (a
  // bank and its microfinance arm can share a name fragment).
  const seen = new Set<string>();
  const unique = matches.filter((b) => !seen.has(b.code) && seen.add(b.code));

  if (unique.length === 0) return { banks: [], reason: null };

  return {
    banks: unique,
    reason:
      'This looks like a phone number. These providers use your phone number as your account number.',
  };
}
