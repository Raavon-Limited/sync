/**
 * What Sync asks each kind of account for, in one place.
 *
 * WHY THIS IS NOT IN THE DATABASE
 *   It is product config, not state. `verification_documents` records what was
 *   uploaded and what a reviewer decided; this is the list of what we ASK for,
 *   and a requirement nobody has uploaded still has to appear — as unmet.
 *   Deriving the list from the rows would silently drop exactly the checks that
 *   matter most, because a missing document is the interesting case.
 *
 * ONE DEFINITION, THREE AUDIENCES
 *   The onboarding wizard (what to collect), the settings panel (what is
 *   outstanding) and the public card page (what a stranger at a door is being
 *   told) all read this. Copies would drift, and the drift would show up as a
 *   card claiming a check nobody was asked to pass.
 *
 * ROLE-AWARE, BECAUSE A STUDENT HAS NO CAC
 *   One wizard asking every account for a business registration is how a
 *   student abandons onboarding. `requirementsFor(role)` is the only correct
 *   way to read this list.
 */

/**
 * `company` is a LOGISTICS FLEET, not a fifth kind of person. Its owner is
 * already one of the others; this role exists so the fleet's own paperwork — a
 * CAC certificate and an address that exists — is asked for separately from the
 * owner's personal ID, which they may have submitted years ago as a rider.
 */
export type VerificationRole = 'student' | 'rider' | 'vendor' | 'landlord' | 'company';

/** One acceptable document for a requirement. The reviewer records which. */
export interface DocumentOption {
  value: string;
  label: string;
  hint?: string;
}

export interface VerificationRequirementSpec {
  /** Matches `verification_documents.doc_type`. */
  key: string;
  /** Short, for the public card. */
  label: string;
  /** What satisfies it, in the terms people actually use. */
  accepts: string;
  /** Longer guidance, for the upload step. */
  description: string;
  /** Chip colour. */
  colour: string;
  /** Which accounts must provide it. */
  roles: VerificationRole[];
  /**
   * The specific documents that count. Stored on the row as `doc_subtype`, so
   * a reviewer — and later the card — can say WHICH one was seen rather than
   * only the category.
   */
  options?: DocumentOption[];
  /**
   * Must be taken by the camera, now. No file picker.
   *
   * THIS RAISES THE BAR; IT DOES NOT CLOSE THE DOOR. A browser cannot prove an
   * image came from a live camera — a determined person can still post a saved
   * file straight at the endpoint. What capture-only stops is the ordinary
   * case: someone quietly picking a photo of another person out of their
   * gallery. Actual liveness (depth, motion, challenge-response) is what Smile
   * ID / Dojah sell, and until one is wired in this is a speed bump plus a
   * human comparing the selfie to the ID.
   */
  captureOnly?: boolean;
}

export const VERIFICATION_REQUIREMENTS: VerificationRequirementSpec[] = [
  {
    key: 'selfie',
    label: 'Live photo',
    accepts: 'Taken on camera at sign-up',
    description: 'Taken now, on your camera — not uploaded. A reviewer compares it to your ID.',
    colour: 'bg-emerald-50 text-emerald-600',
    roles: ['student', 'rider', 'vendor', 'landlord', 'company'],
    captureOnly: true,
  },
  {
    key: 'gov_id',
    label: 'Government ID',
    accepts: 'NIN, passport or driver’s licence',
    description: 'A clear photo of the whole document, with the details readable.',
    colour: 'bg-violet-50 text-violet-500',
    roles: ['student', 'rider', 'vendor', 'landlord', 'company'],
    options: [
      // Both forms are in circulation and they are not the same object: the
      // slip is a one-sided paper printout (what most people hold), the card is
      // two-sided plastic. The upload step reads this distinction to decide
      // whether a back side can be insisted on.
      { value: 'nin', label: 'NIN slip or card', hint: 'Slip is one side; card has a back' },
      { value: 'passport', label: 'International passport', hint: 'The photo page' },
      { value: 'drivers_licence', label: "Driver's licence" },
      { value: 'voters_card', label: "Voter's card" },
    ],
  },
  {
    key: 'biz_reg',
    label: 'Business registration',
    accepts: 'CAC certificate',
    description: 'Your CAC certificate or business name registration.',
    colour: 'bg-blue-50 text-blue-500',
    // A student or rider registers no company. Asking them for one is how
    // onboarding gets abandoned halfway.
    roles: ['vendor', 'landlord', 'company'],
    options: [
      { value: 'cac_certificate', label: 'CAC certificate' },
      { value: 'cac_business_name', label: 'CAC business name registration' },
    ],
  },
  {
    key: 'proof_address',
    label: 'Proof of address',
    accepts: 'Bank statement, prepaid receipt or NEPA bill',
    // The matching requirement is the whole point — a bill in somebody else's
    // name, or for a different street, proves nothing about this applicant.
    description: 'Dated within the last 3 months, showing the same address you gave us.',
    colour: 'bg-amber-50 text-amber-500',
    roles: ['rider', 'vendor', 'landlord', 'company'],
    options: [
      { value: 'bank_statement', label: 'Bank statement', hint: 'Last 3 months' },
      { value: 'prepaid_receipt', label: 'Prepaid meter receipt' },
      { value: 'nepa_bill', label: 'NEPA / electricity bill', hint: 'Last 3 months' },
      { value: 'tenancy', label: 'Tenancy agreement' },
    ],
  },
];

/** What this kind of account has to provide. The only correct way to read the list. */
export function requirementsFor(role: VerificationRole): VerificationRequirementSpec[] {
  return VERIFICATION_REQUIREMENTS.filter((r) => r.roles.includes(role));
}

/** Looked up by key, so an unknown one from the server still renders. */
export function requirementSpec(key: string): VerificationRequirementSpec | undefined {
  return VERIFICATION_REQUIREMENTS.find((r) => r.key === key);
}

/** The human label for a stored `doc_subtype`, e.g. 'nin' -> 'NIN slip or card'. */
export function documentOptionLabel(key: string, subtype: string | null): string | null {
  if (!subtype) return null;
  return requirementSpec(key)?.options?.find((o) => o.value === subtype)?.label ?? subtype;
}
