/**
 * WalletTopupEmail - the receipt for money entering a Sync wallet.
 *
 * WHY A TOP-UP GETS AN EMAIL AT ALL, when most things here do not.
 *   The house rule is that an in-app bell is enough for anything that can wait.
 *   Money arriving is the exception for the same reason a bank sends one: it is
 *   the only record the payer holds outside a system they have to log into, and
 *   it is what they check against their card statement when the two disagree.
 *   Until now a top-up produced nothing at all - no mail, and on a machine the
 *   webhook could not reach, no balance change either. The payer's entire
 *   feedback was a toast saying "your wallet will update shortly".
 *
 * IT REPORTS, IT DOES NOT ASK. There is no action in this email and there must
 *   not be one. A payment receipt carrying a button is the exact shape of every
 *   phishing mail about a payment, and teaching people to click one is worse
 *   than the small convenience. The one link goes to their own wallet.
 *
 * THE NEW BALANCE IS INCLUDED because the amount alone does not answer the
 *   question the reader actually has. It is read AFTER the credit, so it is
 *   what the wallet screen will show them.
 *
 * THE REFERENCE IS PRINTED, in full and in monospace. It is the only string
 *   that connects this to the charge on their card statement and to anything
 *   support can look up, and a receipt without one is a claim rather than a
 *   record.
 *
 * Inline styles only - the rule for email clients.
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const CREAM = '#f2f1ea';
const INK = '#344e41';
const MUTED = '#4e5d53';
const FAINT = '#9a9aa2';

export interface WalletTopupEmailProps {
  /** First name where we have one. "there" beats an empty greeting. */
  name: string;
  /** Naira, already formatted. What was added. */
  amount: string;
  /** Naira, already formatted. What the wallet holds now. */
  balance: string;
  /** The Paystack reference, printed verbatim. */
  reference: string;
  /** Formatted for a person, in Lagos time. Not an ISO string. */
  paidAt: string;
  walletUrl: string;
}

export function WalletTopupEmail({
  name,
  amount,
  balance,
  reference,
  paidAt,
  walletUrl,
}: WalletTopupEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{amount} added to your Sync wallet</Preview>
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
            {amount} added to your wallet
          </Heading>

          <Text style={{ color: INK, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
            Hi {name}, your top-up went through on {paidAt}.
          </Text>

          {/* The number they came for, set apart from the prose. */}
          <Section
            style={{
              backgroundColor: 'rgba(14,14,18,0.04)',
              border: '1px solid rgba(14,14,18,0.08)',
              borderRadius: 12,
              margin: '0 0 16px',
              padding: '14px 16px',
            }}
          >
            <Text
              style={{
                color: MUTED,
                fontSize: 11,
                letterSpacing: '0.08em',
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              Wallet balance
            </Text>
            <Text style={{ color: INK, fontSize: 24, fontWeight: 700, margin: '2px 0 0' }}>
              {balance}
            </Text>
          </Section>

          <Text style={{ color: INK, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
            You can spend it on rent, food and events across Sync. Nothing has been taken from it
            yet.
          </Text>

          <Hr
            style={{
              border: 'none',
              borderTop: '1px solid rgba(14,14,18,0.08)',
              margin: '8px 0 16px',
            }}
          />

          <Text
            style={{
              color: MUTED,
              fontSize: 11,
              letterSpacing: '0.08em',
              margin: '0 0 2px',
              textTransform: 'uppercase',
            }}
          >
            Payment reference
          </Text>
          {/* Monospace and unbroken: this is the string somebody will read out
              to support or match against a card statement. */}
          <Text
            style={{
              color: INK,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              lineHeight: '18px',
              margin: '0 0 16px',
              wordBreak: 'break-all',
            }}
          >
            {reference}
          </Text>

          {/*
            A LINK, NOT A BUTTON, AND IT GOES TO THEIR OWN WALLET.
            A receipt about money with a prominent call to action is
            indistinguishable in shape from the phishing mail about the same
            money. There is nothing here the reader has to do.
          */}
          <Text style={{ color: MUTED, fontSize: 13, lineHeight: '20px', margin: '0 0 8px' }}>
            See it in your wallet:{' '}
            <Link href={walletUrl} style={{ color: INK, textDecoration: 'underline' }}>
              {walletUrl}
            </Link>
          </Text>

          <Text style={{ color: FAINT, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            If you did not make this payment, reply to this email and we will look into it. We will
            never ask you for your card details or your password.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
