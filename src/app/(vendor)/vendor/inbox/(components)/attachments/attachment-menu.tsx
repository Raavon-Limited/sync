'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Camera, Image, FileText, Video, Mic, Package, ShoppingBag, Paperclip } from 'lucide-react';

interface AttachmentMenuProps {
  onCamera: () => void;
  onPhotos: () => void;
  onDocument: () => void;
  onVideo: () => void;
  onAudio: () => void;
  onProduct: () => void;
  onOrder: () => void;
}

export function AttachmentMenu({
  onCamera,
  onPhotos,
  onDocument,
  onVideo,
  onAudio,
  onProduct,
  onOrder,
}: AttachmentMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="hover:bg-surface-deep rounded-full p-2 transition">
          <Paperclip className="size-5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={10}
          className="bg-panel z-50 w-64 rounded-2xl border p-2 shadow-xl"
        >
          <DropdownMenu.Item className="menu-item" onClick={onCamera}>
            <Camera size={18} />
            Camera
          </DropdownMenu.Item>

          <DropdownMenu.Item className="menu-item" onClick={onPhotos}>
            <Image size={18} />
            Photos
          </DropdownMenu.Item>

          <DropdownMenu.Item className="menu-item" onClick={onDocument}>
            <FileText size={18} />
            Document
          </DropdownMenu.Item>

          <DropdownMenu.Item className="menu-item" onClick={onVideo}>
            <Video size={18} />
            Video
          </DropdownMenu.Item>

          <DropdownMenu.Item className="menu-item" onClick={onAudio}>
            <Mic size={18} />
            Audio
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="bg-line/15 my-2 h-px" />

          <DropdownMenu.Item className="menu-item" onClick={onProduct}>
            <ShoppingBag size={18} />
            Share Product
          </DropdownMenu.Item>

          <DropdownMenu.Item className="menu-item" onClick={onOrder}>
            <Package size={18} />
            Share Order
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
