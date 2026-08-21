"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { ZoneDropdown } from "./ZoneDropdown";

const availableZones = [
    "Main Campus", "Engineering Hostel", "Medical Hostel", "Science Village",
    "Staff Quarters", "Off-Campus (Ikeja)", "Off-Campus (Yaba)",
];

export default function ZonePreferences() {
    const [preferred, setPreferred] = useState(["Main Campus", "Engineering Hostel", "Science Village"]);
    const [avoided, setAvoided] = useState(["Staff Quarters"]);

    const addPreferred = (zone: string) => {
        if (!preferred.includes(zone)) {
            setPreferred([...preferred, zone]);
            setAvoided(avoided.filter((z) => z !== zone));
        }
    };
    const removePreferred = (zone: string) => setPreferred(preferred.filter((z) => z !== zone));
    const addAvoided = (zone: string) => {
        if (!avoided.includes(zone)) {
            setAvoided([...avoided, zone]);
            setPreferred(preferred.filter((z) => z !== zone));
        }
    };
    const removeAvoided = (zone: string) => setAvoided(avoided.filter((z) => z !== zone));

    const remaining = (excludeList: string[], otherList: string[]) =>
        availableZones.filter((z) => !excludeList.includes(z) && !otherList.includes(z));

    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-accent-fg" />
                <h3 className="font-semibold text-content text-sm">Zone preferences</h3>
            </div>
            <p className="text-xs text-content-muted mb-4">
                Choose where you prefer to deliver and areas you'd rather avoid.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <p className="text-xs font-medium text-content mb-2.5">Preferred zones</p>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {preferred.map((zone) => (
                            <span key={zone} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-lime/10 text-xs rounded-full text-accent-fg">
                                {zone}
                                <button onClick={() => removePreferred(zone)}><X className="w-3 h-3" /></button>
                            </span>
                        ))}
                    </div>
                    <ZoneDropdown
                        placeholder="+ Add preferred zone"
                        options={remaining(preferred, avoided)}
                        onSelect={addPreferred}
                        accentClass="text-lime-deep dark:text-lime"
                    />
                </div>

                <div>
                    <p className="text-xs font-medium text-content mb-2.5">Areas to avoid</p>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {avoided.map((zone) => (
                            <span key={zone} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-600 dark:text-red-400 text-xs rounded-full">
                                {zone}
                                <button onClick={() => removeAvoided(zone)}><X className="w-3 h-3" /></button>
                            </span>
                        ))}
                        {avoided.length === 0 && <span className="text-xs text-content-muted">None selected</span>}
                    </div>
                    <ZoneDropdown
                        placeholder="+ Add area to avoid"
                        options={remaining(avoided, preferred)}
                        onSelect={addAvoided}
                        accentClass="text-accent-fg"
                    />
                </div>
            </div>
        </div>
    );
}