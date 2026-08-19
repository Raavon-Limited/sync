"use client";

import { useState } from "react";
import { CalendarOff, Plus } from "lucide-react";

const upcomingTimeOff = [
    { id: 1, title: "Exam Week", from: "May 20", to: "May 24", status: "Approved" },
    { id: 2, title: "Family Event", from: "Jun 5", to: "Jun 6", status: "Pending" },
];

export default function TimeOffSection({ className = "" }: { className?: string }) {
    const [showForm, setShowForm] = useState(false);

    return (
        <div className={`bg-panel rounded-xl border border-line/15 p-5 shadow-xs flex flex-col ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <CalendarOff className="w-4 h-4 text-purple-500" />
                    <h3 className="font-semibold text-content text-sm">Time off</h3>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-lime-deep dark:text-lime hover:underline"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Request
                </button>
            </div>

            {showForm && (
                <div className="mb-4 p-4 bg-surface rounded-lg border border-line/10 space-y-3">
                    <input
                        type="text"
                        placeholder="Reason (e.g. Exam, Travel)"
                        className="w-full text-sm bg-panel border border-line/15 rounded-lg px-3 py-2 outline-none focus:border-lime/50 text-content placeholder:text-content-muted"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="date"
                            className="text-sm bg-panel border border-line/15 rounded-lg px-3 py-2 outline-none focus:border-lime/50 text-content"
                        />
                        <input
                            type="date"
                            className="text-sm bg-panel border border-line/15 rounded-lg px-3 py-2 outline-none focus:border-lime/50 text-content"
                        />
                    </div>
                    <button className="w-full py-2 bg-lime text-ink text-sm font-semibold rounded-lg hover:brightness-95 transition-all">
                        Submit request
                    </button>
                </div>
            )}

            <div className="space-y-2.5">
                {upcomingTimeOff.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-line/10"
                    >
                        <div>
                            <p className="text-sm font-medium text-content">{item.title}</p>
                            <p className="text-xs text-content-muted">{item.from} – {item.to}</p>
                        </div>
                        <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${item.status === "Approved"
                                ? "bg-lime/15 text-lime-deep dark:text-lime"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}
                        >
                            {item.status}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}