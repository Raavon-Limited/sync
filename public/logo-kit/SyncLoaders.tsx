"use client";

/**
 * Sync loaders.
 *
 * Two, and only two.
 *
 *   <SyncSpinner size={18} />            inline: buttons, rows, inputs
 *   <SyncBootLoader />                    full page: cold start, route change
 *
 * Both come from the master mark. Rotation and the running trace are the only
 * two motions in the system, and neither is used for anything except waiting.
 */

import { useId } from "react";
import SyncMark from "./SyncMark";

const LIME = "#C5FF4A";
const INK = "#0E0E12";
const CREAM = "#F4F1E8";
const SEAM = "M 50,10 A 24.8,24.8 0 0 1 50,50 A 24.8,24.8 0 0 0 50,90";
const LEFT = "M 50,10 A 24.8,24.8 0 0 1 50,50 A 24.8,24.8 0 0 0 50,90 A 40,40 0 0 1 50,10 Z";
const RIGHT = "M 50,10 A 24.8,24.8 0 0 1 50,50 A 24.8,24.8 0 0 0 50,90 A 40,40 0 0 0 50,10 Z";

export interface SyncSpinnerProps {
  /** Width and height in px. Defaults to 20. */
  size?: number;
  /** The lime half. */
  accent?: string;
  /** The other half. Use Cream on Ink surfaces. */
  counter?: string;
  label?: string;
}

/** The mark, rotating. Use anywhere the wait is short and in place. */
export function SyncSpinner({
  size = 20,
  accent = LIME,
  counter = INK,
  label = "Loading",
}: SyncSpinnerProps) {
  return <SyncMark size={size} accent={accent} counter={counter} spinning title={label} />;
}

export interface SyncBootLoaderProps {
  /** Width and height in px. Defaults to 132. */
  size?: number;
  /** Tile background. Defaults to Ink. */
  tile?: string;
  /** Trace colour. Defaults to Electric Lime. */
  accent?: string;
  label?: string;
}

/** The tile with a lime trace running its corner radius. Use for cold starts. */
export function SyncBootLoader({
  size = 132,
  tile = INK,
  accent = LIME,
  label = "Loading",
}: SyncBootLoaderProps) {
  const raw = useId();
  const id = `sync-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const s = 0.68;
  const off = 50 * (1 - s);

  return (
    <svg
      viewBox="-22 -22 144 144"
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      <style>{`
      .${id}-tr {
        stroke-dasharray: 118.5 337.4;
        animation: ${id}-run 1.5s linear infinite;
      }
      @keyframes ${id}-run { to { stroke-dashoffset: -455.9; } }
      @media (prefers-reduced-motion: reduce) {
        .${id}-tr { animation-duration: 5s; }
      }
    `}</style>
      <rect width="100" height="100" rx="26" fill={tile} />
      <mask id={`${id}-seam`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="#fff" />
        <path d={SEAM} fill="none" stroke="#000" strokeWidth={5} strokeLinecap="butt" />
      </mask>
      <g transform={`translate(${off},${off}) scale(${s})`}>
        <g mask={`url(#${id}-seam)`}>
          <path d={LEFT} fill={LIME} />
          <path d={RIGHT} fill={CREAM} />
        </g>
      </g>
      <rect
        className={`${id}-tr`}
        x="-16" y="-16" width="132" height="132" rx="42"
        fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
      />
    </svg>
  );
}

export default SyncSpinner;
