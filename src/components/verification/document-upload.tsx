/**
 * VerificationDocuments   every document Sync asks this kind of account for,
 * collected in one place, and none of them optional.
 *
 * WHY ALL OF THEM, AND WHY HERE
 *   The wizard used to ask for "your ID and any business documents" through a
 *   single drop zone, and called it "optional now   you can add them later".
 *   That was never true. `set_verification_status` refuses to verify an
 *   account with nothing approved, so a submission with no documents reached a
 *   reviewer as:
 *
 *     0 of 0 documents approved   nothing uploaded yet
 *
 *   with a Verify button that could not be pressed. The applicant believed
 *   they had applied; staff had an entry they could only reject. "Later" had
 *   no route back either   Settings offered uploads, but nothing re-submitted
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
 *   gov_id        the above, plus a back side   unless it is a passport,
 *                 which does not have one
 */
'use client';

import { useRef, useState } from 'react';
import { Camera, FileUp, IdCard, RefreshCw, Trash2 } from 'lucide-react';
import { CameraCapture } from '@/components/verification/camera-capture';
import {
  isOptionalFor,
  requirementsFor,
  requiredFor,
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

/**
 * Whether a document HAS a back, and whether we can insist on it.
 *
 * NOT EVERY NIGERIAN ID IS TWO PIECES OF PLASTIC, and treating them as if they
 * were is how a real applicant gets stuck on a step they cannot complete:
 *
 *   passport  ONE page. There is no back. Asking for it yields a blank photo
 *             or an abandoned form.
 *   nin       Issued BOTH ways. The NIN slip is a single-sided paper printout
 *               the overwhelming majority of what people actually hold   while
 *             the plastic NIN card has a back. So the slot is offered and
 *             never required: demanding a back from a slip holder is demanding
 *             a photograph of something that does not exist.
 *   otherwise A driver's licence and a voter's card both carry details on the
 *             reverse, and a reviewer needs them.
 */
type BackPolicy = 'none' | 'optional' | 'required';

const BACK_POLICY: Record<string, BackPolicy> = {
  passport: 'none',
  nin: 'optional',
};

function backPolicy(spec: VerificationRequirementSpec, subtype: string | null): BackPolicy {
  if (spec.key !== 'gov_id' || !subtype) return 'none';
  return BACK_POLICY[subtype] ?? 'required';
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
    const optional = isOptionalFor(spec, role);

    // Size is checked whatever the document is - an oversized file fails the
    // upload either way, and finding that out at the end is worse.
    for (const file of [held.front, held.back]) {
      if (file && file.size > MAX_DOCUMENT_BYTES) {
        return `"${file.name}" is over 10 MB. Try a smaller photo.`;
      }
    }

    // An optional document nobody touched is finished. One they DID start is
    // held to the same rules as any other, because a half-supplied document is
    // worse than none: a reviewer opens a folder with a front and no back.
    if (optional && !held.front && !held.back && !held.subtype) continue;

    if (spec.options && !held.subtype) {
      return `Choose which document you are providing for ${spec.label.toLowerCase()}.`;
    }
    if (!held.front) {
      return spec.captureOnly
        ? `Take your ${spec.label.toLowerCase()}.`
        : `Upload your ${spec.label.toLowerCase()}.`;
    }
    if (backPolicy(spec, held.subtype) === 'required' && !held.back) {
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
    // Sides are named only when there are two of them. A lone NIN slip filed
    // as "NIN slip or card (front)" reads to a reviewer as though a back was
    // expected and is missing.
    if (held.front) {
      out.push({
        docType: spec.key,
        subtype: held.subtype,
        title: held.back ? `${label} (front)` : label,
        file: held.front,
      });
    }
    if (held.back) {
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
  optional,
  onPick,
  onClear,
}: {
  label: string;
  file: File | null;
  /** Camera only   no file picker. See the spec's `captureOnly` note. */
  capture?: boolean;
  /** Offered but not insisted on   see BACK_POLICY. */
  optional?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // THE CAMERA, FOR THE SLOTS THAT DEMAND ONE.
  //
  // `capture="user"` on the input below only ever asked a PHONE to open its
  // camera; every desktop browser ignores it and opens the file picker, so the
  // live photo   the one document whose entire purpose is proving a person is
  // present   was being satisfied by whatever was in somebody's downloads
  // folder. <CameraCapture> is a real getUserMedia stream.
  const [camera, setCamera] = useState(false);
  // Set when the device has no usable camera or permission was refused. Falling
  // back to the picker is deliberate: a laptop with no webcam must not be a
  // dead end in an application form.
  const [cameraFailed, setCameraFailed] = useState<string | null>(null);
  const useCamera = capture && !cameraFailed;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-content text-sm font-medium">
        {optional ? (
          <span className="text-content-muted font-normal">(optional) </span>
        ) : (
          <span className="text-coral" aria-hidden="true">
            *{' '}
          </span>
        )}
        {label}
      </p>

      <input
        ref={input}
        type="file"
        accept={capture ? 'image/*' : ACCEPT}
        // `capture` makes a phone open the camera instead of the gallery. It
        // raises the bar rather than closing the door   see the requirements
        // spec   and desktop browsers ignore it entirely.
        {...(capture ? { capture: 'user' as const } : {})}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          // Reset so re-picking the SAME file still fires a change   otherwise
          // "Replace" with an identical filename does nothing.
          e.target.value = '';
        }}
      />

      {camera && (
        <CameraCapture
          onCapture={onPick}
          onClose={() => setCamera(false)}
          onUnavailable={(reason) => {
            setCameraFailed(reason);
            setCamera(false);
          }}
        />
      )}

      {cameraFailed && !file && <p className="text-content-muted text-xs">{cameraFailed}</p>}

      {file ? (
        <div className="border-line/15 bg-surface-deep/40 flex items-center gap-3 rounded-xl border px-3 py-3">
          <span className="text-content min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <button
            type="button"
            onClick={() => (useCamera ? setCamera(true) : input.current?.click())}
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
          onClick={() => (useCamera ? setCamera(true) : input.current?.click())}
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
  optional = false,
}: {
  spec: VerificationRequirementSpec;
  held: RequirementFiles;
  onChange: (next: RequirementFiles) => void;
  /** Asked for, but it cannot block a submission. See optionalFor. */
  optional?: boolean;
}) {
  const chosen = spec.options?.find((o) => o.value === held.subtype);
  const policy = backPolicy(spec, held.subtype);
  const done = !!held.front && (policy !== 'required' || !!held.back);

  return (
    <section className="border-line/10 bg-surface-deep/20 flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-content flex items-center gap-2 text-sm font-semibold">
            {spec.label}
            {optional ? (
              <span className="text-content-muted text-xs font-normal">Optional</span>
            ) : (
              <span className="text-coral text-xs font-normal">Required</span>
            )}
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
            label={policy === 'none' ? spec.label : 'Front of your document'}
            file={held.front}
            capture={spec.captureOnly}
            onPick={(f) => onChange({ ...held, front: f })}
            onClear={() => onChange({ ...held, front: null })}
          />
          {policy !== 'none' && (
            <>
              <Slot
                label="Back of your document"
                file={held.back}
                optional={policy === 'optional'}
                onPick={(f) => onChange({ ...held, back: f })}
                onClear={() => onChange({ ...held, back: null })}
              />
              {policy === 'optional' && (
                <p className="text-content-muted -mt-1 text-xs">
                  Only if you have the plastic NIN card. A NIN slip is printed on one side skip this
                  if that is what you have.
                </p>
              )}
            </>
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
  // Counted against what is REQUIRED, not against everything shown. An
  // organiser who will never have a CAC certificate should not be looking at
  // "2 of 3" forever, as though something were still missing.
  const required = requiredFor(role);
  const isDone = (spec: VerificationRequirementSpec) => {
    const held = value[spec.key];
    return (
      Boolean(held?.front) &&
      (backPolicy(spec, held?.subtype ?? null) !== 'required' || Boolean(held?.back))
    );
  };
  const complete = required.filter(isDone).length;
  const extras = specs.length - required.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-content text-base font-semibold">Verification documents</h3>
        <p className="text-content-muted text-sm">
          {/* It used to say "a reviewer cannot approve a business without
              them", to students and riders as well. Nobody being verified here
              is necessarily a business. */}
          {required.length} required
          {extras > 0 && `, ${extras} optional`} &mdash; a reviewer cannot decide without the
          required ones.
        </p>
        <p className="text-content-muted mt-1 text-xs">
          {complete} of {required.length} added
        </p>
      </div>

      {specs.map((spec) => (
        <Requirement
          key={spec.key}
          spec={spec}
          optional={isOptionalFor(spec, role)}
          held={value[spec.key] ?? { subtype: null, front: null, back: null }}
          onChange={(next) => onChange({ ...value, [spec.key]: next })}
        />
      ))}

      {error && <p className="text-coral text-sm">{error}</p>}
    </div>
  );
}
