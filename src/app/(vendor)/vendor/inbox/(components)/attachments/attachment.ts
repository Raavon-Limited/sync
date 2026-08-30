export type AttachmentType = 'image' | 'video' | 'audio' | 'document';

export interface Attachment {
  id: string;
  /**
   * Present only for attachments composed locally, before they are sent.
   *
   * A RECEIVED attachment has no File - it lives in Supabase Storage and is
   * reached through a signed URL. Display code must therefore read `name` /
   * `mimeType` / `size` (which are always populated) rather than reaching
   * through `file`, or every incoming attachment crashes on undefined.
   */
  file?: File;
  type: AttachmentType;
  /** Object URL while composing; a signed Storage URL once received. */
  url: string;

  name: string;
  size: number;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}
