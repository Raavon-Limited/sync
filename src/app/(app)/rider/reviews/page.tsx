import RatingSummary from "@/components/rider-comps/reviews-comp/RatingSummary";
import ReviewsSection from "@/components/rider-comps/reviews-comp/ReviewsSection";
import RatingTrend from "@/components/rider-comps/reviews-comp/RatingTrend";
import ReviewHighlights from "@/components/rider-comps/reviews-comp/ReviewHighlights";

export default function ReviewsPage() {
    return (
        <div className="space-y-6 transition-colors duration-300">

            {/* Header Block */}
            <div className="select-none">
                <h1 className="text-2xl font-bold font-display text-content">Reviews</h1>
                <p className="text-xs sm:text-sm text-content-muted mt-0.5">
                    See what students are saying about your deliveries.
                </p>
            </div>

            {/* Top Rating Breakdown & Summary Metrics Grid */}
            <RatingSummary />

            {/* Filter bar + reviews feed — full width */}
            <ReviewsSection />

            {/* Rating Trend + Review Highlights — side by side, matching admin's chart pair */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <RatingTrend />
                <ReviewHighlights />
            </div>
        </div>
    );
}