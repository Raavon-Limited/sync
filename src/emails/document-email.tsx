/**
 * A receipt or invoice, as an email.
 *
 * THE DOCUMENT IS THE BODY, NOT AN ATTACHMENT. Downloads on Sync are
 * print-to-PDF from the page itself, so there is no server-side file to
 * attach - and attaching one would be the wrong instinct anyway. A receipt
 * people can read in the preview pane is more useful than a PDF they have to
 * open, and an unexpected attachment on a mail about money is the shape of
 * every invoice-fraud campaign there is. The link goes to the same document on
 * Sync, where the print button lives.
 *
 * IT MIRRORS DocumentSheet DELIBERATELY, and cannot import it: that component
 * is Tailwind classes against the app's tokens, and an email client has no
 * stylesheet and no custom properties. The values below are the same palette
 * written out literally, which is the trade every email template here makes.
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
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components';
import { documentNaira, type PaymentDocument } from '@/modules/documents/types';

const CREAM = '#f2f1ea';
const INK = '#344e41';
const LIME = '#44633f'; // lime-deep - see globals.css
const MUTED = '#4e5d53';
const FAINT = '#9a9aa2';
const RULE = 'rgba(14,14,18,0.10)';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

export interface DocumentEmailProps {
  doc: PaymentDocument;
  /** Absolute link back to the document on Sync, where printing happens. */
  documentUrl: string;
  /** First name where we have one. */
  name: string;
}

export function DocumentEmail({ doc, documentUrl, name }: DocumentEmailProps) {
  const isInvoice = doc.type === 'invoice';

  return (
    <Html>
      <Head />
      <Preview>
        {isInvoice ? 'Invoice' : 'Receipt'} {doc.number} · {documentNaira(doc.totalKobo)}
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
            border: '1px solid ' + RULE,
            borderRadius: 16,
            margin: '0 auto',
            maxWidth: 520,
            padding: 32,
          }}
        >
          <Row>
            <Column>
              <Text style={{ color: LIME, fontSize: 20, fontWeight: 700, margin: 0 }}>Sync</Text>
              <Text style={{ color: MUTED, fontSize: 11, margin: '2px 0 0' }}>
                KWASU · Malete, Kwara State
              </Text>
            </Column>
            <Column align="right">
              <Text
                style={{
                  color: MUTED,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  margin: 0,
                  textTransform: 'uppercase',
                }}
              >
                {isInvoice ? 'Invoice' : 'Receipt'}
              </Text>
              <Text
                style={{
                  color: INK,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  margin: '2px 0 0',
                }}
              >
                {doc.number}
              </Text>
            </Column>
          </Row>

          <Hr style={{ border: 'none', borderTop: '1px solid ' + RULE, margin: '20px 0' }} />

          <Heading style={{ color: INK, fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
            {doc.title}
          </Heading>
          {doc.subject && (
            <Text style={{ color: MUTED, fontSize: 13, margin: '0 0 12px' }}>{doc.subject}</Text>
          )}

          <Text style={{ color: INK, fontSize: 14, lineHeight: '22px', margin: '0 0 16px' }}>
            Hi {name},{' '}
            {isInvoice
              ? 'here is what is outstanding.'
              : 'here is your receipt. Nothing further is needed.'}
          </Text>

          <Section
            style={{
              backgroundColor: 'rgba(14,14,18,0.03)',
              border: '1px solid ' + RULE,
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            {doc.lines.map((line, i) => (
              <Row key={i} style={{ marginBottom: 6 }}>
                <Column>
                  <Text
                    style={{
                      color: line.informational ? MUTED : INK,
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    {line.label}
                  </Text>
                  {line.note && (
                    <Text style={{ color: FAINT, fontSize: 11, margin: '1px 0 0' }}>
                      {line.note}
                    </Text>
                  )}
                </Column>
                <Column align="right">
                  <Text
                    style={{
                      color: line.informational ? MUTED : INK,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    {line.amountKobo < 0
                      ? `(${documentNaira(line.amountKobo)})`
                      : documentNaira(line.amountKobo)}
                  </Text>
                </Column>
              </Row>
            ))}

            <Hr style={{ border: 'none', borderTop: '1px solid ' + RULE, margin: '12px 0' }} />

            <Row>
              <Column>
                <Text style={{ color: INK, fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {isInvoice ? 'Amount due' : 'Total'}
                </Text>
              </Column>
              <Column align="right">
                <Text
                  style={{
                    color: INK,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  {documentNaira(doc.totalKobo)}
                </Text>
              </Column>
            </Row>
          </Section>

          <Row style={{ marginTop: 16 }}>
            <Column>
              <Text style={{ color: MUTED, fontSize: 11, margin: 0 }}>
                {isInvoice ? 'Issued' : 'Date paid'}
              </Text>
              <Text style={{ color: INK, fontSize: 13, margin: '1px 0 0' }}>
                {longDate(doc.issuedAt)}
              </Text>
            </Column>
            {isInvoice && doc.dueAt && (
              <Column align="right">
                <Text style={{ color: MUTED, fontSize: 11, margin: 0 }}>Due by</Text>
                <Text style={{ color: INK, fontSize: 13, fontWeight: 700, margin: '1px 0 0' }}>
                  {longDate(doc.dueAt)}
                </Text>
              </Column>
            )}
          </Row>

          {doc.footnote && (
            <Text style={{ color: MUTED, fontSize: 12, lineHeight: '19px', margin: '16px 0 0' }}>
              {doc.footnote}
            </Text>
          )}

          <Hr style={{ border: 'none', borderTop: '1px solid ' + RULE, margin: '20px 0 12px' }} />

          {/* A link, not a button, and no attachment. See the header. */}
          <Text style={{ color: MUTED, fontSize: 12, lineHeight: '19px', margin: '0 0 8px' }}>
            Open it on Sync to print or save a PDF:{' '}
            <Link href={documentUrl} style={{ color: INK, textDecoration: 'underline' }}>
              {documentUrl}
            </Link>
          </Text>

          <Text style={{ color: FAINT, fontSize: 11, lineHeight: '17px', margin: 0 }}>
            {isInvoice
              ? 'This is a request for payment, not a receipt.'
              : 'Computer generated. Valid without a signature.'}{' '}
            We will never ask you for your card details or your password by email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
