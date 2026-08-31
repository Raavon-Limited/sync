import StatusToggle from "@/components/rider-comps/schedule/StatusToggle";
import WeeklySchedule from "@/components/rider-comps/schedule/WeeklySchedule";
import PeakHours from "@/components/rider-comps/schedule/PeakHours";
import ZonePreferences from "@/components/rider-comps/schedule/ZonePreferences";
import TimeOffSection from "@/components/rider-comps/schedule/TimeOffSection";

export default function SchedulePage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-content">Schedule</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Control when you want to work and set your preferred hours.
                </p>
            </div>

            {/* Status - full width */}
            <StatusToggle />

            {/* Row 1: Weekly Schedule (wider) + Peak Hours */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                    <WeeklySchedule />
                </div>
                <div>
                    <PeakHours />
                </div>
            </div>

            {/* Row 2: Zone Preferences + Time Off (side by side) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ZonePreferences />
                <TimeOffSection />
            </div>
        </div>
    );
}