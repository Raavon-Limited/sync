import { MoreHorizontal } from "lucide-react";

const reviews = [
    { id: 1, initials: "MH", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", name: "John Doe", rating: 5.0, comment: "Delivery was really quick and the rider was polite.", order: "#SYNC-1048", type: "Food delivery", date: "Today, 2:34 PM", response: "Thank you so much! 🙏", responseDate: "Today, 3:10 PM" },
    { id: 2, initials: "TB", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400", name: "TasteBite Student", rating: 5.0, comment: "Great service! My food arrived hot and on time.", order: "#SYNC-1042", type: "Grocery delivery", date: "Yesterday, 7:18 PM", response: "Thanks for your support! 😊", responseDate: "Yesterday, 7:45 PM" },
    { id: 3, initials: "FC", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", name: "FreshCart User", rating: 4.0, comment: "Good delivery, but the restaurant took a while to prepare.", order: "#SYNC-1037", type: "Food delivery", date: "May 12, 6:45 PM", response: "Thanks for the feedback!", responseDate: "May 12, 7:02 PM" },
    { id: 4, initials: "SP", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400", name: "Sweet Palace", rating: 5.0, comment: "Super fast and very professional. Will order again!", order: "#SYNC-1032", type: "Food delivery", date: "May 11, 4:20 PM", response: "Appreciate it! Happy to help.", responseDate: "May 11, 4:40 PM" },
];

interface Props {
    activeStars: string;
    query: string;
}

export default function ReviewsList({ activeStars, query }: Props) {
    const filtered = reviews.filter((review) => {
        if (activeStars !== "All") {
            const starCount = parseInt(activeStars); // "5 ★" -> 5
            if (Math.floor(review.rating) !== starCount) return false;
        }

        if (query.trim()) {
            const q = query.trim().toLowerCase();
            const matchesName = review.name.toLowerCase().includes(q);
            const matchesOrder = review.order.toLowerCase().includes(q);
            if (!matchesName && !matchesOrder) return false;
        }

        return true;
    });

    return (
        <div className="space-y-3">
            {filtered.length === 0 ? (
                <div className="bg-panel rounded-xl border border-dashed border-line/20 p-8 text-center text-sm text-content-muted">
                    No reviews match your filters.
                </div>
            ) : (
                filtered.map((review) => (
                    <div key={review.id} className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs">
                        <div className="flex gap-4">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${review.color}`}>
                                {review.initials}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-semibold text-content">{review.name}</h4>
                                            <div className="flex items-center gap-0.5">
                                                {[...Array(5)].map((_, i) => (
                                                    <svg
                                                        key={i}
                                                        className={`w-3.5 h-3.5 ${i < Math.floor(review.rating)
                                                                ? "fill-amber-400 text-amber-400"
                                                                : "fill-content-muted/20 text-content-muted/20"
                                                            }`}
                                                        viewBox="0 0 20 20"
                                                    >
                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                ))}
                                                <span className="text-sm font-medium text-content ml-1">
                                                    {review.rating.toFixed(1)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-content mt-1.5 leading-relaxed">"{review.comment}"</p>
                                        <p className="text-xs text-content-muted mt-2">
                                            Order {review.order} · {review.type} · {review.date}
                                        </p>
                                    </div>

                                    <button className="p-1.5 text-content-muted hover:text-content rounded-lg hover:bg-content-muted/5 transition-colors flex-shrink-0">
                                        <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* {review.response && (
                                    <div className="mt-4">
                                        <div className="bg-lime/5 border border-lime/15 rounded-xl px-4 py-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-lime-deep dark:text-lime">Your Response</span>
                                                <span className="text-xs text-content-muted">{review.responseDate}</span>
                                            </div>
                                            <p className="text-sm text-content">{review.response}</p>
                                        </div>
                                    </div>
                                )} */}
                            </div>
                        </div>
                    </div>
                ))
            )}

            {filtered.length > 0 && (
                <div className="text-center pt-2">
                    <button className="text-sm font-medium text-lime-deep dark:text-lime hover:underline">
                        Load more reviews ↓
                    </button>
                </div>
            )}
        </div>
    );
}