"use client";

/**
 * Sync section icons. One family, one grid, one lime element each.
 *
 * The mark colour follows currentColor, so icons invert for free:
 *   <SyncIcon name="hostels" size={20} />
 *   <SyncIcon name="around-you" title="Around you" className="text-cream" />
 */

import type { ReactNode, SVGProps } from "react";

export const SYNC_ICON_NAMES = [
  "around-you", "hostels", "events", "food", "beauty", "workmanship", "laundry", "hot-spots", "student", "landlord", "about",
] as const;

export type SyncIconName = (typeof SYNC_ICON_NAMES)[number];

export const SYNC_ICON_LABELS: Record<SyncIconName, string> = {
  "around-you": "Around you", "hostels": "Hostels", "events": "Events", "food": "Food", "beauty": "Beauty", "workmanship": "Workmanship", "laundry": "Laundry", "hot-spots": "Hot spots", "student": "Student", "landlord": "Landlord", "about": "About",
};

const PATHS: Record<SyncIconName, ReactNode> = {
  "around-you": (
    <><rect x="12" y="12" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="40" y="12" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="68" y="12" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="12" y="40" width="20" height="20" rx="6.5" fill="currentColor" /><circle cx="50" cy="50" r="11" fill="var(--sync-accent, #C5FF4A)" /><rect x="68" y="40" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="12" y="68" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="40" y="68" width="20" height="20" rx="6.5" fill="currentColor" /><rect x="68" y="68" width="20" height="20" rx="6.5" fill="currentColor" /></>
  ),
  "hostels": (
    <><path d="M 22,82 L 22,54 L 50,32 L 78,54 L 78,82" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 38,26 L 50,16 L 62,26" fill="none" stroke="var(--sync-accent, #C5FF4A)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></>
  ),
  "events": (
    <><path d="M 20,32 h 60 a 10,10 0 0 1 10,10 v 36 a 10,10 0 0 1 -10,10 h -60 a 10,10 0 0 1 -10,-10 v -36 a 10,10 0 0 1 10,-10 z" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 32,20 v 16" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 68,20 v 16" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><circle cx="50" cy="64" r="9" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "food": (
    <><path d="M 18,48 A 32,32 0 0 0 82,48" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 30,48 L 70,48" fill="none" stroke="var(--sync-accent, #C5FF4A)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></>
  ),
  "beauty": (
    <><path d="M 41,22 C 41,45.1 50.9,55 74,55 C 50.9,55 41,64.9 41,88 C 41,64.9 31.1,55 8,55 C 31.1,55 41,45.1 41,22 Z" fill="currentColor" /><path d="M 76,8 C 76,19.9 81.1,25 93,25 C 81.1,25 76,30.1 76,42 C 76,30.1 70.9,25 59,25 C 70.9,25 76,19.9 76,8 Z" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "workmanship": (
    <><path d="M 78.29,42.60 A 15,15 0 1 1 73.50,21.01" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" /><path d="M 56,45 L 28,73" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="73" r="7" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "laundry": (
    <><path d="M 24,14 h 52 a 12,12 0 0 1 12,12 v 60 a 12,12 0 0 1 -12,12 h -52 a 12,12 0 0 1 -12,-12 v -60 a 12,12 0 0 1 12,-12 z" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 22,38 L 78,38" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /><circle cx="70" cy="26" r="5.5" fill="currentColor" /><circle cx="50" cy="64" r="16" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "hot-spots": (
    <><path d="M 50,88 C 36,88 24,78 24,62 C 24,46 40,38 44,14 C 56,26 76,42 76,62 C 76,78 64,88 50,88 Z" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 50,82 C 43,82 37,77 37,70 C 37,61 46,57 48,46 C 55,53 63,61 63,70 C 63,77 57,82 50,82 Z" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "student": (
    <><path d="M 10,42 L 50,24 L 90,42 L 50,60 Z" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 26,50 L 26,72 C 26,72 36,82 50,82 C 64,82 74,72 74,72 L 74,50" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 84,45 L 84,70" fill="none" stroke="var(--sync-accent, #C5FF4A)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></>
  ),
  "landlord": (
    <><path d="M 22,84 L 22,52 L 50,30 L 78,52 L 78,84" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><circle cx="50" cy="60" r="9" fill="var(--sync-accent, #C5FF4A)" /><rect x="46" y="66" width="8" height="14" rx="4" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
  "about": (
    <><path d="M 50,50 m -36,0 a 36,36 0 1 0 72,0 a 36,36 0 1 0 -72,0" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><path d="M 50,46 L 50,68" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /><circle cx="50" cy="31" r="6" fill="var(--sync-accent, #C5FF4A)" /></>
  ),
};

export interface SyncIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: SyncIconName;
  /** Width and height in px. Defaults to 24. Never below 16. */
  size?: number;
  /** Accessible label. Omit when a visible text label sits beside it. */
  title?: string;
}

export default function SyncIcon({ name, size = 24, title, ...rest }: SyncIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
