/**
 * Evidence for a VERIFICATION VISIT: photos, an optional walkthrough video, and
 * a photo of the agent at the property.
 *
 * NOT FOR STUDENT INSPECTIONS, and the distinction is the point.
 *   A verification visit is the agent going ALONE to check a listing is real.
 *   Nobody else was there, so photographs are the only thing that can tell a
 *   reviewer what was in the building, and one picture of the agent standing at
 *   it is the only thing that says they went.
 *
 *   A student inspection is the agent and the student walking through the house
 *   TOGETHER. The student is the witness and confirms it themselves, so asking
 *   the agent to photograph a room the student just stood in is friction with
 *   nothing on the other side of it. That form collects an outcome instead   see
 *   20260909210000.
 *
 * WHY THE SELFIE IS ITS OWN FIELD
 *   Photographs of a building prove the building exists. They do not prove the
 *   person who sent them was ever there   a listing's own photos, forwarded,
 *   are indistinguishable from a visit. It has its own slot and its own column
 *   so a reviewer can ask "is there one?" without opening every image.
 *
 * `capture` IS A HINT, NOT A GUARANTEE
 *   On a phone, `capture="environment"` opens the back lens and `capture="user"`
 *   the front. On a desktop browser it is ignored and the user gets a file
 *   picker   which is the correct degradation, and the reason both a "take" and
 *   a "choose" control exist for the same field: an agent on a laptop must not
 *   meet a button that does nothing.
 *
 *   It also cannot be trusted as proof. A file picker can hand back anything, so
 *   `capture` is a convenience for the honest majority and never a control.
 *
 * UPLOADS HAPPEN ON SELECTION, NOT ON SUBMIT. Uploading at submit time would
 * mean a spinner of unknown length after the agent thinks they are done, on
 * campus wifi, with a form they can still navigate away from.
 */
'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, ImagePlus, Loader2, Trash2, Video } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';
import {
  uploadListingMedia,
  rejectReason,
  LISTING_IMAGE_TYPES,
  LISTING_VIDEO_TYPES,
} from '@/modules/hostels/media';

export interface Evidence {
  photos: string[];
  videoUrl: string | null;
  selfieUrl: string | null;
}

export const EMPTY_EVIDENCE: Evidence = { photos: [], videoUrl: null, selfieUrl: null };

export function EvidenceFields({
  value,
  onChange,
  onBusyChange,
}: {
  value: Evidence;
  onChange: (next: Evidence) => void;
  /** Lets the parent disable submit while anything is still in flight. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { userId } = useSession();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const selfieInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function bump(delta: number) {
    setUploading((n) => {
      const next = n + delta;
      onBusyChange?.(next > 0);
      return next;
    });
  }

  async function upload(files: FileList, slot: 'photos' | 'selfie' | 'video') {
    if (!userId) {
      setError('Sign in again — we could not tell who you are.');
      return;
    }
    setError(null);
    const db = createClient();

    for (const file of Array.from(files)) {
      // The bucket enforces this too. Catching it here saves an agent a minute
      // of upload on a phone connection for a file that was never going to be
      // accepted, and gives them a message they can act on.
      const reason = rejectReason(file);
      if (reason) {
        setError(reason);
        continue;
      }

      bump(1);
      try {
        const media = await uploadListingMedia(db, { userId, file });
        if (slot === 'photos') {
          onChange({ ...value, photos: [...value.photos, media.url] });
        } else if (slot === 'selfie') {
          onChange({ ...value, selfieUrl: media.url });
        } else {
          onChange({ ...value, videoUrl: media.url });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That upload failed. Try again.');
      } finally {
        bump(-1);
      }
    }
  }

  const accept = LISTING_IMAGE_TYPES.join(',');
  const videoAccept = LISTING_VIDEO_TYPES.join(',');

  return (
    <div className="flex flex-col gap-4">
      {/* ── The property ── */}
      <div className="flex flex-col gap-2">
        <p className="text-content text-sm font-medium">
          Photos of the place <span className="text-coral">*</span>
        </p>

        <div className="grid grid-cols-2 gap-2">
          <ActionTile
            icon={Camera}
            label="Take a photo"
            onClick={() => cameraInput.current?.click()}
          />
          <ActionTile
            icon={ImagePlus}
            label="Choose files"
            onClick={() => photoInput.current?.click()}
          />
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept={accept}
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files, 'photos');
            e.target.value = '';
          }}
        />
        <input
          ref={photoInput}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files, 'photos');
            e.target.value = '';
          }}
        />

        {value.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.photos.map((src, i) => (
              <Thumb
                key={src}
                src={src}
                alt={`Photo ${i + 1}`}
                onRemove={() =>
                  onChange({ ...value, photos: value.photos.filter((p) => p !== src) })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ── The agent ── */}
      <div className="flex flex-col gap-2">
        <p className="text-content text-sm font-medium">You, at the property</p>
        <p className="text-content-muted text-xs">
          One photo of you there. Photos of a building only prove the building exists.
        </p>

        {value.selfieUrl ? (
          <div className="flex items-center gap-3">
            <Thumb
              src={value.selfieUrl}
              alt="You at the property"
              onRemove={() => onChange({ ...value, selfieUrl: null })}
            />
            <span className="text-content-muted text-xs">Attached</span>
          </div>
        ) : (
          <ActionTile
            icon={Camera}
            label="Take it now"
            onClick={() => selfieInput.current?.click()}
          />
        )}

        <input
          ref={selfieInput}
          type="file"
          accept={accept}
          capture="user"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files, 'selfie');
            e.target.value = '';
          }}
        />
      </div>

      {/* ── The walkthrough ── */}
      <div className="flex flex-col gap-2">
        <p className="text-content text-sm font-medium">Walkthrough video</p>
        <p className="text-content-muted text-xs">
          Optional, up to 40MB. A continuous pan is much harder to fake than stills.
        </p>

        {value.videoUrl ? (
          <div className="flex flex-col gap-2">
            <video
              src={value.videoUrl}
              controls
              playsInline
              preload="metadata"
              className="border-line/10 max-h-48 w-full rounded-lg border bg-black"
            />
            <button
              type="button"
              onClick={() => onChange({ ...value, videoUrl: null })}
              className="text-coral self-start text-xs underline underline-offset-2"
            >
              Remove video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <ActionTile
              icon={Video}
              label="Record"
              onClick={() => {
                if (videoInput.current) {
                  videoInput.current.setAttribute('capture', 'environment');
                  videoInput.current.click();
                }
              }}
            />
            <ActionTile
              icon={ImagePlus}
              label="Choose a file"
              onClick={() => {
                if (videoInput.current) {
                  videoInput.current.removeAttribute('capture');
                  videoInput.current.click();
                }
              }}
            />
          </div>
        )}

        <input
          ref={videoInput}
          type="file"
          accept={videoAccept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files, 'video');
            e.target.value = '';
          }}
        />
      </div>

      {uploading > 0 && (
        <p className="text-content-muted flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Uploading {uploading} file{uploading === 1 ? '' : 's'}…
        </p>
      )}
      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line/15 text-content hover:bg-surface-deep flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-xs transition-colors"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function Thumb({ src, alt, onRemove }: { src: string; alt: string; onRemove: () => void }) {
  return (
    <div className="border-line/10 relative size-16 overflow-hidden rounded-lg border">
      <Image src={src} alt={alt} fill sizes="64px" className="object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${alt}`}
        className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-1 text-white"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
