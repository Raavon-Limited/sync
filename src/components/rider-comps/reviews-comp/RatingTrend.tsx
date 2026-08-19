"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const data = [
  { date: "May 1", rating: 4.4 },
  { date: "May 7", rating: 4.5 },
  { date: "May 14", rating: 4.55 },
  { date: "May 21", rating: 4.65 },
  { date: "May 26", rating: 4.8 },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value?: number; name?: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-panel border border-line/15 rounded-lg px-3 py-2 text-xs shadow-xs">
      <p className="text-content-muted mb-0.5">{label}</p>
      <p className="text-content font-semibold">{payload[0].value?.toFixed(2)} ★</p>
    </div>
  );
}

export default function RatingTrend() {
  return (
    <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-content">Your Rating Trend</h3>
        <button className="text-xs text-lime-deep dark:text-lime font-medium hover:underline">
          View more
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-3xl font-bold text-content">4.8</span>
        <svg className="w-6 h-6 fill-amber-400 text-amber-400" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </div>
      <p className="text-sm text-lime-deep dark:text-lime mb-4">Steady improvement</p>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-line/15" />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-content-muted"
            />
            <YAxis hide domain={[4.2, 5]} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="#65a30d"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#65a30d" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}