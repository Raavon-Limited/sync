import { Star, Clock, Heart } from "lucide-react";

const highlights = [
    {
        icon: Star,
        iconBg: "bg-lime/10 text-lime-deep dark:text-lime",
        title: "Students appreciate",
        text: "Fast delivery, friendliness",
    },
    {
        icon: Clock,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        title: "Areas to improve",
        text: "Occasional restaurant delays",
    },
    {
        icon: Heart,
        iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
        title: "Overall sentiment",
        text: "Very positive",
    },
];

export default function ReviewHighlights() {
    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs h-full flex flex-col">
            <h3 className="font-semibold text-content mb-4">Review Highlights</h3>

            <div className="space-y-4 flex-1 justify-around flex flex-col">
                {highlights.map((item) => (
                    <div key={item.title} className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${item.iconBg}`}>
                            <item.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-content">{item.title}</p>
                            <p className="text-sm text-content-muted mt-0.5">{item.text}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}