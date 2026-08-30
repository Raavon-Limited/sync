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
        className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/5"
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
        className="group relative flex h-[220px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900"
      >
        <video
          src={attachment.url}
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />

        <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />

        <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
          <Play className="ml-0.5 size-5 fill-current text-slate-900" />
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
        className="flex w-[320px] max-w-full items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left transition-colors hover:bg-violet-100"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-600">
          <Music className="size-5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>

          <p className="mt-0.5 text-xs text-violet-600">Audio attachment</p>
        </div>

        <Play className="size-4 shrink-0 text-violet-600" />
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
          <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>

          <p className="mt-0.5 text-xs text-orange-600 uppercase">
            {attachment.name.split('.').pop() || 'FILE'}
          </p>
        </div>
      </Button>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          onClick={handleDownload}
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          aria-label="Download file"
        >
          <Download className="size-4" />
        </Button>

        <Button
          type="button"
          onClick={() => onPreview(attachment)}
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          aria-label="Open file"
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
    </div>
  );
}
