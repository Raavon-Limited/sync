import { CheckCircle2, Clock, ClipboardCheck, Star, ThumbsUp } from "lucide-react";

const items = [
    { label: "On-time deliveries", value: "96%", icon: Clock },
    { label: "Completion rate", value: "98%", icon: ClipboardCheck },
    { label: "Customer rating", value: "4.9 ★", icon: Star },
    { label: "Acceptance rate", value: "94%", icon: ThumbsUp },
];

export default function WhatYoureDoingWell() {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <h3 className="text-sm font-bold text-content">What you’re doing well</h3>
            </div>
            <div className="space-y-2.5">
                {items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-2 rounded-xl hover:bg-line/5 transition">
                        <div className="flex items-center gap-2.5">
                            <item.icon size={15} className="text-content-muted" />
                            <span className="text-xs font-medium text-content">{item.label}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-600">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}