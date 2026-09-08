'use client';

/**
 * The agreement tab: booking facts from the row, listing facts from the hostel.
 *
 * WHY IT FETCHES RATHER THAN TAKING EVERYTHING AS PROPS. The agreement needs
 * the term, who bears the commission, the house rules and the address - all of
 * which live on the HOSTEL, none of which the bookings query joins, and none of
 * which are worth joining onto every row for a document almost nobody opens.
 * `useHostel` is the same hook the sheet around this already calls with the
 * same slug, so this is a cache hit rather than a second request.
 */

import { useHostel } from '@/modules/hostels/hooks';
import { TenancyAgreement } from './tenancy-agreement';

export interface BookingAgreementTabProps {
  slug: string;
  reference: string;
  studentName: string;
  hostelName: string;
  roomLabel?: string | null;
  rentKobo?: number | null;
  moveIn?: string | null;
  endDate?: string | null;
  graceUntil?: string | null;
  acceptedAt?: string | null;
  paidAt?: string | null;
}

export function BookingAgreementTab(props: BookingAgreementTabProps) {
  const { data: hostel, isLoading } = useHostel(props.slug);

  if (isLoading) {
    return <div className="bg-ink/5 h-96 w-full animate-pulse rounded-2xl" />;
  }

  return (
    <TenancyAgreement
      reference={props.reference}
      studentName={props.studentName}
      hostelName={props.hostelName}
      roomLabel={props.roomLabel}
      address={hostel?.address ?? hostel?.area ?? null}
      term={hostel?.term ?? 'per session'}
      feeMode={hostel?.feeMode ?? 'absorb'}
      // The listing's price is the fallback: nothing snapshots a rent onto the
      // booking, so without it the agreement would state a rent of nothing.
      rentKobo={props.rentKobo ?? hostel?.pricePerSessionKobo ?? null}
      houseRules={hostel?.houseRules ?? []}
      moveIn={props.moveIn}
      endDate={props.endDate}
      graceUntil={props.graceUntil}
      acceptedAt={props.acceptedAt}
      paidAt={props.paidAt}
    />
  );
}
