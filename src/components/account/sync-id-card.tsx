/**
 * The Sync ID card   something to show whoever asks "are you real?".
 *
 * ONE CARD, EVERY KIND OF ACCOUNT
 *   It began as the vendor card, which left the people most often asked that
 *   question   a rider at a gate, an ambassador at a hostel, a staff member
 *   asking a landlord for documents   with nothing to show. A shop is already
 *   public; a person turning up at your door is not. So `kind` chooses the
 *   words and the facts, and everything else about the card is identical,
 *   because a card that looks different per role teaches nobody what a real
 *   one looks like.
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
 *   card in their hand still says otherwise   see 20260901170000.
 *
 *   That is why the card shows its own status quietly and the QR loudly. The
 *   printed status is a convenience; the code is the check.
 *
 * EVERYTHING REMOTE IS INLINED BEFORE RASTERISING. A remote <image> href inside
 * an SVG being drawn to a canvas either fails to load in time or taints the
 * canvas and makes `toBlob` throw. Fetching the logo and the rosette and
 * embedding them as data URIs removes both failures   and if either fetch
 * fails, the card is produced without it rather than not at all.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, QrCode, ExternalLink, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { SITE, canonicalOrigin } from '@/config/site';
import { renderQr } from '@/lib/qr';
import { canvasToPdf } from '@/lib/pdf';
import type { VerificationStatus } from '@/modules/verification/types';

/** 8:5. Roomier than a credit card, which is what stopped the old one fitting. */
const W = 720;
const H = 450;

/**
 * THE CARD IS PAINTED IN SYNC'S OWN COLOURS, IN THE THEME THE PAGE IS WEARING.
 *
 * It used to be one dark card with a GOLD edge in both modes, because a
 * downloaded PNG carries no CSS and the colours therefore had to be literals.
 * The literals are still literals   but "no CSS" was never a reason to invent a
 * colour the product does not own. Gold is borrowed prestige on a brand whose
 * accent is lime.
 *
 * So every value below is a Sync token, copied by hand from the two theme
 * layers in globals.css (`:root` and `.dark`) rather than referenced, because
 * `var(--ct)` inside an SVG that is about to be rasterised resolves to nothing.
 * When a token there moves, move its twin here.
 *
 * WHY THE THEME MATTERS TO A FILE ON DISK
 *   The theme is read once, in the browser, and baked into the document. The
 *   preview and the download are built from the same palette, so somebody
 *   working in light mode gets a light card on screen AND a light card in the
 *   folder. A card that looked one way on the page and another way in the file
 *   would be a small betrayal every time it was opened.
 *
 * WHICH LIME, AND WHY IT DIFFERS BY THEME
 *   Not the bright brand `lime` (#c5ff4a): that is a FILL colour, and as
 *   hairline text or a 1.5px rule it glares on ink and vanishes on cream. The
 *   two ends of the ramp carry the contrast instead   the near-green #a8db3c
 *   the dark theme already uses for fills, and `lime-deep` on cream. This is
 *   the same rule the stylesheet states at the top: never bright lime as text.
 */
const INK = '#0e0e12';
const CREAM = '#f4f1e8';

/**
 * The QR is drawn in LIME-DEEP on a light panel in BOTH themes.
 *
 * Bright lime on a dark panel is the obvious reading of "make it lime" and it
 * produces an INVERTED code   light modules on a dark ground. The QR spec
 * assumes dark-on-light, and while many modern decoders cope, plenty of older
 * and in-app scanners simply do not. `lime-deep` is the same brand colour at
 * the other end of the ramp: unmistakably Sync, and a normal dark-on-light
 * code that every reader handles. This is the one part of the card the theme
 * gets no vote on   a code some scanners refuse is not a code.
 */
const LIME_DEEP = '#4a8500';

interface Palette {
  /** The card ground   `--sf`. */
  bg: string;
  /** Headline and facts   `--ct`. */
  text: string;
  /** Labels, sub-line, the caption under the code   `--ct-muted`. */
  muted: string;
  /** The edge, the eyebrow, the initial. What used to be gold. */
  accent: string;
  /** The "powered by" line, quieter still than muted. */
  footer: string;
  /** The ground under the QR. Light in both themes, on purpose (see above). */
  qrPanel: string;
  /** Statuses, keyed alike in both themes so the lookup never branches. */
  state: Record<string, { label: string; colour: string }>;
  rosetteOpacity: number;
  glowOpacity: number;
}

/**
 * Verified is lime because lime is what Sync says "good" in; anything short of
 * verified is coral, the palette's one warning colour. Pending and rejected
 * share it and are told apart by their words   which is already how the card
 * reads, since a rejected account and one that never started are both simply
 * NOT VERIFIED to the person holding it.
 */
const DARK: Palette = {
  bg: INK,
  text: CREAM,
  muted: '#9b9ba3',
  accent: '#a8db3c',
  footer: '#6a6a72',
  qrPanel: CREAM,
  state: {
    verified: { label: 'VERIFIED', colour: '#a8db3c' },
    pending: { label: 'IN REVIEW', colour: '#ff8b5c' },
    unverified: { label: 'NOT VERIFIED', colour: '#9b9ba3' },
    rejected: { label: 'NOT VERIFIED', colour: '#ff8b5c' },
  },
  rosetteOpacity: 0.5,
  glowOpacity: 0.13,
};

const LIGHT: Palette = {
  bg: CREAM,
  text: INK,
  muted: '#6a6a72',
  accent: LIME_DEEP,
  footer: '#9b9ba3',
  qrPanel: '#ffffff',
  state: {
    verified: { label: 'VERIFIED', colour: LIME_DEEP },
    // Coral is defined for a dark ground. On cream it is a pastel that fails
    // contrast at 12px, so the same hue is taken down the ramp   the alarm has
    // to be legible or it is decoration.
    pending: { label: 'IN REVIEW', colour: '#b4451a' },
    unverified: { label: 'NOT VERIFIED', colour: '#6a6a72' },
    rejected: { label: 'NOT VERIFIED', colour: '#b4451a' },
  },
  // The rosette is dark art. At the dark card's 0.5 it reads as a smudge on
  // cream and fights the code panel beside it.
  rosetteOpacity: 0.14,
  glowOpacity: 0.1,
};

/**
 * What the card calls itself, in the accent line across the top.
 *
 * The eyebrow is the only thing that changes between roles, and it changes
 * because a rider handing over a card that says BUSINESS ID has to explain
 * himself. Everything below it   the grid, the rosette, the code panel   is
 * identical on purpose: the person checking it learns one object, not six.
 */
export type CardKind =
  | 'business'
  | 'student'
  | 'rider'
  | 'organiser'
  | 'creator'
  | 'agent'
  | 'staff';

const KIND_LABEL: Record<CardKind, string> = {
  business: 'BUSINESS ID',
  student: 'STUDENT ID',
  rider: 'RIDER ID',
  organiser: 'ORGANISER ID',
  creator: 'CREATOR ID',
  agent: 'AGENT ID',
  staff: 'STAFF ID',
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

export interface SyncIdCardProps {
  /** Which words the card uses about itself. */
  kind: CardKind;
  /**
   * The line under the name: a business name, a department, a console role.
   * Whatever answers "in what capacity".
   */
  businessName?: string | null;
  /** Only used to name the downloaded file. The QR is addressed by `code`. */
  slug: string;
  /**
   * The card's unguessable address. Absent while it loads, which is why the
   * QR is not drawn until it arrives   a code-less card would produce a QR
   * pointing at `/v/undefined`, which resolves to "not a valid card" and looks
   * like the vendor's own account is broken.
   */
  code?: string | null;
  /** The person's name, when there is one. On an agent's card it leads. */
  holderName?: string | null;
  category?: string | null;
  area?: string | null;
  /**
   * The face or the mark in the disc: a business logo, or the profile picture
   * the holder chose. Absent, the disc carries their initial   which is what
   * every card did before anyone could upload one, and still what a card shows
   * for somebody who has not.
   */
  logoUrl?: string | null;
  verificationStatus: VerificationStatus | string;
  memberSince?: string | null;
  /**
   * Up to two facts along the bottom left. A vendor shows stores; a student
   * shows nothing but the date, and an empty pair simply draws nothing rather
   * than leaving a labelled blank.
   */
  facts?: { label: string; value: string }[];
  /** Reissue   invalidates every printed card. Omitted, the control hides. */
  onReissue?: () => void;
  reissuing?: boolean;
}

export function SyncIdCard({
  kind,
  businessName,
  slug,
  code,
  holderName,
  category,
  area,
  logoUrl,
  verificationStatus,
  memberSince,
  facts = [],
  onReissue,
  reissuing,
}: SyncIdCardProps) {
  const [busy, setBusy] = useState<null | 'png' | 'pdf'>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosette, setRosette] = useState<string | null>(null);

  // The CONFIGURED origin, never `window.location.origin`.
  //
  // This URL is baked into a file that gets downloaded, printed and handed to
  // strangers   it outlives the page that made it. A card generated on a dev
  // machine would otherwise carry `http://localhost:3000/v/...` permanently:
  // it would look perfect, print perfectly, and scan to nothing on anybody
  // else's phone. See canonicalOrigin().
  //
  // Addressed by the CODE, not the slug. `/v/raavon-limited` is guessable from
  // a business name, and this page shows a photograph of a person   anyone
  // could have walked the slug list and harvested faces. See 20260901190000.
  const verifyUrl = useMemo(() => (code ? `${ORIGIN}/v/${code}` : null), [code]);

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

  // The theme the PAGE is wearing, which is the theme the card is drawn in
  // preview and download alike. See useThemeMode: it follows the toggle's class
  // on <html> as well as the OS preference, so a card repaints the moment
  // somebody flips the switch beside it rather than on the next reload.
  const mode = useThemeMode();
  const palette = mode === 'dark' ? DARK : LIGHT;

  const state = palette.state[verificationStatus] ?? palette.state.unverified;

  const common = {
    kind,
    businessName,
    holderName,
    category,
    area,
    verifyUrl,
    state,
    memberSince,
    facts,
    palette,
  };

  const svg = useMemo(
    () => buildCard({ ...common, logoHref: logoUrl ?? null, rosetteHref: rosette }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      kind,
      businessName,
      holderName,
      category,
      area,
      verifyUrl,
      state,
      memberSince,
      facts,
      logoUrl,
      rosette,
      palette,
    ],
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
      {/* CAPPED AT ROUGHLY THE SIZE OF THE THING IT DEPICTS.
          The SVG carries no width/height attributes   only a viewBox   so it
          scales to whatever box it is given. Given the full settings column on
          a desktop that is most of a metre of card: it dominated the page,
          pushed everything else below the fold, and made a wallet-sized object
          read as a poster. `max-w` stops it at a plausible card while the
          `w-full` inside still lets it shrink on a phone, and the DOWNLOAD is
          untouched   that is still rasterised at 1440x900 from the same
          document, so a smaller preview costs no sharpness in the file.

          NO `overflow-hidden rounded-2xl` HERE, AND THAT IS THE WHOLE NOTE.
          This wrapper used to clip its child to a rounded box, which sounds
          harmless and was not: `rounded-2xl` is a FIXED 16px, while the card's
          own corners are 28 USER UNITS and therefore scale with however wide
          the SVG is drawn. Any wider than about 416px and the wrapper's squarer
          clip sliced the card's corner arcs clean off   leaving four straight
          rules that stopped short of the corners and looked like a border
          floating inside the card rather than tracing its edge. The SVG already
          rounds itself (`cardClip`), so the second clip was never doing work,
          only damage. */}
      <div
        className="w-full max-w-104 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Downloading before the code arrives would bake `/v/undefined` into a
            file the vendor then prints. Disabled until there is something real
            to encode. */}
        <Button
          size="sm"
          disabled={!!busy || !verifyUrl}
          onClick={() => download('png')}
          className="gap-2"
        >
          <Download className="size-4" /> {busy === 'png' ? 'Preparing…' : 'Download PNG'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy || !verifyUrl}
          onClick={() => download('pdf')}
          className="gap-2"
        >
          <FileText className="size-4" /> {busy === 'pdf' ? 'Preparing…' : 'PDF'}
        </Button>
        {verifyUrl && (
          <Button size="sm" variant="ghost" asChild className="gap-2">
            <a href={verifyUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Test the code
            </a>
          </Button>
        )}
        {onReissue && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy || reissuing}
            onClick={onReissue}
            className="text-content-muted hover:text-coral gap-2"
          >
            <RotateCcw className="size-4" /> {reissuing ? 'Reissuing…' : 'Lost your card?'}
          </Button>
        )}
      </div>

      <p className="text-content-muted flex items-start gap-2 text-xs">
        <QrCode className="mt-0.5 size-3.5 shrink-0" />
        {/* Said plainly, because it is the reason the card is worth carrying:
            the code is not a picture of a status, it is a lookup. */}
        Whoever scans this sees your status live they need no Sync account, and if your verification
        changes, every card already printed shows the new answer. The link works only from the card,
        so keep a lost one from being used by reissuing it above.
      </p>

      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}

// ── The document ────────────────────────────────────────────────────────────

function buildCard(o: {
  kind: CardKind;
  businessName?: string | null;
  holderName?: string | null;
  category?: string | null;
  area?: string | null;
  verifyUrl: string | null;
  state: { label: string; colour: string };
  memberSince?: string | null;
  facts?: { label: string; value: string }[];
  logoHref: string | null;
  rosetteHref: string | null;
  palette: Palette;
}) {
  const p = o.palette;

  // No code yet: draw the panel empty rather than encoding a placeholder. A QR
  // that resolves to "not a valid card" is worse than an obviously blank one.
  const qr = o.verifyUrl
    ? renderQr(o.verifyUrl, {
        size: 150,
        dark: LIME_DEEP,
        light: p.qrPanel,
        margin: 2,
        radius: 0.34,
      })
    : null;

  const since = o.memberSince
    ? new Date(o.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  // THE PERSON LEADS WHEN THERE IS ONE.
  //
  // A shop's card answers "is this business real". An agent's card answers
  // "should I open this door", and the thing being checked is a human being
  // so their name is the headline and the business becomes the context under
  // it. Falling back to the business name keeps the card correct for a vendor
  // who never filled in a personal name.
  const headline = o.holderName?.trim() || o.businessName || 'Sync account';
  const sub = [o.holderName?.trim() ? o.businessName : null, o.category, o.area]
    .filter(Boolean)
    .join(' · ');
  const initial = headline.trim().charAt(0).toUpperCase() || 'S';

  // The facts row: whatever the caller gave, plus the join date, capped at two.
  // Two is what fits on the grid beside the code panel, and a third would push
  // into the QR's quiet zone rather than wrap.
  const shown = [
    ...(since ? [{ label: 'ON SYNC SINCE', value: since }] : []),
    ...(o.facts ?? []),
  ].slice(0, 2);

  // Laid out on a grid rather than by eye: one gutter, one baseline rhythm.
  const PAD = 44;
  const QR_BOX = 178;
  const QR_X = W - PAD - QR_BOX;
  const QR_Y = H - PAD - QR_BOX - 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
  <defs>
    <clipPath id="logoClip"><circle cx="${PAD + 34}" cy="128" r="34"/></clipPath>
    <clipPath id="cardClip"><rect width="${W}" height="${H}" rx="28"/></clipPath>
    <!-- The sheen runs top-left to bottom-right, so the two OFF-diagonal
         corners sit at the midpoint stop. At 0.25 they faded to nothing and the
         border read as four separate rules instead of one edge   which on a
         dark card is the only thing marking where the card ends, because its
         ground is the same ink as the page behind it. 0.5 keeps the sheen and
         still traces the whole perimeter. -->
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.accent}" stop-opacity="0.9"/>
      <stop offset="0.45" stop-color="${p.accent}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${p.accent}" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${p.accent}" stop-opacity="${p.glowOpacity}"/>
      <stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g clip-path="url(#cardClip)">
    <rect width="${W}" height="${H}" fill="${p.bg}"/>

    <!-- The rosette, bled off the right edge so it reads as a watermark behind
         the content rather than as a logo competing with it. Its glow keeps the
         QR panel from sitting on a flat ground. -->
    ${
      o.rosetteHref
        ? `<image href="${esc(o.rosetteHref)}" x="${W - 300}" y="${H / 2 - 210}" width="420" height="420"
                  opacity="${p.rosetteOpacity}" preserveAspectRatio="xMidYMid meet"/>`
        : ''
    }
    <circle cx="${W - 90}" cy="${H / 2}" r="230" fill="url(#glow)"/>
  </g>

  <!-- A FULL STROKE WIDTH INSIDE THE VIEWPORT, not half of one.
       At x=1.25 with a 1.5 stroke, the outer 0.5 units sat on the viewBox
       boundary   and an SVG clips to its own viewport, so that half was shaved
       off at every size and the whole line thinned as the card scaled down.
       Offset by the stroke width and the edge is drawn whole. -->
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="26" fill="none"
        stroke="url(#edge)" stroke-width="2"/>

  <text x="${PAD}" y="54" fill="${p.accent}" font-size="11" letter-spacing="4.5" font-weight="600">
    ${esc(SITE.name.toUpperCase())} &#183; ${KIND_LABEL[o.kind]}
  </text>

  <!-- Identity block: mark, name, one line of context. The same composition as
       the profile card this sits under, so the two read as one object. -->
  ${
    o.logoHref
      ? `<image href="${esc(o.logoHref)}" x="${PAD}" y="94" width="68" height="68"
                preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/>`
      : `<text x="${PAD + 34}" y="140" fill="${p.accent}" font-size="30" font-weight="700"
               text-anchor="middle">${esc(initial)}</text>`
  }
  <circle cx="${PAD + 34}" cy="128" r="34" fill="none" stroke="${p.accent}" stroke-width="1.5"/>

  <text x="${PAD + 88}" y="122" fill="${p.text}" font-size="30" font-weight="700"
        letter-spacing="-0.5">${esc(fit(headline, 20))}</text>
  ${sub ? `<text x="${PAD + 88}" y="148" fill="${p.muted}" font-size="14">${esc(fit(sub, 34))}</text>` : ''}

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
    shown.length > 0
      ? `<g font-size="10" letter-spacing="1.6" fill="${p.muted}">
           ${shown.map((f, i) => `<text x="${PAD + i * 150}" y="278">${esc(f.label.toUpperCase())}</text>`).join('')}
         </g>
         <g font-size="16" font-weight="600" fill="${p.text}">
           ${shown.map((f, i) => `<text x="${PAD + i * 150}" y="300">${esc(fit(f.value, 16))}</text>`).join('')}
         </g>`
      : ''
  }

  <text x="${PAD}" y="356" fill="${p.muted}" font-size="10" letter-spacing="1.6">SCAN TO VERIFY</text>
  <text x="${PAD}" y="378" fill="${p.accent}" font-size="12">${esc(
    // The code is deliberately NOT printed as readable text. Writing it out
    // would let anyone who photographs the card type it in later   the whole
    // point of an unguessable address is that it lives in the QR and nowhere
    // a passing glance can capture.
    o.verifyUrl ? `${SITE.name.toLowerCase()} ·  scan the Qr code` : 'Preparing…',
  )}</text>

  <text x="${PAD}" y="${H - 34}" fill="${p.footer}" font-size="10" letter-spacing="1.2">
    Powered by ${esc(SITE.legalName)}
  </text>

  <!-- The code, on its own light panel, fully inside the card's padding. The
       panel stays light on a light card too: the quiet zone around a QR is part
       of the code, and cream-on-cream would erase it. -->
  <g transform="translate(${QR_X} ${QR_Y})">
    <rect width="${QR_BOX}" height="${QR_BOX}" rx="22" fill="${p.qrPanel}"
          stroke="${p.accent}" stroke-opacity="0.28" stroke-width="1"/>
    <g transform="translate(14 14)">${qr ? qr.inner : ''}</g>
  </g>
  <text x="${QR_X + QR_BOX / 2}" y="${QR_Y + QR_BOX + 24}" fill="${p.muted}" font-size="10"
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
