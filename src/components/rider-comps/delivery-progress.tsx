// components/rider-comps/delivery-progress.tsx
import { Check, Package, Gift } from "lucide-react";

interface Props {
  delivered: number;
  milestones: number[];
  bonusAmount?: number;
}

export function DeliveryProgress({ delivered, milestones, bonusAmount = 1000 }: Props) {
  const nextMilestone = milestones.find((m) => m > delivered);
  const remaining = nextMilestone ? nextMilestone - delivered : 0;

  return (
    <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
      <p className="font-semibold text-content text-sm">Today's progress</p>
      <p className="text-content-muted text-xs mt-0.5">Keep it up! You're doing great.</p>

      {/* Timeline */}
      <div className="mt-5 relative flex justify-between">
        {/* Progress line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-line/20" />
        <div
          className="absolute top-4 left-0 h-0.5 bg-lime-deep dark:bg-lime transition-all"
          style={{
            width: `${Math.min(
              (delivered / milestones[milestones.length - 1]) * 100,
              100
            )}%`,
          }}
        />

        {milestones.map((milestone, i) => {
          const reached = delivered >= milestone;
          const isCurrent = !reached && (i === 0 || delivered >= milestones[i - 1]);

          return (
            <div key={milestone} className="relative z-10 flex flex-col items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                  reached
                    ? "bg-lime-deep dark:bg-lime border-lime-deep dark:border-lime"
                    : isCurrent
                    ? "bg-panel border-lime-deep dark:border-lime"
                    : "bg-panel border-line/25"
                }`}
              >
                {reached ? (
                  <Check size={14} strokeWidth={3} className="text-white dark:text-ink" />
                ) : (
                  <Package
                    size={13}
                    strokeWidth={2}
                    className={isCurrent ? "text-lime-deep dark:text-lime" : "text-content-muted"}
                  />
                )}
              </div>
              <p className="text-[11px] text-content-muted whitespace-nowrap">
                {milestone} deliveries
              </p>
            </div>
          );
        })}
      </div>

      {/* Bonus CTA */}
      {nextMilestone && (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-lime/10 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-lime/20 flex items-center justify-center shrink-0">
              <Gift size={15} className="text-lime-deep dark:text-lime" />
            </div>
            <p className="text-sm text-content">
              Complete <span className="font-semibold">{remaining}</span> more{" "}
              {remaining === 1 ? "delivery" : "deliveries"} to unlock a{" "}
              <span className="font-semibold">₦{bonusAmount.toLocaleString()}</span> bonus
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-line/20 bg-panel px-3.5 py-1.5 text-xs font-semibold text-content hover:bg-content-muted/5 transition-colors"
          >
            View incentives
          </button>
        </div>
      )}
    </div>
  );
}