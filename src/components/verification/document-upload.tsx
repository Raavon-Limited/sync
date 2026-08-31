/**
 * IdentityDocumentUpload — pick which government ID, then upload both sides.
 *
 * REPLACES A SINGLE "Tap to add documents" DROP ZONE, and the difference is
 * not decoration. That control asked for "your ID and any business documents"
 * in one heap: it never learned WHICH document arrived, so every row landed as
 * `doc_type: 'gov_id'` with no subtype, and a reviewer opening the queue could
 * not tell a NIN slip from a passport without opening the file. It also had no
 * concept of a back side, so half of every driver's licence was missing and
 * nobody found out until review.
 *
 * TWO PHASES, BECAUSE THE SECOND DEPENDS ON THE FIRST
 *   choose   which document, and the country that issued it
 *   prepare  front and back of THAT document, named in the copy
 *
 *   Asking for "front and back" before knowing what of is how someone uploads
 *   the back of a passport, which does not exist.
 *
 * THE LIST IS NOT INVENTED HERE. The options come from `requirementSpec('gov_id')`
 * in modules/verification/requirements — the same list the settings panel and
 * the public ID card read, and the same `value` strings that go into
 * `verification_documents.doc_subtype`. A second hardcoded list here is how the
 * card ends up naming a document the reviewer never saw.
 *
 * NIGERIA IS THE ONLY COUNTRY, AND THE PICKER SAYS SO RATHER THAN PRETENDING.
 * Every document we accept is a Nigerian instrument — NIN, CAC, NEPA — and
 * every campus is a Nigerian university. A picker listing countries we cannot
 * actually verify would collect an answer nothing acts on.
 */
'use client';

import { useRef } from 'react';
import { FileUp, IdCard, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requirementSpec } from '@/modules/verification/requirements';

/** What the wizard holds for the identity document. */
export interface IdentityDocument {
  /** A `doc_subtype` value, e.g. 'nin'. Null until chosen. */
  subtype: string | null;
  front: File | null;
  back: File | null;
}

export const EMPTY_IDENTITY_DOCUMENT: IdentityDocument = {
  subtype: null,
  front: null,
  back: null,
};

/** Formats the reviewer can actually open, and the cap the bucket enforces. */
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/tiff,application/pdf';
const FORMAT_CHIPS = ['PNG', 'JPEG', 'JPG', 'TIFF', 'PDF'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * A passport is one page. Asking for its back produces either a blank photo or
 * an abandoned step, so the second slot is per-document rather than assumed.
 */
const SINGLE_SIDED = new Set(['passport']);

function UploadSlot({
  label,
  file,
  onPick,
  onClear,
  error,
}: {
  label: string;
  file: File | null;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-content text-sm font-medium">
        <span className="text-coral" aria-hidden="true">
          *{' '}
        </span>
        {label}
      </p>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          // Cleared so re-picking the SAME file still fires a change event —
          // otherwise "Replace" with the identical filename does nothing.
          e.target.value = '';
        }}
      />

      {file ? (
        <div className="border-line/15 bg-surface-deep/40 flex items-center gap-3 rounded-xl border px-3 py-3">
          <span className="text-content min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="text-content-muted hover:text-content inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-coral inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
            error
              ? 'border-coral/50 bg-coral/5'
              : 'border-line/20 hover:border-line/40 bg-surface-deep/20',
          )}
        >
          <FileUp className="text-accent-fg size-5 shrink-0" aria-hidden="true" />
          <span className="text-content-muted flex-1 text-sm">Click to upload</span>
          {/* The accepted formats, stated where the decision is made rather
              than in a paragraph above it that nobody reads twice. */}
          <span className="hidden shrink-0 flex-wrap items-center gap-1 sm:flex">
            {FORMAT_CHIPS.map((f) => (
              <span
                key={f}
                className="border-line/10 bg-ink/20 text-content-muted rounded border px-1.5 py-0.5 text-[10px]"
              >
                {f}
              </span>
            ))}
            <span className="border-line/10 bg-ink/20 text-content-muted rounded border px-1.5 py-0.5 text-[10px]">
              &lt; 10 MB
            </span>
          </span>
        </button>
      )}

      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}

export function IdentityDocumentUpload({
  value,
  onChange,
  error,
}: {
  value: IdentityDocument;
  onChange: (next: IdentityDocument) => void;
  /** Set when the step was submitted incomplete. */
  error?: string;
}) {
  const options = requirementSpec('gov_id')?.options ?? [];
  const chosen = options.find((o) => o.value === value.subtype);
  const needsBack = value.subtype ? !SINGLE_SIDED.has(value.subtype) : true;

  function pick(side: 'front' | 'back', file: File | null) {
    onChange({ ...value, [side]: file });
  }

  // ── Phase 1: which document ───────────────────────────────────────────────
  if (!chosen) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-content text-base font-semibold">
            Choose your verification document
          </h3>
          <p className="text-content-muted text-sm">You must carry an official government ID</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-content text-sm font-medium">
            <span className="text-coral" aria-hidden="true">
              *{' '}
            </span>
            Country
          </p>
          {/* Not a <select>. One option in a dropdown is a control that cannot
              be operated; this states the fact instead. It becomes a picker on
              the day a second country is actually verifiable. */}
          <div className="border-line/15 bg-surface-deep/40 text-content flex items-center gap-2 rounded-xl border px-3 py-3 text-sm">
            <span aria-hidden="true">🇳🇬</span>
            Nigeria
            <span className="text-content-muted ml-auto text-xs">
              The only country Sync verifies today
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-content text-sm font-medium">Select document type</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ ...value, subtype: o.value })}
                className={cn(
                  'border-line/15 bg-surface-deep/30 hover:border-line/40 flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
                )}
              >
                <IdCard className="text-content-muted size-5" aria-hidden="true" />
                <span className="text-content text-sm font-medium">{o.label}</span>
                {o.hint && <span className="text-content-muted text-xs">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-coral text-xs">{error}</p>}
      </div>
    );
  }

  // ── Phase 2: that document, both sides ────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-content text-base font-semibold">Prepare your document</h3>
        <p className="text-content-muted text-sm">
          {needsBack
            ? 'You will need to scan or upload both sides of your ID. Make sure the image is clear and not cut off.'
            : 'Scan or upload the photo page. Make sure the image is clear and not cut off.'}
        </p>
      </div>

      <div className="border-line/10 flex flex-wrap items-center gap-2 border-b pb-3 text-sm">
        <span className="text-content-muted">Country:</span>
        <span aria-hidden="true">🇳🇬</span>
        <span className="text-content">Nigeria</span>
        <span className="text-content-muted mx-1">·</span>
        <span className="text-content">{chosen.label}</span>
        {/* Back to phase 1. The country cannot change, but the document can,
            and this is where somebody realises they picked the wrong one. */}
        <button
          type="button"
          onClick={() => onChange({ subtype: null, front: null, back: null })}
          className="text-accent-fg ml-auto cursor-pointer text-sm font-medium hover:underline"
        >
          Change
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-content text-sm font-medium">Upload document</p>
        <UploadSlot
          label={needsBack ? 'Front of your document' : 'Photo page'}
          file={value.front}
          onPick={(f) => pick('front', f)}
          onClear={() => pick('front', null)}
        />
        {needsBack && (
          <UploadSlot
            label="Back of your document"
            file={value.back}
            onPick={(f) => pick('back', f)}
            onClear={() => pick('back', null)}
          />
        )}
      </div>

      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}
