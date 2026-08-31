/**
 * The vendor's ID card — something to show a customer who asks "are you real?".
 *
 * WHY IT IS ONE SVG STRING AND NOT A DIV
 *   The card has to leave the app: downloaded, printed, sent in a WhatsApp
 *   message. Screenshotting a DOM node needs a rasteriser that re-implements
 *   CSS (html2canvas and friends), gets fonts and shadows subtly wrong, and
 *   adds a dependency the size of the feature. Building the card AS an SVG
 *   document means the thing on screen and the thing downloaded are the same
 *   object, and turning it into a PNG is `<img src=blob> → canvas`, which the
 *   browser does natively and exactly.
 *
 * THE QR IS THE POINT, AND IT CARRIES A URL, NOT A STATUS
 *   Anyone can print a card that says VERIFIED. What cannot be printed is a
 *   live answer, so the code encodes `/v/<slug>` and the truth is fetched when
 *   somebody scans it. A suspended vendor's card scans as suspended while the
 *   card in their hand still says otherwise — see 20260901170000.
 *
 *   That is why the card shows its own status quietly and the QR loudly. The
 *   printed status is a convenience; the code is the check.
 *
 * EVERYTHING REMOTE IS INLINED BEFORE RASTERISING. A remote <image> href inside
 * an SVG being drawn to a canvas either fails to load in time or taints the
 * canvas and makes `toBlob` throw. Fetching the logo and the rosette and
 * embedding them as data URIs removes both failures — and if either fetch
 * fails, the card is produced without it rather than not at all.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, QrCode, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui';
import { SITE, canonicalOrigin } from '@/config/site';
import { renderQr } from '@/lib/qr';
import { canvasToPdf } from '@/lib/pdf';
import type { VerificationStatus } from '@/modules/verification/types';

/** 8:5. Roomier than a credit card, which is what stopped the old one fitting. */
const W = 720;
const H = 450;

/** Ink, on the card only. Not theme tokens: a downloaded PNG has no theme. */
const INK = '#0e0e12';
const GOLD = '#c89b62';
const CREAM = '#f4f1e8';
const MUTED = '#9b9ba3';

/**
 * The QR is drawn in LIME-DEEP on cream, not bright lime on ink.
 *
 * Bright lime on a dark panel is the obvious reading of "make it lime" and it
 * produces an INVERTED code — light modules on a dark ground. The QR spec
 * assumes dark-on-light, and while many modern decoders cope, plenty of older
 * and in-app scanners simply do not. `lime-deep` is the same brand colour at
 * the other end of the ramp: unmistakably Sync, and a normal dark-on-light
 * code that every reader handles.
 */
const LIME_DEEP = '#4a8500';

const STATE: Record<string, { label: string; colour: string }> = {
  verified: { label: 'VERIFIED', colour: '#34d399' },
  pending: { label: 'IN REVIEW', colour: '#fbbf24' },
  unverified: { label: 'NOT VERIFIED', colour: MUTED },
  rejected: { label: 'NOT VERIFIED', colour: '#f87171' },
};

const ROSETTE_SRC = '/klario-rosette.png';

// Resolved once at module scope. It is build-time inlined and never changes,
// so calling it per render is both wasted work and something the React
// compiler cannot prove is pure.
const ORIGIN = canonicalOrigin();

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Trimmed so a long business name cannot run off the card. */
function fit(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export interface BusinessIdCardProps {
  businessName: string;
  slug: string;
  category?: string | null;
  area?: string | null;
  logoUrl?: string | null;
  verificationStatus: VerificationStatus | string;
  memberSince?: string | null;
  storeCount?: number;
}

export function BusinessIdCard({
  businessName,
  slug,
  category,
  area,
  logoUrl,
  verificationStatus,
  memberSince,
  storeCount,
}: BusinessIdCardProps) {
  const [busy, setBusy] = useState<null | 'png' | 'pdf'>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosette, setRosette] = useState<string | null>(null);

  // The CONFIGURED origin, never `window.location.origin`.
  //
  // This URL is baked into a file that gets downloaded, printed and handed to
  // strangers — it outlives the page that made it. A card generated on a dev
  // machine would otherwise carry `http://localhost:3000/v/...` permanently:
  // it would look perfect, print perfectly, and scan to nothing on anybody
  // else's phone. See canonicalOrigin().
  const verifyUrl = useMemo(() => `${ORIGIN}/v/${slug}`, [slug]);

  // The source art is 2000×2000 and 1.7MB. Inlining that verbatim would make
  // every downloaded card ~2.4MB of base64 for a watermark that is drawn 380px
  // wide. Downsampled once on mount, then reused for the preview AND the
  // download, which also removes the cross-origin fetch during rasterising.
  useEffect(() => {
    let live = true;
    downsample(ROSETTE_SRC, 420)
      .then((uri) => {
        if (live) setRosette(uri);
      })
      .catch(() => {
        // A missing watermark is a plainer card, not a broken one.
        if (live) setRosette(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const state = STATE[verificationStatus] ?? STATE.unverified;

  const common = {
    businessName,
    slug,
    category,
    area,
    verifyUrl,
    state,
    memberSince,
    storeCount,
  };

  const svg = useMemo(
    () => buildCard({ ...common, logoHref: logoUrl ?? null, rosetteHref: rosette }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessName, slug, category, area, verifyUrl, state, memberSince, storeCount, logoUrl, rosette],
  );

  async function download(format: 'png' | 'pdf') {
    setBusy(format);
    setError(null);
    try {
      // Rebuilt with the logo embedded too. A downloaded file that references
      // someone else's server is a card that stops working when the link rots.
      const logoHref = logoUrl ? await toDataUri(logoUrl) : null;
      const out = buildCard({ ...common, logoHref, rosetteHref: rosette });

      // 2× so the card is still sharp printed or opened on a phone.
      const canvas = await rasterise(out, W * 2, H * 2);
      const name = `${slug}-sync-id`;

      if (format === 'pdf') {
        saveBlob(await canvasToPdf(canvas, { pageWidthPt: W }), `${name}.pdf`);
      } else {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Could not render the card');
        saveBlob(blob, `${name}.png`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the card');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The SVG carries no width/height attributes — only a viewBox — so it
          fills whatever column it is given instead of rendering at a fixed
          720px and overflowing narrow ones. */}
      <div
        className="overflow-hidden rounded-2xl [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!!busy} onClick={() => download('png')} className="gap-2">
          <Download className="size-4" /> {busy === 'png' ? 'Preparing…' : 'Download PNG'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => download('pdf')}
          className="gap-2"
        >
          <FileText className="size-4" /> {busy === 'pdf' ? 'Preparing…' : 'PDF'}
        </Button>
        <Button size="sm" variant="ghost" asChild className="gap-2">
          <a href={verifyUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" /> Test the code
          </a>
        </Button>
      </div>

      <p className="text-content-muted flex items-start gap-2 text-xs">
        <QrCode className="mt-0.5 size-3.5 shrink-0" />
        {/* Said plainly, because it is the reason the card is worth carrying:
            the code is not a picture of a status, it is a lookup. */}
        Anyone can scan this code to see your status live — they do not need a Sync account. If
        your verification changes, every card already printed shows the new answer.
      </p>

      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}

// ── The document ────────────────────────────────────────────────────────────

function buildCard(o: {
  businessName: string;
  slug: string;
  category?: string | null;
  area?: string | null;
  verifyUrl: string;
  state: { label: string; colour: string };
  memberSince?: string | null;
  storeCount?: number;
  logoHref: string | null;
  rosetteHref: string | null;
}) {
  const qr = renderQr(o.verifyUrl, {
    size: 150,
    dark: LIME_DEEP,
    light: CREAM,
    margin: 2,
    radius: 0.34,
  });

  const since = o.memberSince
    ? new Date(o.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  const meta = [o.category, o.area].filter(Boolean).join(' · ');
  const initial = o.businessName.trim().charAt(0).toUpperCase() || 'S';

  // Laid out on a grid rather than by eye: one gutter, one baseline rhythm.
  const PAD = 44;
  const QR_BOX = 178;
  const QR_X = W - PAD - QR_BOX;
  const QR_Y = H - PAD - QR_BOX - 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
  <defs>
    <clipPath id="logoClip"><circle cx="${PAD + 34}" cy="128" r="34"/></clipPath>
    <clipPath id="cardClip"><rect width="${W}" height="${H}" rx="28"/></clipPath>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="${GOLD}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.13"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g clip-path="url(#cardClip)">
    <rect width="${W}" height="${H}" fill="${INK}"/>

    <!-- The rosette, bled off the right edge so it reads as a watermark behind
         the content rather than as a logo competing with it. Its glow keeps the
         QR panel from sitting on flat black. -->
    ${
      o.rosetteHref
        ? `<image href="${esc(o.rosetteHref)}" x="${W - 300}" y="${H / 2 - 210}" width="420" height="420"
                  opacity="0.5" preserveAspectRatio="xMidYMid meet"/>`
        : ''
    }
    <circle cx="${W - 90}" cy="${H / 2}" r="230" fill="url(#glow)"/>
  </g>

  <rect x="1.25" y="1.25" width="${W - 2.5}" height="${H - 2.5}" rx="27" fill="none"
        stroke="url(#edge)" stroke-width="1.5"/>

  <text x="${PAD}" y="54" fill="${GOLD}" font-size="11" letter-spacing="4.5" font-weight="600">
    ${esc(SITE.name.toUpperCase())} &#183; BUSINESS ID
  </text>

  <!-- Identity block: mark, name, one line of context. The same composition as
       the profile card this sits under, so the two read as one object. -->
  ${
    o.logoHref
      ? `<image href="${esc(o.logoHref)}" x="${PAD}" y="94" width="68" height="68"
                preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/>`
      : `<text x="${PAD + 34}" y="140" fill="${GOLD}" font-size="30" font-weight="700"
               text-anchor="middle">${esc(initial)}</text>`
  }
  <circle cx="${PAD + 34}" cy="128" r="34" fill="none" stroke="${GOLD}" stroke-width="1.5"/>

  <text x="${PAD + 88}" y="122" fill="${CREAM}" font-size="30" font-weight="700"
        letter-spacing="-0.5">${esc(fit(o.businessName, 20))}</text>
  ${meta ? `<text x="${PAD + 88}" y="148" fill="${MUTED}" font-size="14">${esc(fit(meta, 30))}</text>` : ''}

  <!-- Status. Quiet next to the code on purpose: this is the convenience, the
       QR is the check. -->
  <g transform="translate(${PAD} 196)">
    <rect width="196" height="38" rx="19" fill="${o.state.colour}" fill-opacity="0.14"/>
    <circle cx="22" cy="19" r="5" fill="${o.state.colour}"/>
    <text x="40" y="24" fill="${o.state.colour}" font-size="12" font-weight="700"
          letter-spacing="1.6">${esc(o.state.label)}</text>
  </g>

  <!-- Facts, on the same two-column rhythm as the profile card above it. -->
  ${
    since || typeof o.storeCount === 'number'
      ? `<g font-size="10" letter-spacing="1.6" fill="${MUTED}">
           ${since ? `<text x="${PAD}" y="278">ON SYNC SINCE</text>` : ''}
           ${typeof o.storeCount === 'number' ? `<text x="${PAD + 150}" y="278">STORES</text>` : ''}
         </g>
         <g font-size="16" font-weight="600" fill="${CREAM}">
           ${since ? `<text x="${PAD}" y="300">${esc(since)}</text>` : ''}
           ${typeof o.storeCount === 'number' ? `<text x="${PAD + 150}" y="300">${o.storeCount}</text>` : ''}
         </g>`
      : ''
  }

  <text x="${PAD}" y="356" fill="${MUTED}" font-size="10" letter-spacing="1.6">SCAN TO VERIFY</text>
  <text x="${PAD}" y="378" fill="${GOLD}" font-size="12">${esc(
    fit(o.verifyUrl.replace(/^https?:\/\/(www\.)?/, ''), 38),
  )}</text>

  <text x="${PAD}" y="${H - 34}" fill="#6a6a72" font-size="10" letter-spacing="1.2">
    Powered by ${esc(SITE.legalName)}
  </text>

  <!-- The code, on its own light panel, fully inside the card's padding. -->
  <g transform="translate(${QR_X} ${QR_Y})">
    <rect width="${QR_BOX}" height="${QR_BOX}" rx="22" fill="${CREAM}"/>
    <g transform="translate(14 14)">${qr.inner}</g>
  </g>
  <text x="${QR_X + QR_BOX / 2}" y="${QR_Y + QR_BOX + 24}" fill="${MUTED}" font-size="10"
        letter-spacing="1.4" text-anchor="middle">POINT A CAMERA HERE</text>
</svg>`;
}

// ── Getting it out of the browser ───────────────────────────────────────────

/**
 * Fetch an image and inline it, so the downloaded file is self-contained and
 * the canvas is never tainted by a cross-origin href.
 *
 * Returns null rather than throwing: a card without a logo is a card; a
 * download that fails because a logo 404'd is not.
 */
async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Load an image, shrink it to `max` px, and return it as a PNG data URI. */
function downsample(url: string, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas unavailable'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/** SVG string → canvas, using the browser's own renderer. */
function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new window.Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error('Could not render the card'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the card'));
    };
    img.src = url;
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: Safari has not finished reading the blob when
  // click() returns, and revoking immediately produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
