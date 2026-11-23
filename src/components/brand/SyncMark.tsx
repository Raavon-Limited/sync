"use client";

/**
 * Sync master mark: two halves of one circle.
 *
 *   <SyncMark size={28} />                     on Cream or white
 *   <SyncMark size={28} counter={color.cream} /> on Ink
 *   <SyncMark size={28} spinning />            the inline loader
 *   <SyncLockup height={28} />                 mark plus wordmark
 *
 * The wave seam between the halves is a real transparent gap, tapering to nothing
 * where it meets the rim. It is built into the two paths, so there is no mask and
 * no id to collide with, and the mark sits on any surface without a plate.
 */

import { useId } from "react";

const LIME = "#A3B18A"; // sage: the mark's accent half since the green system
const INK = "#344E41"; // forest

const LEFT = "M 50,10 C 61.9,10 61.9,50 48.4,50 C 34.9,50 34.9,90 50,90 A 40,40 0 0 1 50,10 Z";
const RIGHT = "M 50,10 C 65.1,10 65.1,50 51.6,50 C 38.1,50 38.1,90 50,90 A 40,40 0 0 0 50,10 Z";

export interface SyncMarkProps {
  /** Width and height in px. Defaults to 32. Never below 16. */
  size?: number;
  /** The lime half. Change only for single colour use. */
  accent?: string;
  /** The other half. Use Cream on Ink surfaces. Defaults to Ink. */
  counter?: string;
  /** Rotate the mark as a loading indicator. Rotation means waiting, nothing else. */
  spinning?: boolean;
  /** Accessible label. Omit for decorative use next to the wordmark. */
  title?: string;
  className?: string;
}

export default function SyncMark({
  size = 32,
  accent = LIME,
  counter = INK,
  spinning = false,
  title,
  className,
}: SyncMarkProps) {
  const raw = useId();
  const id = `sync-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {spinning && (
        <style>{`
      .${id}-spin { transform-origin: 50px 50px; animation: ${id}-rot 1.2s linear infinite; }
      @keyframes ${id}-rot { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .${id}-spin { animation-duration: 4s; } }
    `}</style>
      )}
      <g className={spinning ? `${id}-spin` : undefined}>
        <path d={LEFT} fill={accent} />
        <path d={RIGHT} fill={counter} />
      </g>
    </svg>
  );
}

/** Mark plus wordmark. Needs Bricolage Grotesque ExtraBold loaded. */
export function SyncLockup({
  height = 32,
  accent = LIME,
  counter = INK,
  word = INK,
  role,
}: {
  height?: number;
  accent?: string;
  counter?: string;
  word?: string;
  /** Optional role tag: "Landlord", "Student". Turns this into a dashboard logo. */
  role?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: height * 0.32 }}>
      <SyncMark size={height * 1.18} accent={accent} counter={counter} />
      <span
        style={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontWeight: 800,
          fontSize: height * 1.4,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: word,
        }}
      >
        Sync
      </span>
      {role && (
        <>
          <span
            style={{
              width: 2,
              height: height * 0.95,
              background: LIME,
              borderRadius: 2,
              marginLeft: height * 0.14,
            }}
          />
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: height * 0.42,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              color: word,
              opacity: 0.75,
              marginLeft: height * 0.14,
            }}
          >
            {role}
          </span>
        </>
      )}
    </span>
  );
}
