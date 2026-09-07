/**
 * BroadcastEmail   whatever the mail centre is sending, in Sync's clothes.
 *
 * THE BODY IS PLAIN TEXT, DELIBERATELY
 *   Staff type into a textarea and paragraphs come out. No rich editor, no
 *   pasted HTML: an admin console that accepts markup accepts markup from
 *   whoever gets into the console, and the thing it sends carries our sender
 *   domain to every account on the platform. Blank lines split paragraphs and
 *   that is the whole formatting language.
 *
 * IT LOOKS LIKE THE OTHER ONES
 *   Same shell as the verification and invite emails. A mailshot that arrives
 *   looking unlike everything else Sync sends is the shape of a phishing
 *   attempt, and teaching people that our own mail varies is the opposite of
 *   what a consistent sender is for.
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

export interface BroadcastEmailProps {
  /** First name where we have one. */
  name: string;
  heading: string;
  /** Paragraphs, already split. */
  paragraphs: string[];
  /** Optional call to action. Both or neither. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function BroadcastEmail({
  name,
  heading,
  paragraphs,
  ctaLabel,
  ctaUrl,
}: BroadcastEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
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
            {heading}
          </Heading>

          <Text style={{ color: MUTED, fontSize: 14, lineHeight: '22px', margin: '0 0 12px' }}>
            Hi {name},
          </Text>

          {paragraphs.map((p, i) => (
            <Text
              key={i}
              style={{ color: MUTED, fontSize: 14, lineHeight: '22px', margin: '0 0 12px' }}
            >
              {p}
            </Text>
          ))}

          {ctaLabel && ctaUrl && (
            <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
              <Button
                href={ctaUrl}
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
                {ctaLabel}
              </Button>
            </Section>
          )}

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '20px', margin: 0 }}>
            You are getting this because you have a Sync account. Replying to this email reaches our
            support team.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BroadcastEmail;
