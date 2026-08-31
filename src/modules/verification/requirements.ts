/**
 * What Sync asks every business for, in one place.
 *
 * WHY THIS IS NOT IN THE DATABASE
 *   It is product config, not state. `verification_documents` records what was
 *   uploaded and what a reviewer decided; this is the list of what we ASK for,
 *   and a requirement nobody has uploaded still has to appear — as unmet.
 *   Deriving the list from the rows would silently drop exactly the checks that
 *   matter most, because a missing document is the interesting case.
 *
 * WHY IT IS NOT IN THE SQL EITHER
 *   `verify_card()` returns a `key` and whether it was `met`. The wording is
 *   presentation, and putting copy in a migration means every rewording is a
 *   database change somebody has to push. The RPC still returns a label as a
 *   fallback for a key this file has not heard of.
 *
 * ONE DEFINITION, TWO AUDIENCES
 *   The upload panel (the vendor, deciding what to photograph) and the public
 *   card page (a stranger at a door, deciding whether to trust somebody) read
 *   the same list. Two copies would drift, and the drift would show up as the
 *   card claiming a check the vendor was never asked to pass.
 *
 * `accepts` NAMES THE REAL DOCUMENTS — NIN, CAC — because that is what people
 * call them, and "Government ID" alone tells a tenant nothing about what was
 * actually seen.
 *
 * BUT IT DOES NOT CLAIM WHICH ONE WAS SUBMITTED. `gov_id` is satisfied by a
 * NIN slip, a driver's licence OR a passport, and the schema does not record
 * which. A card reading "NIN verified" when the vendor uploaded a passport
 * would be a false statement on the one page whose whole job is being true, so
 * the label stays the category and `accepts` lists what counts.
 */

export interface VerificationRequirementSpec {
  /** Matches `verification_documents.doc_type`. */
  key: string;
  /** Short, for the public card. */
  label: string;
  /** What satisfies it, in the terms people actually use. */
  accepts: string;
  /** Longer guidance, for the upload panel. */
  description: string;
  /** Chip colour on the upload panel. */
  colour: string;
}

export const VERIFICATION_REQUIREMENTS: VerificationRequirementSpec[] = [
  {
    key: 'gov_id',
    label: 'Government ID',
    accepts: 'NIN, driver’s licence or passport',
    description: "National ID (NIN), Driver's licence, or International passport",
    colour: 'bg-violet-50 text-violet-500',
  },
  {
    key: 'biz_reg',
    label: 'Business registration',
    accepts: 'CAC certificate',
    description: 'CAC certificate or business name registration',
    colour: 'bg-blue-50 text-blue-500',
  },
  {
    key: 'proof_address',
    label: 'Proof of address',
    accepts: 'Utility bill or tenancy agreement',
    description: 'A utility bill or tenancy agreement from the last 3 months',
    colour: 'bg-amber-50 text-amber-500',
  },
];

/** Looked up by key, so an unknown one from the server still renders. */
export function requirementSpec(key: string): VerificationRequirementSpec | undefined {
  return VERIFICATION_REQUIREMENTS.find((r) => r.key === key);
}
