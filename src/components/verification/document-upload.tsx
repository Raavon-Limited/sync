/**
 * VerificationDocuments — every document Sync asks this kind of account for,
 * collected in one place, and none of them optional.
 *
 * WHY ALL OF THEM, AND WHY HERE
 *   The wizard used to ask for "your ID and any business documents" through a
 *   single drop zone, and called it "optional now — you can add them later".
 *   That was never true. `set_verification_status` refuses to verify an
 *   account with nothing approved, so a submission with no documents reached a
 *   reviewer as:
 *
 *     0 of 0 documents approved — nothing uploaded yet
 *
 *   with a Verify button that could not be pressed. The applicant believed
 *   they had applied; staff had an entry they could only reject. "Later" had
 *   no route back either — Settings offered uploads, but nothing re-submitted
 *   the account for review, so the files landed in a queue nobody was told
 *   about.
 *
 *   So the whole set is asked for here, once, while the person is already
 *   filling in a form and expecting to be asked.
 *
 * THE LIST IS `requirementsFor(role)`, NOT A LIST IN THIS FILE.
 *   Same source as the settings panel and the public ID card. A card that
 *   claims a check the wizard never collected is the failure this shares one
 *   list to avoid.
 *
 * THREE SHAPES, DRIVEN BY THE SPEC
 *   captureOnly   camera only, no file picker, no subtype (the live photo)
 *   options       pick WHICH document first, then upload it
 *   gov_id        the above, plus a back side — unless it is a passport,
 *                 which does not have one
 */
'use client';

import { useRef } from 'react';
import { Camera, FileUp, IdCard, RefreshCw, Trash2 } from 'lucide-react';
import {
  requirementsFor,
  type VerificationRequirementSpec,
  type VerificationRole,
} from '@/modules/verification/requirements';

/** What is held for ONE requirement. `back` is only ever used by `gov_id`. */
export interface RequirementFiles {
  subtype: string | null;
  front: File | null;
  back: File | null;
}

/** Keyed by requirement `key` ('selfie', 'gov_id', …). */
export type DocumentState = Record<string, RequirementFiles>;

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/tiff,application/pdf';
const FORMAT_CHIPS = ['PNG', 'JPEG', 'JPG', 'TIFF', 'PDF'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** A passport is one page. Asking for its back yields a blank photo or a stall. */
const SINGLE_SIDED = new Set(['passport']);

function needsBack(spec: VerificationRequirementSpec, subtype: string | null): boolean {
  return spec.key === 'gov_id' && !!subtype && !SINGLE_SIDED.has(subtype);
}

export function emptyDocumentState(role: VerificationRole): DocumentState {
  return Object.fromEntries(
    requirementsFor(role).map((r) => [r.key, { subtype: null, front: null, back: null }]),
  );
}

/**
 * What is still missing, in the order the person will fix it. Returns null when
 * the set is complete.
 *
 * ONE MESSAGE AT A TIME, deliberately: a list of four faults at the bottom of a
 * form is read as "this is broken", where one is read as "do this next".
 */
export function documentsProblem(role: VerificationRole, state: DocumentState): string | null {
  for (const spec of requirementsFor(role)) {
    const held = state[spec.key] ?? { subtype: null, front: null, back: null };

    for (const file of [held.front, held.back]) {
      if (file && file.size > MAX_DOCUMENT_BYTES) {
        return `"${file.name}" is over 10 MB. Try a smaller photo.`;
      }
    }

    if (spec.options && !held.subtype) {
      return `Choose which document you are providing for ${spec.label.toLowerCase()}.`;
    }
    if (!held.front) {
      return spec.captureOnly
        ? `Take your ${spec.label.toLowerCase()}.`
        : `Upload your ${spec.label.toLowerCase()}.`;
    }
    if (needsBack(spec, held.subtype) && !held.back) {
      return 'Upload the back of your government ID.';
    }
  }
  return null;
}

/** Every held file, described well enough for a reviewer to know what it is. */
export function queueForUpload(
  role: VerificationRole,
  state: DocumentState,
): { docType: string; subtype: string | null; title: string; file: File }[] {
  const out: { docType: string; subtype: string | null; title: string; file: File }[] = [];
  for (const spec of requirementsFor(role)) {
    const held = state[spec.key];
    if (!held) continue;
    const label = spec.options?.find((o) => o.value === held.subtype)?.label ?? spec.label;
    const twoSided = needsBack(spec, held.subtype);
    if (held.front) {
      out.push({
        docType: spec.key,
        subtype: held.subtype,
        title: twoSided ? `${label} (front)` : label,
        file: held.front,
      });
    }
    if (twoSided && held.back) {
      out.push({
        docType: spec.key,
        subtype: held.subtype,
        title: `${label} (back)`,
        file: held.back,
      });
    }
  }
  return out;
}

function Slot({
  label,
  file,
  capture,
  onPick,
  onClear,
}: {
  label: string;
  file: File | null;
  /** Camera only — no file picker. See the spec's `captureOnly` note. */
  capture?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
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
        accept={capture ? 'image/*' : ACCEPT}
        // `capture` makes a phone open the camera instead of the gallery. It
        // raises the bar rather than closing the door — see the requirements
        // spec — and desktop browsers ignore it entirely.
        {...(capture ? { capture: 'user' as const } : {})}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          // Reset so re-picking the SAME file still fires a change — otherwise
          // "Replace" with an identical filename does nothing.
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
          className="border-line/20 hover:border-line/40 bg-surface-deep/20 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors"
        >
          {capture ? (
            <Camera className="text-accent-fg size-5 shrink-0" aria-hidden="true" />
          ) : (
            <FileUp className="text-accent-fg size-5 shrink-0" aria-hidden="true" />
          )}
          <span className="text-content-muted flex-1 text-sm">
            {capture ? 'Open camera' : 'Click to upload'}
          </span>
          {!capture && (
            <span className="hidden shrink-0 flex-wrap items-center gap-1 sm:flex">
              {[...FORMAT_CHIPS, '< 10 MB'].map((f) => (
                <span
                  key={f}
                  className="border-line/10 bg-ink/20 text-content-muted rounded border px-1.5 py-0.5 text-[10px]"
                >
                  {f}
                </span>
              ))}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function Requirement({
  spec,
  held,
  onChange,
}: {
  spec: VerificationRequirementSpec;
  held: RequirementFiles;
  onChange: (next: RequirementFiles) => void;
}) {
  const chosen = spec.options?.find((o) => o.value === held.subtype);
  const twoSided = needsBack(spec, held.subtype);
  const done = !!held.front && (!twoSided || !!held.back);

  return (
    <section className="border-line/10 bg-surface-deep/20 flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-content flex items-center gap-2 text-sm font-semibold">
            {spec.label}
            <span className="text-coral text-xs font-normal">Required</span>
          </h3>
          <p className="text-content-muted mt-0.5 text-xs">{spec.description}</p>
        </div>
        {done && (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
            Added
          </span>
        )}
      </div>

      {/* Which document, before how to photograph it. Asking for "front and
          back" before knowing what of is how somebody uploads the back of a
          passport. */}
      {spec.options && !chosen ? (
        <div className="flex flex-col gap-2">
          {spec.key === 'gov_id' && (
            // Not a <select>: one option in a dropdown is a control that cannot
            // be operated. Every document we accept is a Nigerian instrument
            // and every campus a Nigerian university; this becomes a picker the
            // day a second country is actually verifiable.
            <div className="border-line/15 bg-surface-deep/40 text-content mb-1 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm">
              <span aria-hidden="true">🇳🇬</span>
              Nigeria
              <span className="text-content-muted ml-auto text-xs">
                The only country Sync verifies today
              </span>
            </div>
          )}
          <p className="text-content text-sm font-medium">Select document type</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {spec.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ ...held, subtype: o.value })}
                className="border-line/15 bg-panel hover:border-line/40 flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors"
              >
                <IdCard className="text-content-muted size-4" aria-hidden="true" />
                <span className="text-content text-sm font-medium">{o.label}</span>
                {o.hint && <span className="text-content-muted text-xs">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {chosen && (
            <div className="border-line/10 flex flex-wrap items-center gap-2 border-b pb-2 text-sm">
              {spec.key === 'gov_id' && <span aria-hidden="true">🇳🇬</span>}
              <span className="text-content">{chosen.label}</span>
              <button
                type="button"
                onClick={() => onChange({ subtype: null, front: null, back: null })}
                className="text-accent-fg ml-auto cursor-pointer text-sm font-medium hover:underline"
              >
                Change
              </button>
            </div>
          )}
          <Slot
            label={twoSided ? 'Front of your document' : spec.label}
            file={held.front}
            capture={spec.captureOnly}
            onPick={(f) => onChange({ ...held, front: f })}
            onClear={() => onChange({ ...held, front: null })}
          />
          {twoSided && (
            <Slot
              label="Back of your document"
              file={held.back}
              onPick={(f) => onChange({ ...held, back: f })}
              onClear={() => onChange({ ...held, back: null })}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function VerificationDocuments({
  role,
  value,
  onChange,
  error,
}: {
  role: VerificationRole;
  value: DocumentState;
  onChange: (next: DocumentState) => void;
  error?: string;
}) {
  const specs = requirementsFor(role);
  const complete = specs.filter((s) => {
    const held = value[s.key];
    return held?.front && (!needsBack(s, held.subtype) || held.back);
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-content text-base font-semibold">Verification documents</h3>
        <p className="text-content-muted text-sm">
          All {specs.length} are required — a reviewer cannot approve a business without them.
        </p>
        <p className="text-content-muted mt-1 text-xs">
          {complete} of {specs.length} added
        </p>
      </div>

      {specs.map((spec) => (
        <Requirement
          key={spec.key}
          spec={spec}
          held={value[spec.key] ?? { subtype: null, front: null, back: null }}
          onChange={(next) => onChange({ ...value, [spec.key]: next })}
        />
      ))}

      {error && <p className="text-coral text-sm">{error}</p>}
    </div>
  );
}
