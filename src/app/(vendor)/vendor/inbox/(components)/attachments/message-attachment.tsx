'use client';

import { FileText, Music, Play, Download, ExternalLink } from 'lucide-react';

import { Attachment } from './attachment';
import { Button } from '@/components/ui/button';

interface MessageAttachmentProps {
  attachment: Attachment;
  onPreview: (attachment: Attachment) => void;
}

export function MessageAttachment({ attachment, onPreview }: MessageAttachmentProps) {
  const handleDownload = (event: React.MouseEvent) => {
    event.stopPropagation();

    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /*
   * IMAGE
   */
  if (attachment.type === 'image') {
    return (
      <Button
        type="button"
        onClick={() => onPreview(attachment)}
        className="group border-line/10 bg-surface-deep relative block overflow-hidden rounded-2xl border"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="block max-h-[360px] max-w-[320px] object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />

        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </Button>
    );
  }

  /*
   * VIDEO
   */
  if (attachment.type === 'video') {
    return (
      <Button
        type="button"
        onClick={() => onPreview(attachment)}
        className="group bg-ink relative flex h-[220px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-2xl"
      >
        <video
          src={attachment.url}
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />

        <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />

        <div className="bg-panel/90 relative z-10 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform group-hover:scale-105">
          <Play className="text-content ml-0.5 size-5 fill-current" />
        </div>

        <div className="absolute right-2 bottom-2 left-2 rounded-lg bg-black/50 px-2.5 py-1.5 text-left backdrop-blur-sm">
          <p className="truncate text-xs font-medium text-white">{attachment.name}</p>
        </div>
      </Button>
    );
  }

  /*
   * AUDIO
   */
  if (attachment.type === 'audio') {
    return (
      <Button
        type="button"
        onClick={() => onPreview(attachment)}
        className="border-accent/25 bg-accent/10 hover:bg-accent/20 flex w-[320px] max-w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors"
      >
        <div className="bg-accent flex size-11 shrink-0 items-center justify-center rounded-full">
          <Music className="text-ink size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-content truncate text-sm font-medium">{attachment.name}</p>

          <p className="text-accent-fg mt-0.5 text-xs">Audio attachment</p>
        </div>

        <Play className="text-accent-fg size-4 shrink-0" />
      </Button>
    );
  }

  /*
   * DOCUMENT
   */
  return (
    <div className="flex w-[320px] max-w-full items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
      <Button
        type="button"
        onClick={() => onPreview(attachment)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-100">
          <FileText className="size-5 text-orange-600" />
        </div>

        <div className="min-w-0">
          <p className="text-content truncate text-sm font-medium">{attachment.name}</p>

          <p className="mt-0.5 text-xs text-orange-600 uppercase">
            {attachment.name.split('.').pop() || 'FILE'}
          </p>
        </div>
      </Button>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          onClick={handleDownload}
          className="text-content-muted hover:bg-panel hover:text-content flex size-8 items-center justify-center rounded-full transition-colors"
          aria-label="Download file"
        >
          <Download className="size-4" />
        </Button>

        <Button
          type="button"
          onClick={() => onPreview(attachment)}
          className="text-content-muted hover:bg-panel hover:text-content flex size-8 items-center justify-center rounded-full transition-colors"
          aria-label="Open file"
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
    </div>
  );
}
