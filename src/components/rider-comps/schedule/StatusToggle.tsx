"use client";

import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export default function StatusToggle() {
    const [isOnline, setIsOnline] = useState(true);

    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
                <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${isOnline ? "bg-lime/15 text-lime-deep dark:text-lime" : "bg-content-muted/10 text-content-muted"
                        }`}
                >
                    {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </div>
                <div>
                    <p className="text-xs text-content-muted">Current status</p>
                    <p className="font-semibold text-content text-base mt-0.5">
                        {isOnline ? "You're online" : "You're offline"}
                    </p>
                    <p className="text-xs text-content-muted mt-0.5">
                        {isOnline
                            ? "Receiving jobs in your preferred zones"
                            : "You won't receive any new delivery requests"}
                    </p>
                </div>
            </div>

            {/* Plain switch — label lives outside it now, not crammed inside */}
            <button
                type="button"
                onClick={() => setIsOnline(!isOnline)}
                aria-pressed={isOnline}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors duration-300 ${isOnline ? "bg-lime" : "bg-content-muted/20"
                    }`}
            >
                <span
                    style={{ transform: isOnline ? "translateX(24px)" : "translateX(4px)" }}
                    className="inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-300 ease-in-out"
                />
            </button>
        </div>
    );
}