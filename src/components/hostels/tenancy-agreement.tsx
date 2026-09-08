'use client';

/**
 * The tenancy agreement — what the two of them actually agreed.
 *
 * IT IS ASSEMBLED FROM RECORD, NOT DRAFTED. Every clause below is a fact Sync
 * already holds and can evidence: the landlord accepted on a timestamp, the
 * student paid on a timestamp, the rent is the amount held in escrow, the term
 * came from the listing, the house rules are the ones the student saw before
 * they paid. Nothing here is boilerplate invented to look legal, because a
 * clause nobody agreed to is worse than no document at all - it is a document
 * that misrepresents them both.
 *
 * WHICH IS WHY THERE IS NO SIGNATURE BLOCK. Sync does not collect signatures,
 * and a printed line saying "Signed: ____" invites somebody to treat this as
 * an executed contract it is not. What it records instead is CONSENT AS IT
 * HAPPENED: the landlord accepted the request at a time, the student paid at a
 * time, and both acts are in the ledger. That is a stronger claim than an
 * unverified squiggle and it is one that can be checked.
 *
 * IT SAYS WHAT IT IS NOT. The footer states plainly that this is a record of
 * the arrangement rather than legal advice, and that Nigerian tenancy law
 * governs whatever it does not cover. Getting that wrong in either direction -
 * pretending it is nothing, or pretending it is a solicitor's lease - is the
 * failure mode.
 *
 * PRINTS ON ITS OWN. `print-sheet` is what the print stylesheet reveals; with
 * `printing-document` on the body everything else on screen is hidden, so this
 * comes out as a document rather than a screenshot of a sidebar.
 */

import { documentNaira } from '@/modules/documents/types';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

const dateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
    : null;

export interface TenancyAgreementProps {
  reference: string;
  studentName: string;
  landlordName?: string | null;
  hostelName: string;
  roomLabel?: string | null;
  address?: string | null;
  /** 'per session' | 'per year'. */
  term?: string | null;
  rentKobo?: number | null;
  /** Who bears Sync's commission. */
  feeMode?: 'absorb' | 'pass_on' | null;
  moveIn?: string | null;
  endDate?: string | null;
  graceUntil?: string | null;
  houseRules?: string[];
  /** The landlord accepting. */
  acceptedAt?: string | null;
  /** The student paying. */
  paidAt?: string | null;
}

export function TenancyAgreement(props: TenancyAgreementProps) {
  const termLabel = props.term === 'per year' ? 'One year' : 'One session (8 months)';

  return (
    <article className="print-sheet border-line/15 bg-panel text-content flex flex-col gap-5 rounded-2xl border p-5 sm:p-6">
      <header className="border-line/15 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="font-display text-lime-deep text-xl font-bold tracking-tight">Sync</p>
          <p className="text-content-muted mt-0.5 text-xs">KWASU · Malete, Kwara State</p>
        </div>
        <div className="text-right">
          <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            Tenancy agreement
          </p>
          <p className="text-content font-mono text-sm font-semibold">{props.reference}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Tenant" value={props.studentName} />
        <Field label="Landlord" value={props.landlordName ?? 'The property owner'} />
        <Field
          label="Property"
          value={[props.hostelName, props.roomLabel].filter(Boolean).join(' · ')}
        />
        {props.address && <Field label="Address" value={props.address} />}
      </section>

      <Clause n={1} title="The room">
        The landlord lets, and the tenant takes, {props.roomLabel ? `${props.roomLabel} at ` : ''}
        {props.hostelName}
        {props.address ? `, ${props.address}` : ''}, for their own residential use.
      </Clause>

      <Clause n={2} title="Term">
        {termLabel}, running from {longDate(props.moveIn) ?? 'the agreed move-in date'} to{' '}
        {longDate(props.endDate) ?? 'the end of the term'}.
        {props.graceUntil && (
          <>
            {' '}
            The landlord has extended occupation to {longDate(props.graceUntil)}. That extension is
            a permission, not a new term, and no further rent is charged for it.
          </>
        )}
      </Clause>

      <Clause n={3} title="Rent">
        {props.rentKobo ? (
          <>
            {documentNaira(props.rentKobo)} for the term, paid in full{' '}
            {props.paidAt ? `on ${longDate(props.paidAt)}` : 'before occupation'}.
            {/* Which side bears Sync's commission is part of what they agreed,
                and it is the single most common thing to argue about later. */}
            {props.feeMode === 'pass_on'
              ? " Sync's 2.5% service fee was added to this amount and paid by the tenant."
              : " Sync's 2.5% service fee is borne by the landlord out of this amount."}
          </>
        ) : (
          'As agreed between the parties.'
        )}
      </Clause>

      <Clause n={4} title="How the rent is held">
        Rent is held by Sync in escrow and released to the landlord one week after the move-in date.
        The tenant may cancel for a full refund within 72 hours of paying, unless they have
        confirmed they moved in. After that, disputes are settled through Sync support.
      </Clause>

      {props.houseRules && props.houseRules.length > 0 && (
        <Clause n={5} title="House rules">
          The tenant agreed to the following, shown on the listing before payment:
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {props.houseRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Clause>
      )}

      <Clause n={props.houseRules?.length ? 6 : 5} title="Ending the tenancy">
        The tenancy ends on the date in clause 2, or on the extended date where one has been
        granted. Sync marks it complete on that date and the room returns to the market. Renewal is
        a new agreement between the same parties.
      </Clause>

      {/*
        CONSENT AS IT HAPPENED, not a signature line. See the header for why.
      */}
      <section className="border-line/15 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div>
          <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            Landlord accepted
          </p>
          <p className="text-content mt-0.5 text-sm">
            {dateTime(props.acceptedAt) ?? 'Recorded on Sync'}
          </p>
          <p className="text-content-muted mt-0.5 text-[11px]">
            {props.landlordName ?? 'The landlord'} accepted this booking on Sync.
          </p>
        </div>
        <div>
          <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            Tenant paid
          </p>
          <p className="text-content mt-0.5 text-sm">
            {dateTime(props.paidAt) ?? 'Recorded on Sync'}
          </p>
          <p className="text-content-muted mt-0.5 text-[11px]">
            {props.studentName} paid the rent in full.
          </p>
        </div>
      </section>

      <footer className="text-content-muted border-line/15 border-t pt-4 text-[10px] leading-relaxed">
        This is a record of an arrangement made through Sync, generated from the parties&rsquo; own
        actions on the platform. It is not legal advice and does not replace a tenancy agreement
        drawn up by a lawyer. Anything not covered here is governed by the tenancy law of Kwara
        State and of the Federal Republic of Nigeria. Reference {props.reference}.
      </footer>
    </article>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="print-keep">
      <p className="text-content text-sm font-semibold">
        {n}. {title}
      </p>
      <p className="text-content-muted mt-1 text-sm leading-relaxed">{children}</p>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">{label}</p>
      <p className="text-content mt-0.5 text-sm break-words">{value}</p>
    </div>
  );
}
