/**
 * ROUTE: /user/receipts/[id]
 * ACCESS: authenticated; the document is looked up in the caller's OWN list, so
 *         an id belonging to somebody else is simply not found.
 *
 * The id is the payment reference, which is why it is encoded in the link and
 * decoded here - a Paystack reference carries characters a path segment does
 * not survive untouched.
 */
import type { Metadata } from 'next';
import { DocumentDetail } from '@/components/documents/document-detail';

export const metadata: Metadata = { title: 'Document' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetail documentId={decodeURIComponent(id)} basePath="/user/receipts" />;
}
