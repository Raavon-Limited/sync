/**
 * What Sync asks each kind of account for, in one place.
 *
 * WHY THIS IS NOT IN THE DATABASE
 *   It is product config, not state. `verification_documents` records what was
 *   uploaded and what a reviewer decided; this is the list of what we ASK for,
 *   and a requirement nobody has uploaded still has to appear   as unmet.
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
 * already one of the others; this role exists so the fleet's own paperwork   a
 * CAC certificate and an address that exists   is asked for separately from the
 * owner's personal ID, which they may have submitted years ago as a rider.
 */
/**
 * EVERY ROLE IS HERE, INCLUDING THE ONES NOBODY CAN SIGN UP AS YET.
 *
 * 'creator' and 'event_manager' show on /signup as "Not yet". Defining what
 * they will be asked for now, rather than the week they open, is the cheap
 * half of the work and the half that gets forgotten: the upload step, the
 * settings panel and the public card all read this list, so a role that
 * arrives without an entry silently asks for nothing and verifies everybody
 * who applies.
 *
 * Adding a role to this union with no requirements is therefore a bug, not a
 * default   `requirementsFor` returning an empty array means an account that
 * cannot fail verification.
 */
export type VerificationRole =
  | 'student'
  | 'rider'
  | 'vendor'
  | 'landlord'
  | 'company'
  | 'creator'
  | 'event_manager';

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
   * a reviewer   and later the card   can say WHICH one was seen rather than
   * only the category.
   */ 
  options?: DocumentOption[];
  /**
   * Must be taken by the camera, now. No file picker.
   *
   * THIS RAISES THE BAR; IT DOES NOT CLOSE THE DOOR. A browser cannot prove an
   * image came from a live camera   a determined person can still post a saved
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
    description: 'Taken now, on your camera   not uploaded. A reviewer compares it to your ID.',
    colour: 'bg-emerald-50 text-emerald-600',
    // Everyone, without exception. Whatever else an account is, a person is
    // behind it and this is the picture a reviewer holds against the ID.
    roles: ['student', 'rider', 'vendor', 'landlord', 'company', 'creator', 'event_manager'],
    captureOnly: true,
  },
  {
    key: 'gov_id',
    label: 'Government ID',
    accepts: 'NIN, passport or driver’s licence',
    description: 'A clear photo of the whole document, with the details readable.',
    colour: 'bg-violet-50 text-violet-500',
    roles: ['student', 'rider', 'vendor', 'landlord', 'company', 'creator', 'event_manager'],
    options: [
      // Both forms are in circulation and they are not the same object: the
      // slip is a one-sided paper printout (what most people hold), the card is
      // two-sided plastic. The upload step reads this distinction to decide
      // whether a back side can be insisted on.
      { value: 'nin', label: 'NIN slip or card', hint: 'Slip is one side; card has a back' },
      { value: 'passport', label: 'International pa sport', hint: 'The photo page' },
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
    // A student, rider or creator registers no company. Asking them for one is
    // how onboarding gets abandoned halfway.
    //
    // An event manager DOES: they take ticket money from strangers for an event
    // that has not happened yet, which is the same exposure a vendor taking
    // payment for undelivered food has.
    roles: ['vendor', 'landlord', 'company', 'event_manager'],
    options: [
      { value: 'cac_certificate', label: 'CAC certificate' },
      { value: 'cac_business_name', label: 'CAC business name registration' },
    ],
  },
  {
    key: 'proof_address',
    label: 'Proof of address',
    accepts: 'Bank statement, prepaid receipt or NEPA bill',
    // The matching requirement is the whole point   a bill in somebody else's
    // name, or for a different street, proves nothing about this applicant.
    description: 'Dated within the last 3 months, showing the same address you gave us.',
    colour: 'bg-amber-50 text-amber-500',
    // A creator is not asked for one: they are paid for files they send, meet
    // nobody at a door, and hold no money on anyone's behalf. An event manager
    // is, because a venue and a refund liability are both physical.
    roles: ['rider', 'vendor', 'landlord', 'company', 'event_manager'],
    options: [
      { value: 'bank_statement', label: 'Bank statement', hint: 'Last 3 months' },
      { value: 'prepaid_receipt', label: 'Prepaid meter receipt' },
      { value: 'nepa_bill', label: 'NEPA / electricity bill', hint: 'Last 3 months' },
      { value: 'tenancy', label: 'Tenancy agreement' },
    ],
  },
  {
    key: 'student_id',
    label: 'School ID',
    accepts: 'Student ID card, or an admission letter',
    description:
      'Your school ID card, showing your name and matriculation number. An admission letter works if the card has not been issued yet.',
    colour: 'bg-sky-50 text-sky-500',
    // STUDENTS ONLY, AND THIS IS THE POINT OF THE ROLE SPLIT.
    //
    // A CAC certificate says somebody runs a business; it says nothing about
    // whether they study here, and one account can be both. The live photo and
    // the government ID above are shared because they identify the PERSON, who
    // is the same person in every role. This is the role-specific evidence, and
    // it cannot be satisfied by anything a business uploaded.
    roles: ['student'],
    options: [
      { value: 'student_id_card', label: 'Student ID card' },
      { value: 'admission_letter', label: 'Admission letter', hint: 'If your card is not out yet' },
    ],
  },
  {
    key: 'portfolio',
    label: 'Work samples',
    accepts: 'Three recent pieces, or a link to a profile',
    description:
      'Three things you have shot, or a link to where your work lives. A vendor paying for a video is buying the person who made these.',
    colour: 'bg-fuchsia-50 text-fuchsia-500',
    // NOT REQUIRED OF ANYONE ELSE, and not the same check as the others: this
    // one is about competence rather than identity. It is here because the
    // brief-and-escrow flow pays on delivery, so the moment to find out somebody
    // cannot do the work is before a vendor's money is held for it.
    roles: ['creator'],
    options: [
      { value: 'samples', label: 'Upload samples', hint: 'Up to three files' },
      { value: 'profile_link', label: 'Screenshot of a profile', hint: 'Instagram, TikTok, drive' },
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
