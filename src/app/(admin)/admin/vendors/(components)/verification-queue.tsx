/**
 * Vendor verification queue.
 *
 * Replaces a mock built around NIN checks, liveness selfies, business photos
 * and store inspections — none of which the schema models. This shows what does
 * exist: each vendor, their uploaded documents, and the two decisions staff
 * actually make.
 */
'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Clock, AlertCircle, Circle, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { reviewDocument, setVendorVerification, getDocumentUrl } from '@/modules/admin/actions';

export interface AdminDoc {
  id: string;
  docType: string;
  title: string;
  status: string;
  storagePath: string;
  actionMessage: string | null;
  uploadedAt: string;
}

export interface AdminVendor {
  id: string;
  businessName: string;
  slug: string;
  category: string;
  area: string | null;
  verificationStatus: string;
  createdAt: string;
  docs: AdminDoc[];
}

const VENDOR_BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600',
  pending: 'bg-amber-500/10 text-amber-600',
  rejected: 'bg-rose-500/10 text-rose-600',
  unverified: 'bg-ink/5 text-content-muted',
};

const DOC_ICON: Record<string, typeof CheckCircle2> = {
  approved: CheckCircle2,
  under_review: Clock,
  needs_action: AlertCircle,
  not_uploaded: Circle,
};

const FILTERS = ['all', 'unverified', 'pending', 'verified', 'rejected'];

export function VerificationQueue({ vendors }: { vendors: AdminVendor[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const visible = vendors.filter((v) => {
    if (filter !== 'all' && v.verificationStatus !== filter) return false;
    if (search && !v.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      }
    });
  }

  async function openDoc(path: string) {
    try {
      const url = await getDocumentUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the document');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors..."
          className="max-w-xs"
        />
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              filter === f
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            {f}
          </button>
        ))}
        {pending && <Loader2 className="text-content-muted size-4 animate-spin" />}
      </div>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          No vendors match.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((v) => {
          const approved = v.docs.filter((d) => d.status === 'approved').length;
          return (
            <div key={v.id} className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-content flex items-center gap-2 font-medium">
                    {v.businessName}
                    <Badge className={VENDOR_BADGE[v.verificationStatus] ?? VENDOR_BADGE.unverified}>
                      {v.verificationStatus}
                    </Badge>
                  </p>
                  <p className="text-content-muted text-xs">
                    {v.category} · {v.area ?? 'No area'} · joined{' '}
                    {new Date(v.createdAt).toLocaleDateString('en-NG', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-content-muted text-xs">
                    {approved} of {v.docs.length} document{v.docs.length === 1 ? '' : 's'} approved
                    {v.docs.length === 0 && ' - nothing uploaded yet'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={pending || v.verificationStatus === 'verified'}
                    onClick={() => run(() => setVendorVerification({ vendorId: v.id, decision: 'verified' }))}
                  >
                    Verify
                  </Button>
                  <Button
                    variant="outline"
                    className="text-coral"
                    disabled={pending || v.verificationStatus === 'rejected'}
                    onClick={() => run(() => setVendorVerification({ vendorId: v.id, decision: 'rejected' }))}
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {v.docs.length > 0 && (
                <div className="divide-line/5 border-line/10 divide-y rounded-lg border">
                  {v.docs.map((d) => {
                    const Icon = DOC_ICON[d.status] ?? Circle;
                    return (
                      <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <Icon className="text-content-muted size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-content truncate text-sm">{d.title}</p>
                          <p className="text-content-muted text-xs">
                            {d.status.replace('_', ' ')} · uploaded{' '}
                            {new Date(d.uploadedAt).toLocaleDateString('en-NG')}
                          </p>
                          {d.actionMessage && (
                            <p className="text-coral text-xs">{d.actionMessage}</p>
                          )}
                        </div>

                        <Button variant="outline" className="gap-1" onClick={() => openDoc(d.storagePath)}>
                          <FileText className="size-3.5" />
                          <ExternalLink className="size-3" />
                        </Button>

                        <Button
                          variant="outline"
                          disabled={pending || d.status === 'approved'}
                          onClick={() => run(() => reviewDocument({ documentId: d.id, decision: 'approved' }))}
                        >
                          Approve
                        </Button>

                        {/* Bouncing requires a reason: "needs action" with no
                            stated action is how a queue stalls. */}
                        <Input
                          value={messages[d.id] ?? ''}
                          onChange={(e) => setMessages((m) => ({ ...m, [d.id]: e.target.value }))}
                          placeholder="What needs fixing?"
                          className="max-w-48"
                        />
                        <Button
                          variant="outline"
                          className="text-coral"
                          disabled={pending || !messages[d.id]?.trim()}
                          onClick={() =>
                            run(() =>
                              reviewDocument({
                                documentId: d.id,
                                decision: 'needs_action',
                                message: messages[d.id],
                              }),
                            )
                          }
                        >
                          Bounce
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
