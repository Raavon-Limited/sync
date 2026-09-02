/**
 * DocumentViewer   a document opened in place, not in another tab.
 *
 * WHY A MODAL AND NOT `window.open`
 *   Reviewing is a COMPARISON: is the face in the live photo the face on the
 *   NIN slip, and is the name on the CAC certificate the name on the bank
 *   statement. Opening each file in its own tab breaks exactly that   the
 *   reviewer loses the page holding the other three, has to come back, and is
 *   comparing from memory. Every decision on that screen gets worse.
 *
 *   It also broke the signed URL's whole point: a tab left open holds a live
 *   link to somebody's passport for as long as it stays open.
 *
 * ARROWS, BECAUSE COMPARING IS FLIPPING BACK AND FORTH. The viewer holds the
 * whole folder, not one file, so the reviewer can step between the ID and the
 * selfie without closing anything. Left/Right keys do the same thing.
 *
 * PDFS ARE FRAMED, NOT DOWNLOADED. A bank statement is usually a PDF; an
 * <iframe> renders it with the browser's own viewer inside the modal. There is
 * still an "Open in a new tab" escape for anything the browser cannot draw.
 */
/* eslint-disable @next/next/no-img-element -- see the note in
   verification-review: these are signed, expiring urls on a private bucket and
   must not be proxied or cached by next/image. */
'use client';

import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogTitle } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ViewerDoc {
  id: string;
  title: string;
  status: string;
  storagePath: string;
  /** Signed link, or undefined when the object could not be signed. */
  url?: string;
}

/** Images preview; everything else is framed or offered as a link. */
export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif|tiff?|heic)$/i.test(path);
}

export function DocumentViewer({
  docs,
  index,
  onIndexChange,
  onClose,
}: {
  docs: ViewerDoc[];
  /** null = closed. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const doc = open ? docs[index] : undefined;

  const step = useCallback(
    (delta: number) => {
      if (index === null || docs.length === 0) return;
      // Wraps, so the last document is one press from the first   reviewers
      // cycle a short folder rather than walking it once.
      onIndexChange((index + delta + docs.length) % docs.length);
    },
    [index, docs.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-ink/80 data-[state=open]:animate-in fixed inset-0 z-50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="bg-panel fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl md:inset-8">
          <div className="border-line/10 flex shrink-0 items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-content truncate text-sm font-medium">
                {doc.title}
              </DialogTitle>
              <p className="text-content-muted text-xs">
                {doc.status.replace('_', ' ')}
                {docs.length > 1 && ` · ${(index ?? 0) + 1} of ${docs.length}`}
              </p>
            </div>

            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-content-muted hover:text-content inline-flex items-center gap-1.5 text-xs"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                New tab
              </a>
            )}
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-content hover:bg-ink/20 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full"
              >
                <X className="size-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="bg-ink/40 relative flex min-h-0 flex-1 items-center justify-center p-4">
            {!doc.url ? (
              <p className="text-content-muted text-sm">
                This file could not be opened. It may have been removed from storage.
              </p>
            ) : isImagePath(doc.storagePath) ? (
              <img src={doc.url} alt={doc.title} className="max-h-full max-w-full object-contain" />
            ) : (
              <iframe
                src={doc.url}
                title={doc.title}
                className="h-full w-full rounded-lg border-0"
              />
            )}

            {docs.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous document"
                  onClick={() => step(-1)}
                  className="bg-panel/90 text-content hover:bg-panel absolute left-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next document"
                  onClick={() => step(1)}
                  className="bg-panel/90 text-content hover:bg-panel absolute right-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>

          {/* Filmstrip: what else is in the folder, and one click to it. The
              reviewer's actual question is "does this match that", so the two
              being compared stay reachable from inside the viewer. */}
          {docs.length > 1 && (
            <div className="border-line/10 flex shrink-0 gap-2 overflow-x-auto border-t p-3">
              {docs.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  title={d.title}
                  className={cn(
                    'border-line/20 bg-ink/30 size-14 shrink-0 overflow-hidden rounded-lg border transition-colors',
                    i === index ? 'border-lime' : 'hover:border-line/40',
                  )}
                >
                  {d.url && isImagePath(d.storagePath) ? (
                    <img src={d.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-content-muted flex size-full items-center justify-center text-[10px]">
                      PDF
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
