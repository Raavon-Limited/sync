/**
 * Verification documents — what the vendor has uploaded and where each stands.
 *
 * REQUIRED TYPES ARE CONFIG; UPLOADS ARE DATA
 *   `verification_documents` holds what has been uploaded. It cannot say what
 *   SHOULD be uploaded — that is a product decision, so the required set lives
 *   here as a constant and each row is matched to it by `doc_type`. A required
 *   type with no row is 'not_uploaded', which is exactly what the status enum
 *   already allows for.
 *
 * THE TIMELINE IS DERIVED, NOT SCRIPTED
 *   The mock listed events like "Bank Verification Pending — 28 May 2026" that
 *   nothing produced. Real progress is just the required documents and their
 *   statuses, so the timeline is computed from them. An invented date on a
 *   verification screen is the kind of thing someone plans around.
 *
 * UPLOADS GO TO A PRIVATE BUCKET
 *   `verification-docs` is private, owner-and-staff only, pathed by user id.
 *   These are ID documents; nothing here produces a public URL.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Clock, FileText, Upload, Loader2, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useMyDocuments, useUploadDocument } from '@/modules/verification/hooks';
import { useSession } from '@/providers/session-provider';
import type { DocStatus, DocumentItem } from '@/modules/vendor/types';
import { VERIFICATION_REQUIREMENTS } from '@/modules/verification/requirements';

/**
 * What Sync asks every vendor for.
 *
 * Product config, not database state — and now shared with the public card
 * page, which lists the same checks to whoever scans a vendor's ID. Two copies
 * of this list would drift, and the drift would show up as a card claiming a
 * check the vendor was never asked to pass.
 */
const REQUIRED_DOCS = VERIFICATION_REQUIREMENTS.map((r) => ({
  docType: r.key,
  title: r.label,
  description: r.description,
  colour: r.colour,
}));

const STATUS_META: Record<DocStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  under_review: { label: 'Under review', cls: 'bg-amber-500/10 text-amber-600', icon: Clock },
  needs_action: { label: 'Needs action', cls: 'bg-rose-500/10 text-rose-600', icon: AlertCircle },
  not_uploaded: { label: 'Not uploaded', cls: 'bg-ink/5 text-content-muted', icon: Circle },
};

export function DocumentsPanel() {
  const { userId } = useSession();
  const { data: docs = [], isLoading } = useMyDocuments();
  const upload = useUploadDocument();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const items = useMemo<DocumentItem[]>(
    () =>
      REQUIRED_DOCS.map((req) => {
        const found = docs.find((d) => d.docType === req.docType);
        return {
          id: req.docType,
          title: req.title,
          description: req.description,
          status: (found?.status ?? 'not_uploaded') as DocStatus,
          uploadedAt: found?.uploadedAt
            ? new Date(found.uploadedAt).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : undefined,
          actionMessage: found?.actionMessage ?? undefined,
        };
      }),
    [docs],
  );

  const approved = items.filter((i) => i.status === 'approved').length;

  async function handleFile(docType: string, title: string, file: File) {
    if (!userId) return;
    setBusy(docType);
    setError(null);
    try {
      // Pathed by user id — the bucket policy scopes reads to the owner and staff.
      const path = `${userId}/${docType}-${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: upErr } = await createClient()
        .storage.from('verification-docs')
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      // The hook fills ownerId from the session; passing it here would be
      // a second source of truth for who is uploading.
      await upload.mutateAsync({ docType, title, storagePath: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-content-muted text-sm">
        {approved} of {REQUIRED_DOCS.length} approved.
        {approved < REQUIRED_DOCS.length && ' Verification completes when all three are.'}
      </p>

      {error && <p className="text-coral text-sm">{error}</p>}

      <div className="flex flex-col gap-3">
        {items.map((item, i) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          const req = REQUIRED_DOCS[i];
          return (
            <Card key={item.id} className="border-line/10 border">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span
                  className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', req.colour)}
                >
                  <FileText className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-content flex items-center gap-2 text-sm font-medium">
                    {item.title}
                    <Badge className={cn('gap-1', meta.cls)}>
                      <Icon className="size-3" />
                      {meta.label}
                    </Badge>
                  </p>
                  <p className="text-content-muted text-xs">{item.description}</p>
                  {item.uploadedAt && (
                    <p className="text-content-muted text-xs">Uploaded {item.uploadedAt}</p>
                  )}
                  {/* Only a reviewer sets this, and it is the one thing the
                      vendor must act on. */}
                  {item.actionMessage && (
                    <p className="text-coral mt-1 text-xs">{item.actionMessage}</p>
                  )}
                </div>

                <input
                  ref={(el) => {
                    inputs.current[item.id] = el;
                  }}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) void handleFile(item.id, item.title, f);
                    ev.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  className="gap-1"
                  disabled={busy === item.id || item.status === 'approved'}
                  onClick={() => inputs.current[item.id]?.click()}
                >
                  {busy === item.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {item.status === 'not_uploaded' ? 'Upload' : 'Replace'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Derived from the documents above — no scripted dates. */}
      <div className="border-line/10 flex flex-col gap-2 rounded-xl border p-4">
        <p className="text-content-muted font-mono text-xs tracking-wide">PROGRESS</p>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {item.status === 'approved' ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : item.status === 'under_review' ? (
              <Clock className="size-4 text-amber-600" />
            ) : (
              <Circle className="text-content-muted size-4" />
            )}
            <span
              className={item.status === 'approved' ? 'text-content-muted' : 'text-content'}
            >
              {item.title} — {STATUS_META[item.status].label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
