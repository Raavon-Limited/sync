"use client";

/**
 * Sync loaders. Three, and no fourth.
 *
 *   <SyncSpinner size={18} />                 inline: buttons, rows, inputs
 *   <SyncBootLoader />                        full page: cold start, route change
 *   <SyncSectionLoader name="hostels" />      entering or refetching a section
 *
 * Rotation and the running trace are the only two motions in the identity.
 * Neither is used for anything except waiting. If a wait fits none of these,
 * it is a skeleton block, not a loader.
 */

import { useId } from "react";
import SyncMark from "./SyncMark";
import SyncIcon, { type SyncIconName, SYNC_ICON_LABELS } from "./SyncIcon";

const LIME = "#A3B18A"; // sage
const INK = "#344E41"; // forest
const CREAM = "#F2F1EA"; // paper

export interface SyncSpinnerProps {
  size?: number;
  accent?: string;
  counter?: string;
  label?: string;
}

/** The mark, rotating. Short waits that happen in place. */
export function SyncSpinner({
  size = 20,
  accent = LIME,
  counter = INK,
  label = "Loading",
}: SyncSpinnerProps) {
  return <SyncMark size={size} accent={accent} counter={counter} spinning title={label} />;
}

interface TraceTileProps {
  size?: number;
  tile?: string;
  accent?: string;
  track?: string;
  label: string;
  children: React.ReactNode;
}

/** Shared shell: a tile with a sage trace running its corner radius. */
function TraceTile({ size = 132, tile = INK, accent = LIME, track, label, children }: TraceTileProps) {
  const raw = useId();
  const id = `sync-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const trackColor = track ?? (tile === INK ? "rgba(244,241,232,.18)" : "rgba(14,14,18,.13)");

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
      @media (prefers-reduced-motion: reduce) { .${id}-tr { animation-duration: 5s; } }
    `}</style>
      <rect width="100" height="100" rx="26" fill={tile} />
      {children}
      <rect
        x="-16" y="-16" width="132" height="132" rx="42"
        fill="none" stroke={trackColor} strokeWidth="6"
      />
      <rect
        className={`${id}-tr`}
        x="-16" y="-16" width="132" height="132" rx="42"
        fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
      />
    </svg>
  );
}

/** The tile with the master mark inside. Cold start and full page transitions. */
export function SyncBootLoader({
  size = 132,
  tile = INK,
  accent = LIME,
  label = "Loading",
}: { size?: number; tile?: string; accent?: string; label?: string }) {
  return (
    <TraceTile size={size} tile={tile} accent={accent} label={label}>
      <g transform="translate(16,16) scale(0.68)">
        <SyncMark size={100} accent={LIME} counter={CREAM} />
      </g>
    </TraceTile>
  );
}

/** The same tile with a section icon inside. Entering or refetching a section. */
export function SyncSectionLoader({
  name,
  size = 132,
  tile = INK,
  accent = LIME,
  icon = CREAM,
}: {
  name: SyncIconName;
  size?: number;
  tile?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <TraceTile size={size} tile={tile} accent={accent} label={`Loading ${SYNC_ICON_LABELS[name]}`}>
      <g transform="translate(20,20) scale(0.60)" style={{ color: icon }}>
        <SyncIcon name={name} size={100} />
      </g>
    </TraceTile>
  );
}

export default SyncSpinner;
