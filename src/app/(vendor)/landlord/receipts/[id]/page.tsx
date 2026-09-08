/**
 * ROUTE: /landlord/receipts/[id]
 * ACCESS: landlord; scoped to documents where they are the PAYEE.
 */
import type { Metadata } from 'next';
import { DocumentDetail } from '@/components/documents/document-detail';

export const metadata: Metadata = { title: 'Receipt' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DocumentDetail
      documentId={decodeURIComponent(id)}
      scope="landlord"
      basePath="/landlord/receipts"
    />
  );
}
