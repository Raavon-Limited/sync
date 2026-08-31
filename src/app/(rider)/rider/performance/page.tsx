import OverallScoreCards from "@/components/rider-comps/performance-comp/OverallScoreCards";
import PerformanceChart from "@/components/rider-comps/performance-comp/PerformanceChart";
import WeeklyGoal from "@/components/rider-comps/performance-comp/WeeklyGoal";
import DeliveryPerformance from "@/components/rider-comps/performance-comp/DeliveryPerformance";
import RecentPerformanceTable from "@/components/rider-comps/performance-comp/RecentPerformanceTable";
import WhatYoureDoingWell from "@/components/rider-comps/performance-comp/WhatYoureDoingWell";
import AreasToImprove from "@/components/rider-comps/performance-comp/AreasToImprove";

export default function PerformancePage() {
    return (
        <div className="space-y-4 transition-colors duration-300">

            {/* Header Block */}
            <div className="mb-2 select-none">
                <p className="text-[11px] font-semibold tracking-widest text-content-muted uppercase">
                    Rider . Performance
                </p>
                <h1 className="text-2xl font-bold font-display text-content">Performance</h1>
                <p className="text-xs sm:text-sm text-content-muted mt-0.5">
                    Track your delivery performance and monitor real-time operational growth.
                </p>
            </div>

            {/* Overall Score Cards Grid */}
            <OverallScoreCards />

            {/* Main Visual Matrix: 7:5 Ratio Split with Smooth Rounded Cards */}
            {/* Main Visual Matrix: Side-by-side layout */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch w-full mt-6">
                <div className="flex-[7] min-w-0 w-full">
                    <PerformanceChart />
                </div>
                <div className="min-w-0 w-full">
                    <WeeklyGoal /> {/* Ensure the component inside stretches */}
                </div>
            </div>

            {/* Operational Deep-Dive Block */}
            <DeliveryPerformance />

            {/* Insights Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                <WhatYoureDoingWell />
                <AreasToImprove />
            </div>

            {/* Data Stream Table */}
            <RecentPerformanceTable />

        </div>
    );
}