/**
 * The range picker. The page is a server component that reads the window from
 * the URL, so choosing a range navigates rather than setting local state — the
 * new numbers have to be fetched, and a `useState` here could only re-render
 * the same data under a different label.
 */
"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { RANGES, type TimeRange } from "../data";

const OPTIONS = Object.keys(RANGES) as TimeRange[];

export function TimeRangeSelector({ value }: { value: TimeRange }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  function choose(next: TimeRange) {
    setOpen(false);
    // Kept in the URL so a range is shareable and survives a refresh.
    startTransition(() => router.push(`/admin/analytics?range=${encodeURIComponent(next)}`));
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-panel flex items-center gap-2 border border-line/10 rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 transition-colors shadow-sm" >
        {value}
        {pending ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : (
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-20 bg-panel border border-line/15 rounded-xl shadow-xl py-1.5 w-40 overflow-hidden">
          {OPTIONS.map(o => (
            <button
              key={o}
              onClick={() => choose(o)}
              className={`flex items-center justify-between w-full px-4 py-2 text-sm transition-colors ${
                o === value
                  ? "text-[#5a9e00] font-bold bg-lime-50"
                  : " hover:bg-gray-50 font-medium"
              }`} >
              {o}
              {o === value && <span className="text-[#90d505] text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
