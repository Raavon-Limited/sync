'use client';

import {
  X,
  Download,
  FileText,
  Music,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Attachment } from './attachment';

interface AttachmentViewerProps {
  attachment: Attachment | null;
  attachments?: Attachment[];
  onClose: () => void;
  onChangeAttachment?: (attachment: Attachment) => void;
}

/*
 * Stable fallback gallery. A fresh [] default would change identity
 * on every render and resubscribe the keyboard listener each time.
 */
const NO_ATTACHMENTS: Attachment[] = [];

export function AttachmentViewer({
  attachment,
  attachments = NO_ATTACHMENTS,
  onClose,
  onChangeAttachment,
}: AttachmentViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /*
   * Normalized once and reused on both sides of the comparison below.
   * Comparing the raw `attachment?.id` (undefined when closed) against
   * the stored null would never converge and would loop forever.
   */
  const currentAttachmentId = attachment?.id ?? null;

  const [lastAttachmentId, setLastAttachmentId] = useState(currentAttachmentId);

  /*
   * Reset viewer state whenever the selected attachment changes.
   * Done during render instead of in an effect so stepping through the
   * gallery does not cost an extra cascading render pass. Playback
   * position resets on its own because the media elements below are
   * keyed by attachment id and therefore remount.
   */
  if (currentAttachmentId !== lastAttachmentId) {
    setLastAttachmentId(currentAttachmentId);
    setIsPlaying(false);
    setMediaError(false);
  }

  /*
   * Position of the open attachment within the gallery it was opened
   * from. -1 when the gallery does not contain it, which disables
   * navigation instead of jumping to an unrelated attachment.
   */
  const currentIndex = attachment
    ? attachments.findIndex((item) => item.id === attachment.id)
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < attachments.length - 1;

  const goToPrevious = useCallback(() => {
    if (!hasPrevious || !onChangeAttachment) return;

    onChangeAttachment(attachments[currentIndex - 1]);
  }, [hasPrevious, onChangeAttachment, attachments, currentIndex]);

  const goToNext = useCallback(() => {
    if (!hasNext || !onChangeAttachment) return;

    onChangeAttachment(attachments[currentIndex + 1]);
  }, [hasNext, onChangeAttachment, attachments, currentIndex]);

  /*
   * Keyboard controls. Declared before the early return below so the
   * hook order stays stable between the open and closed states.
   */
  useEffect(() => {
    if (!attachment) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachment, onClose, goToPrevious, goToNext]);

  if (!attachment) {
    return null;
  }

  /*
   * Download fallback.
   */
  const downloadAttachment = () => {
    const link = document.createElement('a');

    link.href = attachment.url;
    link.download = attachment.file.name;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /*
   * Open attachment in a browser tab.
   */
  const openAttachment = () => {
    window.open(attachment.url, '_blank', 'noopener,noreferrer');
  };

  /*
   * Audio controls.
   */
  const toggleAudio = async () => {
    if (!audioRef.current) return;

    try {
      if (audioRef.current.paused) {
        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } catch {
      setMediaError(true);
      setIsPlaying(false);
    }
  };

  /*
   * Determine whether the browser reports support
   * for the current audio/video MIME type.
   */
  const canPlayMedia = () => {
    if (!attachment.file.type) return true;

    if (attachment.type === 'audio') {
      const audio = document.createElement('audio');

      return audio.canPlayType(attachment.file.type) !== '';
    }

    if (attachment.type === 'video') {
      const video = document.createElement('video');

      return video.canPlayType(attachment.file.type) !== '';
    }

    return true;
  };

  const mediaSupported = canPlayMedia();

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.file.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Header */}
      <div className="absolute top-0 right-0 left-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="max-w-[60vw] truncate text-sm font-medium text-white">
            {attachment.file.name}
          </p>

          <p className="mt-0.5 text-xs text-white/60">{attachment.file.type || 'File'}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={downloadAttachment}
            className="flex size-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Download attachment"
          >
            <Download className="size-5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Close preview"
          >
            <X className="size-6" />
          </button>
        </div>
      </div>

      {/* Previous */}
      {hasPrevious && (
        <button
          type="button"
          onClick={goToPrevious}
          className="absolute left-3 z-20 flex size-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 sm:left-5"
          aria-label="Previous attachment"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}

      {/* Next */}
      {hasNext && (
        <button
          type="button"
          onClick={goToNext}
          className="absolute right-3 z-20 flex size-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 sm:right-5"
          aria-label="Next attachment"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {/* IMAGE */}
      {attachment.type === 'image' && (
        <div className="flex max-h-[85vh] max-w-[90vw] items-center justify-center">
          <img
            src={attachment.url}
            alt={attachment.file.name}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}

      {/* VIDEO */}
      {attachment.type === 'video' && (
        <>
          {!mediaSupported || mediaError ? (
            <UnsupportedMedia
              type="video"
              fileName={attachment.file.name}
              onOpen={openAttachment}
              onDownload={downloadAttachment}
            />
          ) : (
            <div className="relative flex max-h-[85vh] max-w-[90vw] items-center justify-center">
              <video
                key={attachment.id}
                ref={videoRef}
                src={attachment.url}
                controls
                autoPlay
                playsInline
                className="max-h-[85vh] max-w-[90vw] rounded-lg"
                onError={() => setMediaError(true)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          )}
        </>
      )}

      {/* AUDIO */}
      {attachment.type === 'audio' && (
        <>
          {!mediaSupported || mediaError ? (
            <UnsupportedMedia
              type="audio"
              fileName={attachment.file.name}
              onOpen={openAttachment}
              onDownload={downloadAttachment}
            />
          ) : (
            <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl">
              <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-full bg-violet-100">
                <Music className="size-9 text-violet-600" />
              </div>

              <h3 className="text-ink max-w-full truncate text-base font-semibold">
                {attachment.file.name}
              </h3>

              <p className="text-muted mt-1 text-xs">{attachment.file.type || 'Audio file'}</p>

              <audio
                key={attachment.id}
                ref={audioRef}
                src={attachment.url}
                controls
                className="mt-6 w-full"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setMediaError(true)}
              />

              <button
                type="button"
                onClick={toggleAudio}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
              >
                {isPlaying ? (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="size-4 fill-current" />
                    Play
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* DOCUMENT */}
      {attachment.type === 'document' && (
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col items-center">
          {attachment.file.type === 'application/pdf' ? (
            <div className="h-[75vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl">
              <iframe
                src={attachment.url}
                title={attachment.file.name}
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
              <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl bg-orange-100">
                <FileText className="size-9 text-orange-600" />
              </div>

              <h3 className="text-ink max-w-full truncate text-base font-semibold">
                {attachment.file.name}
              </h3>

              <p className="text-muted mt-1 text-xs">{attachment.file.type || 'Document'}</p>

              <div className="mt-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={openAttachment}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
                >
                  <ExternalLink className="size-4" />
                  Open
                </button>

                <button
                  type="button"
                  onClick={downloadAttachment}
                  className="border-ink/10 text-ink hover:bg-ink/5 inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition"
                >
                  <Download className="size-4" />
                  Download
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Counter */}
      {attachments.length > 1 && currentIndex !== -1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
          {currentIndex + 1} / {attachments.length}
        </div>
      )}
    </div>
  );
}

/**
 * Fallback shown when the browser cannot decode
 * the selected audio/video format.
 */
function UnsupportedMedia({
  type,
  fileName,
  onOpen,
  onDownload,
}: {
  type: 'audio' | 'video';
  fileName: string;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const isAudio = type === 'audio';

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
      <div className="bg-ink/5 mx-auto mb-5 flex size-20 items-center justify-center rounded-full">
        {isAudio ? (
          <Music className="size-9 text-violet-600" />
        ) : (
          <Play className="size-9 text-violet-600" />
        )}
      </div>

      <h3 className="text-ink truncate text-base font-semibold">{fileName}</h3>

      <p className="text-muted mt-2 text-sm">Your browser cannot preview this {type} format.</p>

      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          <ExternalLink className="size-4" />
          Open
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="border-ink/10 text-ink hover:bg-ink/5 inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition"
        >
          <Download className="size-4" />
          Download
        </button>
      </div>
    </div>
  );
}
