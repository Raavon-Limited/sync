'use client';

import { X, FileText, Music, Video } from 'lucide-react';
import { Button } from '@/components/ui';
import { Attachment } from './attachment';
import Image from 'next/image';

interface AttachmentPreviewProps {
  /** Compose-time only, so the File is guaranteed here. */
  attachment: Attachment & { file: File };
  onRemove: (id: string) => void;
  onPreview: (attachment: Attachment) => void;
}

export function AttachmentPreview({ attachment, onRemove, onPreview }: AttachmentPreviewProps) {
  const { id, type, file, url } = attachment;

  const renderPreview = () => {
    switch (type) {
      case 'image':
        return (
          <Image src={url} alt={file.name} fill className="rounded-xl object-cover" sizes="96px" />
        );

      case 'video':
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-100">
            <Video className="size-7 text-slate-700" />
            <p className="line-clamp-2 px-2 text-center text-[11px]">{file.name}</p>
          </div>
        );

      case 'audio':
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-violet-50">
            <Music className="size-7 text-violet-600" />
            <p className="line-clamp-2 px-2 text-center text-[11px]">{file.name}</p>
          </div>
        );

      default:
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-orange-50">
            <FileText className="size-7 text-orange-600" />
            <p className="line-clamp-2 px-2 text-center text-[11px]">{file.name}</p>
          </div>
        );
    }
  };

  return (
    <div className="relative h-24 w-24 shrink-0">
      <Button
        type="button"
        onClick={() => onPreview(attachment)}
        className="border-ink/5 m-0 h-full w-full overflow-hidden rounded-xl border bg-white p-0 hover:bg-transparent"
      >
        {renderPreview()}
      </Button>

      <Button
        size="icon"
        variant="dark"
        onClick={() => onRemove(id)}
        className="absolute -top-2 -right-2 z-20 size-6 rounded-full shadow-md"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
