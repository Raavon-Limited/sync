'use client';

import { useMemo, useState } from 'react';
import { FileText, Music, Video } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { ChatMessage } from '@/modules/vendor/types';
import { Attachment } from './attachments/attachment';
import { AttachmentViewer } from './attachments/attachment-viewer';

interface ChatMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  contactName: string;
}

const fileIcon = {
  video: Video,
  audio: Music,
  document: FileText,
} as const;

/**
 * "Media & Files" - every attachment in the conversation, images in a grid and
 * everything else in a list. Images open in the shared AttachmentViewer with
 * the whole image set as the gallery, so Previous/Next walks the conversation.
 */
export function ChatMediaDialog({
  open,
  onOpenChange,
  messages,
  contactName,
}: ChatMediaDialogProps) {
  const [preview, setPreview] = useState<Attachment | null>(null);

  const { images, files } = useMemo(() => {
    const all = messages.flatMap((message) => message.attachments ?? []);

    return {
      images: all.filter((attachment) => attachment.type === 'image'),
      files: all.filter((attachment) => attachment.type !== 'image'),
    };
  }, [messages]);

  const isEmpty = images.length === 0 && files.length === 0;

  /*
   * Images navigate as one gallery; a non-image opens on its own. Memoised so
   * the viewer's keyboard listener isn't resubscribed on every render.
   */
  const gallery = useMemo(() => {
    if (!preview) return [];

    return preview.type === 'image' ? images : [preview];
  }, [preview, images]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Media & Files</DialogTitle>
          </DialogHeader>

          {isEmpty ? (
            <p className="text-muted py-10 text-center text-sm">
              No media shared with {contactName} yet.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              {images.length > 0 && (
                <section>
                  <h3 className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">
                    Media ({images.length})
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    {images.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setPreview(image)}
                        className="group relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100"
                      >
                        <img
                          src={image.url}
                          alt={image.name}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {files.length > 0 && (
                <section>
                  <h3 className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">
                    Files ({files.length})
                  </h3>

                  <ul className="space-y-1.5">
                    {files.map((attachment) => {
                      const Icon = fileIcon[attachment.type as keyof typeof fileIcon] ?? FileText;

                      return (
                        <li key={attachment.id}>
                          <button
                            type="button"
                            onClick={() => setPreview(attachment)}
                            className="border-ink/10 hover:bg-ink/3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                          >
                            <span className="bg-ink/5 flex size-9 shrink-0 items-center justify-center rounded-lg">
                              <Icon className="size-4" />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="text-ink block truncate text-sm font-medium">
                                {attachment.name}
                              </span>

                              <span className="text-muted block text-xs capitalize">
                                {attachment.type}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AttachmentViewer
        attachment={preview}
        attachments={gallery}
        onClose={() => setPreview(null)}
        onChangeAttachment={setPreview}
      />
    </>
  );
}
