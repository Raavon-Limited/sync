'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage, Input, Textarea } from '@/components/ui';
import { Button } from '@/components/ui';
import * as Popover from '@radix-ui/react-popover';
import {
  Paperclip,
  Send,
  Phone,
  ArrowLeft,
  Search,
  Images,
  Ban,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Video,
  Mic,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatContact, ChatMessage, ChatOrder } from '@/modules/vendor/types';
import { ChatMoreMenu } from './chat-more-menu';
import { AttachmentPreview } from './attachments/attachment-preview';
import { AttachmentViewer } from './attachments/attachment-viewer';
import { Attachment } from './attachments/attachment';
import { ChatTheme, ConversationPrefs } from '@/store/use-chat-store';
import { CHAT_THEMES } from './chat-theme';

interface ChatWindowProps {
  contact: ChatContact;
  messages: ChatMessage[];
  linkedOrder?: ChatOrder;
  onSend: (message: string, attachments: Attachment[]) => void;
  onBack?: () => void;

  prefs: ConversationPrefs;

  onViewCustomer: () => void;
  onOrderDetails: () => void;
  onMedia: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onToggleBlock: () => void;
  onSetTheme: (theme: ChatTheme) => void;
  onExport: (format: 'txt' | 'json') => void;
  onReport: () => void;
  onClear: () => void;
  onDelete: () => void;
}

const statusVariant: Record<ChatOrder['status'], string> = {
  Processing: 'bg-amber-100 text-amber-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
  Pending: 'bg-ink/8 text-ink',
};

const MAX_IMAGES = 10;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wraps every occurrence of `query` in the text with a highlight mark.
 * Used by the in-chat search to show where each match sits.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();

  if (!trimmed) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={index} className="rounded bg-yellow-300 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ChatWindow({
  contact,
  messages,
  linkedOrder,
  onSend,
  onBack,
  prefs,
  onViewCustomer,
  onOrderDetails,
  onMedia,
  onToggleMute,
  onTogglePin,
  onToggleArchive,
  onToggleBlock,
  onSetTheme,
  onExport,
  onReport,
  onClear,
  onDelete,
}: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const theme = CHAT_THEMES[prefs.theme];

  //Auto scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  // Automatically focus the message input when entering a chat
  useEffect(() => {
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, [contact.id]);

  /*
   * Ids of every message matching the search, in conversation order. Drives
   * both the match counter and the up/down stepper.
   */
  const matchIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return [];

    return messages
      .filter((item) => item.content?.toLowerCase().includes(query))
      .map((item) => item.id);
  }, [messages, searchQuery]);

  // Keep the active match in view as the vendor steps through results.
  useEffect(() => {
    const id = matchIds[activeMatch];

    if (!id) return;

    messageRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatch, matchIds]);

  const openSearch = () => {
    setSearchOpen(true);

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setActiveMatch(0);
  };

  const stepMatch = (delta: number) => {
    if (matchIds.length === 0) return;

    setActiveMatch((current) => (current + delta + matchIds.length) % matchIds.length);
  };

  // Handle file input change
  /**
   * Handles the selection of image files from an input element
   * Processes the selected files and updates the state with the new images
   * @param e - The React change event from the file input element
   */
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files, 'image');
    // Reset so picking the same file again still fires a change event
    e.target.value = '';
  };

  /**
   * Handles video file selection from an input element
   * @param e - React change event from input element
   */
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Add selected files to the files state with 'video' type
    addFiles(e.target.files, 'video');
    e.target.value = '';
  };

  /**
   * Handles the audio file selection event
   * Processes the selected files and adds them to the application state
   * @param e - React.ChangeEvent<HTMLInputElement> - The change event from the file input
   */
  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Add the selected files to the files state with 'audio' type
    addFiles(e.target.files, 'audio');
    e.target.value = '';
  };

  /**
   * Handles the document selection event from the input element
   * @param e - The React change event from the input element
   */
  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Add the selected files to the state with 'document' type
    addFiles(e.target.files, 'document');
    e.target.value = '';
  };

  //Send message handler
  const sendMessage = () => {
    const trimmed = message.trim();
    // If the message is empty and there are no attachments, do not send
    if (!trimmed && attachments.length === 0) return;

    // A blocked customer can't be messaged until they're unblocked.
    if (prefs.blocked) return;

    onSend(trimmed, attachments);

    // Clear the message input and attachments after sending

    setMessage('');
    setAttachments([]);
  };

  const addFiles = (files: FileList | null, type: Attachment['type']) => {
    if (!files) return;

    let filesToAdd = Array.from(files);

    // Limit images to MAX_IMAGES
    if (type === 'image') {
      const currentImageCount = attachments.filter(
        (attachment) => attachment.type === 'image',
      ).length;

      const remainingSlots = MAX_IMAGES - currentImageCount;

      if (remainingSlots <= 0) {
        return;
      }

      filesToAdd = filesToAdd.slice(0, remainingSlots);
    }

    const newAttachments: Attachment[] = filesToAdd.map((file) => ({
      id: crypto.randomUUID(),
      file,
      type,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);

      if (attachment) {
        URL.revokeObjectURL(attachment.url);
      }

      return prev.filter((a) => a.id !== id);
    });
  };

  /**
   * Opens a preview for the selected attachment
   * @param attachment - The attachment object to be previewed
   * @param gallery - The set the viewer can navigate through
   */
  const openPreview = (attachment: Attachment, gallery: Attachment[] = [attachment]) => {
    setPreviewAttachment(attachment);
    setPreviewAttachments(gallery);
  };

  /**
   * Function to close the preview of an attachment
   */
  const closePreview = () => {
    setPreviewAttachment(null); // Clear the attachment preview by setting state to null
    setPreviewAttachments([]); // Clear the gallery of attachments by setting state to an empty array
  };

  //Initialize initials for AvatarFallback
  const initials = contact.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-ink/5 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Mobile Back Button */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack}>
            <ArrowLeft className="size-5" />
          </Button>

          <div className="relative">
            <Avatar className="size-9">
              <AvatarImage src={contact.avatarUrl} alt={contact.name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>

            {contact.isOnline && (
              <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-green-500 ring-2 ring-white" />
            )}
          </div>

          <div>
            <p className="text-ink text-sm font-semibold">{contact.name}</p>

            <p className="text-xs text-green-500">{contact.isOnline ? 'Online' : 'Offline'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={openSearch} aria-label="Search conversation">
            <Search className="size-4" />
          </Button>

          <Button variant="ghost" size="icon">
            <Phone className="size-4" />
          </Button>

          <ChatMoreMenu
            muted={prefs.muted}
            pinned={prefs.pinned}
            archived={prefs.archived}
            blocked={prefs.blocked}
            theme={prefs.theme}
            onViewCustomer={onViewCustomer}
            onOrderDetails={onOrderDetails}
            onSearch={openSearch}
            onMedia={onMedia}
            onMute={onToggleMute}
            onPin={onTogglePin}
            onArchive={onToggleArchive}
            onTheme={onSetTheme}
            onExport={onExport}
            onBlock={onToggleBlock}
            onReport={onReport}
            onClear={onClear}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* In-chat search */}
      {searchOpen && (
        <div className="border-ink/5 flex items-center gap-2 border-b bg-white px-4 py-2">
          <Search className="text-muted size-4 shrink-0" />

          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveMatch(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch();
              if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1);
            }}
            placeholder={`Search in conversation with ${contact.name}...`}
            className="h-8 flex-1 border-0 text-xs shadow-none focus-visible:ring-0"
          />

          <span className="text-muted shrink-0 text-xs tabular-nums">
            {matchIds.length > 0 ? `${activeMatch + 1} / ${matchIds.length}` : '0 / 0'}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={matchIds.length === 0}
            onClick={() => stepMatch(-1)}
            aria-label="Previous match"
          >
            <ChevronUp className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={matchIds.length === 0}
            onClick={() => stepMatch(1)}
            aria-label="Next match"
          >
            <ChevronDown className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={closeSearch}
            aria-label="Close search"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto transition-colors', theme.surface)}>
        <div className="flex min-h-full flex-col gap-3 px-5 py-4">
          {/* Linked order pill */}
          {linkedOrder && (
            <button
              type="button"
              onClick={onOrderDetails}
              className="border-ink/10 mx-auto flex items-center gap-3 rounded-xl border bg-white px-4 py-2.5 shadow-sm transition hover:shadow-md"
            >
              <div className="bg-ink/5 flex size-8 items-center justify-center rounded-lg">
                <Send className="text-muted size-3.5" />
              </div>

              <div className="text-left">
                <p className="text-ink text-xs font-semibold">{linkedOrder.orderId}</p>
                <p className="text-muted text-xs">{linkedOrder.items}</p>
              </div>

              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusVariant[linkedOrder.status],
                )}
              >
                {linkedOrder.status}
              </span>
            </button>
          )}

          {messages.length === 0 && (
            <p className="text-muted my-auto text-center text-xs">
              No messages in this conversation yet.
            </p>
          )}

          {messages.map((message) => {
            const isActiveMatch = matchIds[activeMatch] === message.id;

            return (
              <div
                key={message.id}
                ref={(node) => {
                  messageRefs.current[message.id] = node;
                }}
                className={cn('flex flex-col gap-1', message.isVendor ? 'items-end' : 'items-start')}
              >
                {!message.isVendor && (
                  <Avatar className="size-6">
                    <AvatarImage src={contact.avatarUrl} alt={contact.name} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                )}

                {/* ATTACHMENTS */}
                {message.attachments && message.attachments.length > 0 && (
                  <div
                    className={cn(
                      'flex flex-col gap-2',
                      message.isVendor ? 'items-end' : 'items-start',
                    )}
                  >
                    {/* IMAGE ATTACHMENTS */}
                    {(() => {
                      const imageAttachments = message.attachments.filter(
                        (attachment) => attachment.type === 'image',
                      );

                      if (imageAttachments.length === 0) {
                        return null;
                      }

                      /* =========================
                         SINGLE IMAGE
                         ========================= */
                      if (imageAttachments.length === 1) {
                        const image = imageAttachments[0];

                        return (
                          <button
                            type="button"
                            onClick={() => openPreview(image, imageAttachments)}
                            className="group relative max-w-[320px] overflow-hidden rounded-2xl border border-black/5 bg-gray-100"
                          >
                            <img
                              src={image.url}
                              alt={image.file.name}
                              className="block max-h-[380px] max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                          </button>
                        );
                      }

                      /* =========================
                         MULTIPLE IMAGES
                         ========================= */
                      const visibleImages = imageAttachments.slice(0, 4);
                      const remainingCount = imageAttachments.length - 4;

                      return (
                        <div className="grid w-full max-w-[304px] grid-cols-2 gap-1 overflow-hidden rounded-2xl">
                          {visibleImages.map((image, index) => {
                            const showMoreOverlay = index === 3 && remainingCount > 0;

                            return (
                              <button
                                key={image.id}
                                type="button"
                                onClick={() => {
                                  if (showMoreOverlay) {
                                    const firstHiddenImage = imageAttachments[4];

                                    if (firstHiddenImage) {
                                      openPreview(firstHiddenImage, imageAttachments);
                                    }
                                  } else {
                                    openPreview(image, imageAttachments);
                                  }
                                }}
                                className="group relative aspect-square w-full overflow-hidden bg-gray-100"
                              >
                                <img
                                  src={image.url}
                                  alt={image.file.name}
                                  className="block h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />

                                {/* +N OVERLAY */}
                                {showMoreOverlay && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <span className="text-2xl font-semibold text-white">
                                      +{remainingCount}
                                    </span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* NON-IMAGE ATTACHMENTS */}
                    {message.attachments
                      .filter((attachment) => attachment.type !== 'image')
                      .map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() => openPreview(attachment, [attachment])}
                          className="border-ink/10 overflow-hidden rounded-xl border bg-white"
                        >
                          {attachment.type === 'video' && (
                            <div className="flex size-32 flex-col items-center justify-center gap-2 bg-slate-100">
                              <Video className="size-8 text-slate-700" />

                              <span className="max-w-[110px] truncate px-2 text-xs">
                                {attachment.file.name}
                              </span>
                            </div>
                          )}

                          {attachment.type === 'audio' && (
                            <div className="flex size-32 flex-col items-center justify-center gap-2 bg-violet-50">
                              <Music className="size-8 text-violet-600" />

                              <span className="max-w-[110px] truncate px-2 text-xs">
                                {attachment.file.name}
                              </span>
                            </div>
                          )}

                          {attachment.type === 'document' && (
                            <div className="flex size-32 flex-col items-center justify-center gap-2 bg-orange-50">
                              <FileText className="size-8 text-orange-600" />

                              <span className="max-w-[110px] truncate px-2 text-xs">
                                {attachment.file.name}
                              </span>
                            </div>
                          )}
                        </button>
                      ))}
                  </div>
                )}

                {/* TEXT */}
                {message.content && (
                  <div
                    className={cn(
                      'max-w-xs rounded-2xl px-4 py-2.5 text-sm transition-shadow',
                      message.isVendor
                        ? cn('rounded-tr-sm', theme.bubble)
                        : 'text-ink border-ink/5 rounded-tl-sm border bg-white',
                      isActiveMatch && 'ring-2 ring-yellow-400 ring-offset-2',
                    )}
                  >
                    <Highlight text={message.content} query={searchOpen ? searchQuery : ''} />
                  </div>
                )}

                <span className="text-muted text-[11px]">{message.timestamp}</span>
              </div>
            );
          })}

          {/* Keeps auto-scroll working */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="flex gap-3 overflow-x-auto bg-white px-4 py-3">
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={removeAttachment}
              onPreview={(selected) => openPreview(selected, attachments)}
            />
          ))}
        </div>
      )}

      {/* Hidden File Inputs */}
      <Input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
      />

      <Input
        ref={documentInputRef}
        hidden
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        onChange={handleDocumentSelect}
      />

      <Input ref={videoInputRef} hidden type="file" accept="video/*" onChange={handleVideoSelect} />

      <Input ref={audioInputRef} hidden type="file" accept="audio/*" onChange={handleAudioSelect} />

      {/* Input */}
      <div className="border-ink/5 shrink-0 border-t bg-white px-4 py-3">
        {prefs.blocked ? (
          <div className="border-ink/10 flex flex-wrap items-center justify-center gap-3 rounded-xl border bg-red-50/60 px-4 py-3 text-center">
            <span className="text-ink flex items-center gap-2 text-sm">
              <Ban className="size-4 text-red-500" />
              You blocked {contact.name}. You can&apos;t send messages.
            </span>

            <Button variant="outline" size="sm" onClick={onToggleBlock}>
              Unblock
            </Button>
          </div>
        ) : (
          <div className="border-ink/10 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0">
                  <Paperclip className="size-4" />
                </Button>
              </Popover.Trigger>

              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="start"
                  sideOffset={12}
                  collisionPadding={12}
                  className="border-ink/5 z-50 w-[285px] rounded-3xl border bg-white p-3 shadow-2xl"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {/* Photos */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="group flex min-h-[112px] flex-col items-center justify-center rounded-2xl p-3 transition-colors hover:bg-blue-50"
                    >
                      <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-blue-100">
                        <Images className="size-5 text-blue-500" />
                      </div>

                      <span className="text-ink text-sm font-medium">Photos</span>

                      <span className="text-muted mt-0.5 text-[11px]">JPG, PNG</span>
                    </Button>

                    {/* Documents */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => documentInputRef.current?.click()}
                      className="group flex min-h-[112px] flex-col items-center justify-center rounded-2xl p-3 transition-colors hover:bg-orange-50"
                    >
                      <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-orange-100">
                        <FileText className="size-5 text-orange-500" />
                      </div>

                      <span className="text-ink text-sm font-medium">Documents</span>

                      <span className="text-muted mt-0.5 text-[11px]">PDF, DOCX</span>
                    </Button>

                    {/* Videos */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="group flex min-h-[112px] flex-col items-center justify-center rounded-2xl p-3 transition-colors hover:bg-violet-50"
                    >
                      <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-violet-100">
                        <Video className="size-5 text-violet-500" />
                      </div>

                      <span className="text-ink text-sm font-medium">Videos</span>

                      <span className="text-muted mt-0.5 text-[11px]">MP4, MOV</span>
                    </Button>

                    {/* Audio */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="group flex min-h-[112px] flex-col items-center justify-center rounded-2xl p-3 transition-colors hover:bg-green-50"
                    >
                      <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-green-100">
                        <Mic className="size-5 text-green-500" />
                      </div>

                      <span className="text-ink text-sm font-medium">Audio</span>

                      <span className="text-muted mt-0.5 text-[11px]">MP3, WAV</span>
                    </Button>
                  </div>

                  <Popover.Arrow className="fill-white" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <Textarea
              ref={messageInputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              rows={1}
              className="text-ink placeholder:text-muted max-h-32 flex-1 resize-none border-0 bg-transparent text-sm shadow-none outline-none! focus-visible:ring-0! focus-visible:ring-offset-0 focus-visible:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-violet-500"
              onClick={sendMessage}
            >
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <AttachmentViewer
        attachment={previewAttachment}
        attachments={previewAttachments}
        onClose={closePreview}
        onChangeAttachment={setPreviewAttachment}
      />
    </div>
  );
}
