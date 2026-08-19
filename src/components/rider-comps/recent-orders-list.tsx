// components/rider-comps/recent-orders-list.tsx
import type { RiderOrder } from "@/lib/rider/types";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const COLORS = [
  "bg-blue-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-teal-500",
];

export function RecentOrdersList({ orders }: { orders: RiderOrder[] }) {
  if (orders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-content-muted">
        No completed deliveries yet
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-line/10">
      {orders.map((order, idx) => {
        const color = COLORS[idx % COLORS.length];
        const time = new Date(order.createdAt).toLocaleTimeString("en-NG", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const date = new Date(order.createdAt).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "short",
        });

        // Use whatever money field you actually have
        const amount =
          (order as any).total ??
          (order as any).amount ??
          (order as any).deliveryFee ??
          0;

        return (
          <div
            key={order.id}
            className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
          >
            {/* Time */}
            <div className="w-14 shrink-0 text-right">
              <p className="text-xs font-medium text-content">{time}</p>
              <p className="text-[10px] text-content-muted">{date}</p>
            </div>

            {/* Avatar initials */}
            <div
              className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
            >
              {getInitials(order.vendorName)}
            </div>

            {/* Vendor + address */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-content truncate">
                {order.vendorName}
              </p>
              <p className="text-xs text-content-muted truncate">
                → {order.deliveryAddress}
              </p>
            </div>

            {/* Amount + status */}
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-content">
                ₦{Number(amount).toLocaleString()}
              </p>
              <span className="inline-block mt-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium px-2 py-0.5">
                Completed
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}