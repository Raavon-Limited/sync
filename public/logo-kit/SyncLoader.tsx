"use client";

/**
 * Sync loader.
 * Three variants matching the three identity directions.
 *
 * <SyncLoader variant="monogram" size={48} />
 * <SyncLoader variant="grid" size={64} color="#F4F1E8" />
 * <SyncLoader variant="roofline" />
 *
 * Pure SVG and CSS, no dependencies. Respects prefers-reduced-motion.
 */

import { useId } from "react";

const INK = "#0E0E12";
const LIME = "#C5FF4A";

export type SyncLoaderVariant = "monogram" | "grid" | "roofline";

export interface SyncLoaderProps {
  /** Which mark to animate. Defaults to "grid". */
  variant?: SyncLoaderVariant;
  /** Rendered width and height in px. Defaults to 48. */
  size?: number;
  /** Colour of the mark. Use Cream on dark surfaces. Defaults to Ink. */
  color?: string;
  /** Accent colour. Defaults to Electric Lime. */
  accent?: string;
  /** Accessible label. Set to "" to hide from assistive tech. */
  label?: string;
  className?: string;
}

export default function SyncLoader({
  variant = "grid",
  size = 48,
  color = INK,
  accent = LIME,
  label = "Loading",
  className,
}: SyncLoaderProps) {
  const raw = useId();
  const id = `sync-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;

  const common = {
    width: size,
    height: size,
    viewBox: variant === "monogram" ? "-11 -11 122 122" : "0 0 100 100",
    xmlns: "http://www.w3.org/2000/svg",
    role: label ? ("img" as const) : ("presentation" as const),
    "aria-label": label || undefined,
    "aria-hidden": label ? undefined : true,
    className,
  };

  if (variant === "monogram") {
    return (
      <svg {...common}>
        <style>{`
      .${id}-trace {
        stroke-dasharray: 92.4 263.0;
        animation: ${id}-trace 1.5s linear infinite;
      }
      @keyframes ${id}-trace { to { stroke-dashoffset: -355.4; } }
      @media (prefers-reduced-motion: reduce) {
        .${id}-trace { animation-duration: 4.5s; }
      }
    `}</style>
        <g transform="translate(23.73,19.00)">
          <path d="M26.31395348837209 61.99999999999999Q20.546511627906973 61.99999999999999 15.860465116279068 60.91860465116278Q11.174418604651162 59.837209302325576 7.749999999999999 57.62936046511628Q4.325581395348836 55.42151162790697 2.3430232558139528 51.997093023255815Q0.3604651162790695 48.57267441860465 0.0 44.06686046511628L12.706395348837209 39.831395348837205Q12.97674418604651 43.616279069767444 14.869186046511626 46.13953488372093Q16.76162790697674 48.66279069767442 19.960755813953487 49.87936046511628Q23.15988372093023 51.09593023255813 27.124999999999996 51.09593023255813Q30.909883720930228 51.09593023255813 33.4781976744186 50.149709302325576Q36.04651162790698 49.20348837209302 37.35319767441861 47.716569767441854Q38.65988372093023 46.229651162790695 38.65988372093023 44.51744186046511Q38.65988372093023 42.534883720930225 36.94767441860465 41.228197674418595Q35.23546511627907 39.92151162790697 32.26162790697674 38.97529069767441Q29.287790697674414 38.029069767441854 25.32267441860465 37.127906976744185Q20.816860465116278 36.04651162790697 16.49127906976744 34.784883720930225Q12.165697674418603 33.52325581395348 8.651162790697672 31.495639534883715Q5.136627906976743 29.46802325581395 3.109011627906976 26.268895348837205Q1.081395348837209 23.069767441860463 1.081395348837209 18.20348837209302Q1.081395348837209 12.706395348837205 3.874999999999999 8.651162790697672Q6.66860465116279 4.595930232558139 12.075581395348834 2.2979651162790695Q17.48255813953488 0.0 25.412790697674417 0.0Q33.252906976744185 0.0 38.75 2.2529069767441854Q44.247093023255815 4.505813953488371 47.22093023255814 8.515988372093023Q50.19476744186046 12.526162790697676 50.46511627906977 17.843023255813954L37.48837209302326 21.537790697674417Q37.48837209302326 18.92441860465116 36.63226744186046 16.941860465116278Q35.776162790697676 14.959302325581397 34.24418604651163 13.652616279069768Q32.71220930232558 12.345930232558139 30.459302325581397 11.670058139534884Q28.20639534883721 10.99418604651163 25.32267441860465 10.99418604651163Q21.898255813953487 10.99418604651163 19.51017441860465 11.805232558139537Q17.12209302325581 12.616279069767444 15.950581395348834 13.92296511627907Q14.779069767441857 15.229651162790695 14.779069767441857 16.941860465116278Q14.779069767441857 19.104651162790695 16.626453488372093 20.501453488372093Q18.473837209302324 21.89825581395349 21.672965116279066 22.844476744186046Q24.87209302325581 23.790697674418603 28.74709302325581 24.691860465116278Q32.622093023255815 25.502906976744185 36.76744186046511 26.719476744186046Q40.91279069767442 27.936046511627907 44.51744186046511 29.918604651162788Q48.122093023255815 31.901162790697672 50.32994186046511 35.28052325581395Q52.53779069767442 38.659883720930225 52.53779069767442 43.79651162790697Q52.53779069767442 49.29360465116279 49.60901162790698 53.393895348837205Q46.68023255813954 57.49418604651162 40.82267441860465 59.74709302325581Q34.96511627906977 61.99999999999999 26.31395348837209 61.99999999999999Z" fill={color} />
        </g>
        <rect
          className={`${id}-trace`}
          x="0" y="0" width="100" height="100" rx="26"
          fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round"
        />
      </svg>
    );
  }

  if (variant === "roofline") {
    return (
      <svg {...common}>
        <style>{`
      .${id}-house {
        stroke-dasharray: 152;
        stroke-dashoffset: 152;
        animation: ${id}-draw 1.8s ease-in-out infinite;
      }
      .${id}-pulse {
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: ${id}-pulse 1.8s ease-in-out infinite;
      }
      @keyframes ${id}-draw {
        0% { stroke-dashoffset: 152; }
        45%, 72% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -152; }
      }
      @keyframes ${id}-pulse {
        0%, 42% { opacity: 0; transform: translateY(8px); }
        58%, 76% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-6px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .${id}-house { animation: none; stroke-dashoffset: 0; }
        .${id}-pulse { animation: none; opacity: 1; }
      }
    `}</style>
        <path
          className={`${id}-house`}
          d="M 25,82 L 25,55 L 50,36 L 75,55 L 75,82"
          fill="none" stroke={color} strokeWidth="13"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          className={`${id}-pulse`}
          d="M 34,30 L 50,18 L 66,30"
          fill="none" stroke={accent} strokeWidth="12"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <style>{`
      .${id}-cell {
        transform-box: fill-box;
        transform-origin: center;
        animation: ${id}-pop 1.15s ease-in-out infinite;
      }
      .${id}-c0 { animation-delay: 0.00s; }
      .${id}-c1 { animation-delay: 0.09s; }
      .${id}-c2 { animation-delay: 0.18s; }
      .${id}-c3 { animation-delay: 0.27s; }
      .${id}-c4 { animation-delay: 0.36s; }
      .${id}-c5 { animation-delay: 0.45s; }
      .${id}-c6 { animation-delay: 0.54s; }
      .${id}-c7 { animation-delay: 0.63s; }
      .${id}-core {
        transform-box: fill-box;
        transform-origin: center;
        animation: ${id}-core 1.15s ease-in-out infinite;
      }
      @keyframes ${id}-pop {
        0%, 60%, 100% { transform: scale(0.72); opacity: 0.35; }
        22% { transform: scale(1); opacity: 1; }
      }
      @keyframes ${id}-core {
        0%, 100% { transform: scale(0.88); }
        50% { transform: scale(1.08); }
      }
      @media (prefers-reduced-motion: reduce) {
        .${id}-cell, .${id}-core { animation: none; opacity: 1; }
      }
    `}</style>
      <rect className={`${id}-cell ${id}-c0`} x="4" y="4" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c1`} x="38" y="4" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c2`} x="72" y="4" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c3`} x="72" y="38" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c4`} x="72" y="72" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c5`} x="38" y="72" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c6`} x="4" y="72" width="24" height="24" rx="7.5" fill={color} />
        <rect className={`${id}-cell ${id}-c7`} x="4" y="38" width="24" height="24" rx="7.5" fill={color} />
      <circle className={`${id}-core`} cx="50" cy="50" r="13" fill={accent} />
    </svg>
  );
}
