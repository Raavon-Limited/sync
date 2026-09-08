'use client';

import { DocumentsPanel } from '@/components/documents/documents-panel';
import { useMyDocuments } from '@/modules/documents/hooks';

export function ReceiptsClient() {
  const { data = [], isLoading } = useMyDocuments();
  return (
    <DocumentsPanel
      documents={data}
      isLoading={isLoading}
      basePath="/user/receipts"
      emptyHint="Pay for a room, a viewing, an order or a ticket and the paperwork shows up here."
    />
  );
}
