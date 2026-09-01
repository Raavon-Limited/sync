/**
 * StaffInviteEmail — "come and help run Sync".
 *
 * The console counterpart of InviteEmail, and it carries a link for the same
 * reason that one does: a mailed password sits in an inbox indefinitely, gets
 * forwarded and gets reused elsewhere, while a link expires, is single-use and
 * is bound to the address it was sent to. The recipient chooses their own
 * password on the way in, so Sync never has it and never sent it.
 *
 * IT SAYS WHAT THE ROLE OPENS. Console access is not one thing — a reviewer and
 * a finance admin are handed very different keys — and somebody being asked to
 * take on either should be able to see which before they accept. A role with no
 * areas yet says so rather than pretending.
 *
 * Inline styles only — the rule for email clients.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const CREAM = '#f4f1e8';
const INK = '#0e0e12';
const LIME = '#c5ff4a';
const MUTED = '#6a6a72';
const FAINT = '#9a9aa2';

export interface StaffInviteEmailProps {
  /** Who sent it. An address is more use here than "the Sync team". */
  invitedBy: string;
  /** The role they will hold, or null when they were invited without one. */
  roleName: string | null;
  /** Area labels the role opens, already resolved. */
  areas: string[];
  joinUrl: string;
  /** e.g. "10 minutes". Rendered, not computed, so the copy matches the token. */
  expiresIn: string;
}

export function StaffInviteEmail({
  invitedBy,
  roleName,
  areas,
  joinUrl,
  expiresIn,
}: StaffInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{invitedBy} invited you to the Sync admin console</Preview>
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
            {roleName ? `You have been invited as ${roleName}` : 'You have been invited to Sync'}
          </Heading>
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: '22px', margin: 0 }}>
            {invitedBy} wants you on the team that runs Sync. Accepting takes a minute — you will
            pick your own password on the way in.
          </Text>

          {areas.length > 0 && (
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
                WHAT YOU CAN OPEN
              </Text>
              {areas.map((a) => (
                <Text
                  key={a}
                  style={{ color: INK, fontSize: 14, lineHeight: '22px', margin: '0 0 2px' }}
                >
                  • {a}
                </Text>
              ))}
            </Section>
          )}

          <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
            <Button
              href={joinUrl}
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
              Accept and set a password
            </Button>
          </Section>

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '20px', margin: '0 0 4px' }}>
            This link works once and expires in {expiresIn}. It was sent to this address only — if
            it reached you by mistake, ignore it and nothing happens.
          </Text>
          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '20px', margin: 0 }}>
            If the button does not work, paste this into your browser:{' '}
            <Link href={joinUrl} style={{ color: MUTED }}>
              {joinUrl}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default StaffInviteEmail;
