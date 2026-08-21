"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
    placeholder: string;
    options: string[];
    onSelect: (value: string) => void;
    accentClass?: string; // e.g. text-lime-deep dark:text-lime, or text-red-600 dark:text-red-400
}

export function ZoneDropdown({ placeholder, options, onSelect, accentClass = "text-lime-deep dark:text-lime" }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs bg-surface border border-line/15 rounded-lg px-3 py-2 outline-none focus:border-lime/50 text-content-muted hover:text-content transition-colors"
            >
                {placeholder}
                <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && options.length > 0 && (
                <div className="absolute z-20 mt-1.5 w-full rounded-lg border border-line/15 bg-panel shadow-lg overflow-hidden">
                    {options.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => { onSelect(opt); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs text-content hover:bg-lime/10 hover:${accentClass} transition-colors`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}

            {open && options.length === 0 && (
                <div className="absolute z-20 mt-1.5 w-full rounded-lg border border-line/15 bg-panel shadow-lg px-3 py-2 text-xs text-content-muted">
                    No more zones available
                </div>
            )}
        </div>
    );
}