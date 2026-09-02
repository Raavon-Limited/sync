/**
 * VerificationDecisionEmail   the answer to a submission somebody is waiting on.
 *
 * ONE TEMPLATE, THREE OUTCOMES
 *   Verified, rejected, and "we need something else". They are the same letter
 *   with a different first line and a different list, and splitting them into
 *   three files is how the wording drifts until a rejection sounds harsher than
 *   anyone intended and an approval forgets to say what it unlocks.
 *
 * A DECISION WITHOUT A REASON IS NOT A DECISION
 *   `missing` is the whole point of the 'needs_info' case: telling somebody
 *   they are not verified without saying what to do next guarantees a support
 *   message, and the reviewer already knew the answer when they clicked. The
 *   same applies to a rejection, which carries the reviewer's note.
 *
 * IT IS SENT BECAUSE PEOPLE DO NOT SIT ON THE DASHBOARD
 *   The status has always been on /me. Somebody who uploaded a passport on
 *   Tuesday is not refreshing it   they are waiting to be told, and until this
 *   existed nobody ever was.
 *
 * Inline styles only   the rule for email clients.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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

export type VerificationOutcome = 'verified' | 'rejected' | 'needs_info';

export interface VerificationDecisionEmailProps {
  /** First name where we have one. "there" is better than an empty greeting. */
  name: string;
  outcome: VerificationOutcome;
  /** What the account is being verified AS   "student", "business", "rider". */
  subject: string;
  /**
   * Outstanding items, already in the words the person will see on their own
   * screen. Documents and profile details both belong here: from where they
   * are sitting, "your matric number" and "your school ID" are the same kind
   * of task.
   */
  missing?: string[];
  /** The reviewer's own words, when they added any. */
  note?: string | null;
  /** Where to go and fix it, or see the result. */
  actionUrl: string;
}

const COPY: Record<VerificationOutcome, { preview: string; heading: string; cta: string }> = {
  verified: {
    preview: 'Your Sync account is verified',
    heading: 'You are verified',
    cta: 'Open your dashboard',
  },
  rejected: {
    preview: 'About your Sync verification',
    heading: 'We could not verify this yet',
    cta: 'Send it again',
  },
  needs_info: {
    preview: 'One more thing for your Sync verification',
    heading: 'We need a little more',
    cta: 'Finish verification',
  },
};

export function VerificationDecisionEmail({
  name,
  outcome,
  subject,
  missing = [],
  note,
  actionUrl,
}: VerificationDecisionEmailProps) {
  const copy = COPY[outcome];

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
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
          <Text
            style={{
              color: INK,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Sync
          </Text>

          <Heading style={{ color: INK, fontSize: 24, fontWeight: 700, margin: '24px 0 8px' }}>
            {copy.heading}
          </Heading>

          <Text style={{ color: MUTED, fontSize: 14, lineHeight: '22px', margin: 0 }}>
            {outcome === 'verified' ? (
              <>
                Hi {name}, a reviewer has checked your {subject} details and everything matched.
                Your account now carries the verified badge, which is what a landlord, a vendor or a
                customer looks for before taking you at your word.
              </>
            ) : outcome === 'rejected' ? (
              <>
                Hi {name}, a reviewer looked at your {subject} details and could not confirm them
                from what was sent. This is not final. Putting right what is listed below and
                sending it again is all it takes.
              </>
            ) : (
              <>
                Hi {name}, your {subject} verification is nearly there. A reviewer needs the
                following before they can finish, and nothing happens until they have it.
              </>
            )}
          </Text>

          {missing.length > 0 && (
            <Section style={{ margin: '20px 0 0' }}>
              <Text
                style={{
                  color: FAINT,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  margin: '0 0 8px',
                }}
              >
                WHAT IS OUTSTANDING
              </Text>
              {missing.map((m) => (
                <Text
                  key={m}
                  style={{ color: INK, fontSize: 14, lineHeight: '22px', margin: '0 0 2px' }}
                >
                  • {m}
                </Text>
              ))}
            </Section>
          )}

          {note && (
            <Section style={{ margin: '20px 0 0' }}>
              <Text
                style={{
                  color: FAINT,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  margin: '0 0 8px',
                }}
              >
                FROM THE REVIEWER
              </Text>
              <Text style={{ color: INK, fontSize: 14, lineHeight: '22px', margin: 0 }}>
                {note}
              </Text>
            </Section>
          )}

          <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
            <Button
              href={actionUrl}
              style={{
                backgroundColor: LIME,
                borderRadius: 12,
                color: INK,
                display: 'inline-block',
                fontSize: 15,
                fontWeight: 700,
                padding: '14px 28px',
                textDecoration: 'none',
              }}
            >
              {copy.cta}
            </Button>
          </Section>

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '20px', margin: 0 }}>
            You are getting this because somebody submitted verification for this address on Sync.
            Replying to this email reaches our support team.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default VerificationDecisionEmail;
