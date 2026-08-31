/**
 * A one-page PDF wrapping a single image.
 *
 * WHY NOT jsPDF
 *   The library is ~350KB to do one thing we need once. A PDF containing one
 *   image is a dozen objects and a cross-reference table; writing it directly
 *   is less code than the import, and it means the bytes are ours to reason
 *   about when a printer does something strange.
 *
 * WHY FLATE AND NOT JPEG
 *   Embedding a JPEG (DCTDecode) is three lines shorter and would be the
 *   obvious shortcut. It is also lossy, and the thing in the middle of this
 *   page is a QR code — JPEG ringing around hard black/white edges is exactly
 *   the artefact that makes a marginal scan fail. A credential that stops
 *   scanning after someone prints it is worse than no credential, so the image
 *   goes in lossless: raw RGB through DEFLATE, which every PDF reader has
 *   supported since 1.2.
 *
 * `CompressionStream` does the deflating — it is in every current browser and
 * saves shipping a zlib implementation. There is no fallback: a browser
 * without it also cannot do most of the rest of this app.
 */

/** PDF wants big-endian byte offsets padded to 10 digits in the xref table. */
function pad10(n: number) {
  return n.toString().padStart(10, '0');
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // 'deflate' (not 'deflate-raw') emits the zlib header PDF's FlateDecode
  // expects. Using the raw variant produces a file that opens in some readers
  // and is rejected by others, which is the worst kind of bug to chase.
  const cs = new CompressionStream('deflate');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Turn a canvas into a one-page PDF sized to the image.
 *
 * `pageWidthPt` sets the printed size in points (72pt = 1 inch). The image is
 * scaled to fill the page, so a 2× canvas simply prints at twice the
 * resolution rather than twice the size.
 */
export async function canvasToPdf(
  canvas: HTMLCanvasElement,
  opts: { pageWidthPt?: number } = {},
): Promise<Blob> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  // RGBA → RGB. PDF's DeviceRGB has no alpha channel, and the card is opaque,
  // so the alpha byte is dropped rather than flattened against anything.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }

  const image = await deflate(rgb);

  const pageW = opts.pageWidthPt ?? 640;
  const pageH = Math.round((pageW * height) / width);

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** Records where each object starts — the xref table is byte offsets. */
  const startObject = (n: number) => {
    offsets[n] = length;
  };

  push('%PDF-1.4\n');

  startObject(1);
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  startObject(4);
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
      `/Length ${image.length} >>\nstream\n`,
  );
  push(image);
  push('\nendstream\nendobj\n');

  // The content stream: scale the unit image up to the page and draw it.
  // `cm` is a transform matrix — width and height in, origin at bottom-left.
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  startObject(5);
  push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefAt = length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) xref += `${pad10(offsets[i])} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  // Concatenated by hand rather than `new Blob(chunks)` so the offsets above,
  // which were counted in bytes, describe the file that actually results.
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }

  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
