/**
 * InviteEmail - "come and help run this store".
 *
 * WHY THIS CARRIES A LINK AND NEVER A PASSWORD
 *   The obvious version of this feature mails a temporary password. It is
 *   worse in every way that matters: a password sits in an inbox indefinitely,
 *   gets forwarded, gets reused on other sites, and is readable by anyone who
 *   later gains access to that mailbox. A link expires, is single-use, and is
 *   bound to the one address it was sent to.
 *
 *   So the recipient clicks through and CHOOSES a password, which means the
 *   only person who ever knows it is the person using it. Sync never has it
 *   and never sent it.
 *
 * IT SAYS WHAT THEY ARE GETTING, AND WHAT THEY ARE NOT. Somebody handed access
 * to a business needs to know the shape of it before they accept   and the
 * owner needs them to know that this is not access to the money.
 *
 * Inline styles only - the rule for email clients.
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

export interface InviteEmailProps {
  /** The store they will be working. */
  storeName: string;
  /** Who sent it   a business name is more recognisable than an email. */
  invitedBy: string;
  /** Plain-English section names, already resolved from scopes. */
  sections: string[];
  joinUrl: string;
  /** e.g. "7 days". Rendered, not computed, so the copy matches the token. */
  expiresIn: string;
}

export function InviteEmail({
  storeName,
  invitedBy,
  sections,
  joinUrl,
  expiresIn,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {invitedBy} invited you to help run {storeName} on Sync
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
            You have been invited to {storeName}
          </Heading>
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: '22px', margin: 0 }}>
            {invitedBy} wants you to help run their store on Sync. Accepting takes a minute   you
            will pick your own password on the way in.
          </Text>

          {sections.length > 0 && (
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
                WHAT YOU CAN DO
              </Text>
              {sections.map((s) => (
                <Text
                  key={s}
                  style={{ color: INK, fontSize: 14, lineHeight: '22px', margin: '0 0 2px' }}
                >
                  • {s}
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
              Accept the invitation
            </Button>
          </Section>

          <Text style={{ color: MUTED, fontSize: 13, lineHeight: '20px', margin: '0 0 16px' }}>
            {/* Said plainly. The person accepting is taking on responsibility
                for somebody else's business, and the boundary is the reason
                they can accept without worrying about it. */}
            You will not be able to see the owner&rsquo;s earnings, wallet, payouts or bank
            details. Those stay with them.
          </Text>

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            This link expires in {expiresIn} and works only for this email address. If the button
            does not work, paste this into your browser:{' '}
            <Link href={joinUrl} style={{ color: MUTED, wordBreak: 'break-all' }}>
              {joinUrl}
            </Link>
          </Text>

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '18px', margin: '12px 0 0' }}>
            Not expecting this? Ignore it   nothing happens until you open the link.
          </Text>
        </Container>

        <Text
          style={{ color: FAINT, fontSize: 12, margin: '16px 0 0', textAlign: 'center' as const }}
        >
          © Sync · Raavon Limited
        </Text>
      </Body>
    </Html>
  );
}

export default InviteEmail;
