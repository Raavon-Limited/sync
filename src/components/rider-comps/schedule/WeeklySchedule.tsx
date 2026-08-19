"use client";

import { useState } from "react";
import { Clock, Copy, Check } from "lucide-react";

const daysOfWeek = [
    { id: "mon", label: "Monday" }, { id: "tue", label: "Tuesday" }, { id: "wed", label: "Wednesday" },
    { id: "thu", label: "Thursday" }, { id: "fri", label: "Friday" }, { id: "sat", label: "Saturday" }, { id: "sun", label: "Sunday" },
];

type DaySchedule = { enabled: boolean; start: string; end: string };

const initialSchedule: Record<string, DaySchedule> = {
    mon: { enabled: true, start: "08:00", end: "18:00" },
    tue: { enabled: true, start: "08:00", end: "18:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "08:00", end: "18:00" },
    fri: { enabled: true, start: "08:00", end: "20:00" },
    sat: { enabled: true, start: "10:00", end: "16:00" },
    sun: { enabled: false, start: "10:00", end: "14:00" },
};

export default function WeeklySchedule() {
    const [schedule, setSchedule] = useState(initialSchedule);
    const [copied, setCopied] = useState(false);

    const toggleDay = (id: string) => {
        setSchedule((prev) => ({ ...prev, [id]: { ...prev[id], enabled: !prev[id].enabled } }));
    };

    const updateTime = (id: string, field: "start" | "end", value: string) => {
        setSchedule((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    };

    const applyToAll = () => {
        const template = schedule.mon;
        const newSchedule = { ...schedule };
        daysOfWeek.forEach((day) => { newSchedule[day.id] = { ...template }; });
        setSchedule(newSchedule);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
                <div>
                    <h3 className="font-semibold text-content text-sm">Weekly schedule</h3>
                    <p className="text-xs text-content-muted mt-0.5">
                        Set your preferred working hours for each day
                    </p>
                </div>
                <button
                    onClick={applyToAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-lime-deep dark:text-lime bg-lime/10 hover:bg-lime/15 rounded-lg transition-colors"
                >
                    {copied ? <><Check className="w-3.5 h-3.5" /> Applied</> : <><Copy className="w-3.5 h-3.5" /> Apply Mon to all</>}
                </button>
            </div>

            <div className="space-y-2">
                {daysOfWeek.map((day) => {
                    const dayData = schedule[day.id];
                    return (
                        <div
                            key={day.id}
                            className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border transition-colors ${dayData.enabled ? "border-lime/20 bg-lime/5" : "border-line/10 bg-surface"
                                }`}
                        >
                            <div className="flex items-center gap-3 sm:w-32 flex-shrink-0">
                                <button
                                    onClick={() => toggleDay(day.id)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 flex-shrink-0 ${dayData.enabled ? "bg-lime" : "bg-content-muted/20"
                                        }`}
                                >
                                    <span
                                        style={{ transform: dayData.enabled ? "translateX(24px)" : "translateX(4px)" }}
                                        className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-300 ease-in-out"
                                    />
                                </button>
                                <span className={`text-sm font-medium ${dayData.enabled ? "text-content" : "text-content-muted"}`}>
                                    {day.label}
                                </span>
                            </div>

                            {dayData.enabled ? (
                                <div className="flex items-center gap-2 flex-1 flex-wrap">
                                    <Clock className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
                                    <input
                                        type="time"
                                        value={dayData.start}
                                        onChange={(e) => updateTime(day.id, "start", e.target.value)}
                                        className="px-2.5 py-1.5 text-xs bg-panel border border-line/15 rounded-lg outline-none focus:border-lime/50 text-content"
                                    />
                                    <span className="text-content-muted text-xs">to</span>
                                    <input
                                        type="time"
                                        value={dayData.end}
                                        onChange={(e) => updateTime(day.id, "end", e.target.value)}
                                        className="px-2.5 py-1.5 text-xs bg-panel border border-line/15 rounded-lg outline-none focus:border-lime/50 text-content"
                                    />
                                </div>
                            ) : (
                                <p className="text-xs text-content-muted">Unavailable</p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 pt-4 border-t border-line/10 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-content-muted">Changes apply from next Monday</p>
                <button className="px-4 py-2 bg-lime hover:brightness-95 text-ink text-sm font-semibold rounded-lg transition-all">
                    Save schedule
                </button>
            </div>
        </div>
    );
}