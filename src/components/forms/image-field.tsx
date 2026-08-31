/**
 * Pick-and-upload an image, for anywhere a vendor attaches a photo.
 *
 * WHY IT UPLOADS ON PICK, NOT ON SAVE
 *   The file goes to Storage the moment it is chosen and the field hands back
 *   a URL. Two reasons: the vendor sees a real preview of what was actually
 *   stored rather than a local object URL that may not match, and a rejected
 *   file (wrong type, over 5MB) surfaces while they are still filling the form
 *   instead of after pressing Save, when it would mean re-entering everything.
 *
 *   The cost is an orphaned object if they abandon the form. That is a few KB
 *   of storage against a materially better failure mode.
 *
 * GENERALISED FROM ListingImageField, which is still its own component because
 * the listing modals lay it out differently. Anything new should use this one.
 */
'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadVendorImage } from '@/modules/vendor/hooks';
import { ACCEPTED_IMAGE_TYPES } from '@/modules/vendor/queries';

interface ImageFieldProps {
  /** Current image URL, or empty. */
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  /** Where it lands in the vendor's own storage folder. Cosmetic. */
  folder?: 'listings' | 'logos' | 'stores';
  /** `circle` for a logo or avatar, `square` for a photo of a thing. */
  shape?: 'circle' | 'square';
}

export function ImageField({
  value,
  onChange,
  label = 'Photo',
  hint,
  folder = 'listings',
  shape = 'square',
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadVendorImage(folder);

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    upload.mutate(file, {
      onSuccess: (url) => onChange(url),
      onError: (e) => setError(e instanceof Error ? e.message : 'Upload failed'),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-content-muted text-xs font-medium">{label}</span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className={cn(
            'border-line/40 hover:border-lime-deep relative flex size-20 shrink-0 items-center justify-center overflow-hidden border border-dashed transition-colors',
            shape === 'circle' ? 'rounded-full' : 'rounded-xl',
            error && 'border-coral',
          )}
          aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        >
          {upload.isPending ? (
            <Loader2 className="text-content-muted size-5 animate-spin" />
          ) : value ? (
            <Image src={value} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <ImagePlus className="text-content-muted size-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-content-muted text-xs">
            {upload.isPending
              ? 'Uploading…'
              : value
                ? 'Looks good. Tap the image to replace it.'
                : (hint ?? 'JPEG, PNG, WebP or AVIF. Up to 5MB.')}
          </p>

          {value && !upload.isPending && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setError(null);
              }}
              className="text-content-muted hover:text-content mt-1 inline-flex items-center gap-1 text-xs"
            >
              <X className="size-3" /> Remove
            </button>
          )}

          {error && <p className="text-coral mt-1 text-xs">{error}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Reset so picking the SAME file again still fires onChange.
          e.target.value = '';
        }}
      />
    </div>
  );
}
