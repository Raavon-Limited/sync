'use client';

import { DocumentsPanel } from '@/components/documents/documents-panel';
import { useLandlordDocuments } from '@/modules/documents/hooks';

export function LandlordReceiptsClient() {
  const { data = [], isLoading } = useLandlordDocuments();
  return (
    <DocumentsPanel
      documents={data}
      isLoading={isLoading}
      basePath="/landlord/receipts"
      emptyHint="When a student pays for one of your rooms, the receipt appears here - before the money reaches your wallet."
    />
  );
}
