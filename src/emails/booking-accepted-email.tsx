/**
 * BookingAcceptedEmail   the landlord said yes, and a clock started.
 *
 * THIS IS THE ONE NOTIFICATION THAT CANNOT BE IN-APP ONLY.
 *   Every other alert can wait for the next time somebody opens Sync. This one
 *   cannot: accepting starts a 24-hour hold, and if the student does not act
 *   the room goes back on the market. Until this existed the only signal was a
 *   bell icon inside an app they had no reason to open that evening, so the
 *   most likely way to lose a room was never being told you had been given one.
 *
 * IT OFFERS BOTH DOORS, because paying is not the only way to keep the hold.
 *   Booking a viewing extends it to the viewing itself (`sync_booking_hold`
 *   reads the inspection's `scheduled_for`), so a student who is not ready to
 *   send ₦300,000 to a room they have never stood in has something to do other
 *   than let it lapse. Offering only "pay now" would make the safe choice
 *   invisible and the deadline feel like a threat.
 *
 * THE DEADLINE IS A TIME, NOT A DURATION. "within 24 hours" is measured from a
 * moment the reader was not present for. `reserved_until` is the real value and
 * it is what the hold is enforced against, so it is what the email prints.
 *
 * Inline styles only   the rule for email clients.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const CREAM = '#f4f1e8';
const INK = '#0e0e12';
const LIME = '#c5ff4a';
const MUTED = '#6a6a72';
const FAINT = '#9a9aa2';

export interface BookingAcceptedEmailProps {
  /** First name where we have one. "there" beats an empty greeting. */
  name: string;
  hostelName: string;
  /** Which room, when one was chosen. Null is a real state: some listings have none. */
  roomLabel?: string | null;
  /** Formatted for a person, in Lagos time. Not an ISO string. */
  deadline: string;
  /** Naira, already formatted. */
  amount: string;
  /** Naira, already formatted. What a viewing costs, if they want one first. */
  inspectionFee: string;
  payUrl: string;
  inspectionUrl: string;
}

export function BookingAcceptedEmail({
  name,
  hostelName,
  roomLabel,
  deadline,
  amount,
  inspectionFee,
  payUrl,
  inspectionUrl,
}: BookingAcceptedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {hostelName} is held for you until {deadline}
      </Preview>
      <Body
        style={{
          backgroundColor: CREAM,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          margin: 0,
          padding: '40px 16px',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(14,14,18,0.08)',
            borderRadius: 16,
            margin: '0 auto',
            maxWidth: 440,
            padding: 32,
          }}
        >
          <Heading
            style={{
              color: INK,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
            }}
          >
            Your room is held
          </Heading>

          <Text style={{ color: INK, fontSize: 15, lineHeight: '24px', margin: '0 0 8px' }}>
            Hi {name}, the landlord accepted your request for <strong>{hostelName}</strong>
            {roomLabel ? (
              <>
                , <strong>{roomLabel}</strong>
              </>
            ) : null}
            .
          </Text>

          {/* The deadline is the entire point of the email, so it is the one
              thing set apart from the prose rather than buried in it. */}
          <Section
            style={{
              backgroundColor: 'rgba(197,255,74,0.15)',
              border: '1px solid rgba(14,14,18,0.08)',
              borderRadius: 12,
              margin: '16px 0',
              padding: '14px 16px',
            }}
          >
            <Text style={{ color: INK, fontSize: 15, fontWeight: 700, margin: 0 }}>
              Held until {deadline}
            </Text>
            <Text style={{ color: MUTED, fontSize: 13, lineHeight: '20px', margin: '4px 0 0' }}>
              After that it goes back on the market and anyone can take it.
            </Text>
          </Section>

          <Text style={{ color: INK, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
            Two things keep it yours. Pay the {amount} rent to confirm it outright, or book a
            viewing for {inspectionFee} and the hold moves to your viewing date so you can see the
            room before you pay for it.
          </Text>

          <Button
            href={payUrl}
            style={{
              backgroundColor: LIME,
              borderRadius: 999,
              color: INK,
              display: 'block',
              fontSize: 15,
              fontWeight: 700,
              padding: '13px 24px',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Pay {amount} and confirm
          </Button>

          <Button
            href={inspectionUrl}
            style={{
              border: '1px solid rgba(14,14,18,0.15)',
              borderRadius: 999,
              color: INK,
              display: 'block',
              fontSize: 15,
              fontWeight: 600,
              margin: '10px 0 0',
              padding: '12px 24px',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Book a viewing first ({inspectionFee})
          </Button>

          <Hr style={{ borderColor: 'rgba(14,14,18,0.08)', margin: '24px 0 16px' }} />

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            You have not been charged anything yet, and nothing is taken automatically. Replying to
            this email reaches our support team.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BookingAcceptedEmail;
