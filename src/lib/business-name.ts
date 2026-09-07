/**
 * Is this a business name somebody chose, or one the system invented?
 *
 * `vendor_profiles.business_name` is NOT NULL, so a business row that exists
 * before its owner has named it still has to hold something. Since
 * 20260901250000 that something is a per-account placeholder  
 * `Unnamed business 21e446ce`   rather than the shared literal that used to
 * collide on the unique index and break onboarding for everybody after the
 * first.
 *
 * A placeholder must never be shown to the person as though it were their
 * answer: prefilling "Unnamed business 21e446ce" into the business-name field
 * is worse than an empty box, because it looks like something they typed.
 *
 * THIS MIRRORS `private.is_placeholder_business_name` IN SQL, deliberately and
 * with the same rule (a leading "unnamed business", case-insensitive). The
 * database is the authority   it decides whether a name may still be claimed  
 * and this is the client's read of the same fact, used only to decide what to
 * put in an input. If the two ever disagree the server still wins: it refuses
 * the write and says why.
 */
export function isPlaceholderBusinessName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  if (trimmed === '') return true;
  return trimmed.toLowerCase().startsWith('unnamed business');
}

/**
 * The name to show, or '' when there is nothing worth showing.
 *
 * Used for prefill. An empty string means "ask them"; anything else is a name
 * they have already claimed, which `claim_business_name` will refuse to change.
 */
export function claimedBusinessName(name: string | null | undefined): string {
  return isPlaceholderBusinessName(name) ? '' : (name ?? '').trim();
}
