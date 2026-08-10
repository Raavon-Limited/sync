export type AttachmentType = 'image' | 'video' | 'audio' | 'document';

export interface Attachment {
  id: string;
  file: File;
  type: AttachmentType;
  url: string;

  name: string;
  size: number;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}
