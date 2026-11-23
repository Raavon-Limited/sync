"use client";
import { useState } from "react";
import type { GrowthPoint } from "./data";

interface GrowthChartProps {
  data: GrowthPoint[];
}

const W = 580;
const H = 220;
const P = { top: 20, right: 20, bottom: 36, left: 55 };
const CW = W - P.left - P.right;
const CH = H - P.top - P.bottom;

export function GrowthChart({ data }: GrowthChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  // A campus platform does not start with thousands of users, so the 2,500
  // step the mock data implied would flatten every real reading to the axis.
  const maxVal = Math.max(0, ...data.map(d => d.users));
  const rawStep = maxVal / 4;
  const mag = rawStep > 0 ? Math.pow(10, Math.floor(Math.log10(rawStep))) : 1;
  const step = [1, 2, 5, 10].map(f => f * mag).find(v => v >= rawStep) ?? mag * 10;
  const yMax   = Math.max(step * 4, 4);
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i));

  const pts = data.map((d, i) => ({
    x: P.left + (i / Math.max(data.length - 1, 1)) * CW,
    y: P.top + CH - (d.users / yMax) * CH,
    ...d,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Area fill path
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${P.top + CH} L ${pts[0].x} ${P.top + CH} Z`;

  return (
    <div className="bg-panel rounded-2xl border border-line/10 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-content">User Growth</h3>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full">↑ Trending up</span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#a3b18a" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#a3b18a" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y grid + labels */}
          {yTicks.map(tick => {
            const y = P.top + CH - (tick / yMax) * CH;
            return (
              <g key={tick}>
                <line x1={P.left} x2={W - P.right} y1={y} y2={y}
                  stroke="#f0f0f0" strokeWidth="1" />
                <text x={P.left - 8} y={y + 4} textAnchor="end"
                  fontSize="10" fill="#aaa" fontFamily="system-ui">
                  {tick === 0 ? "0" : tick >= 1000 ? `${tick / 1000}k` : tick}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#areaGrad)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#a3b18a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points */}
          {pts.map((p, i) => {
            const isHov = hovered === i;
            return (
              <g key={p.month}>
                <circle cx={p.x} cy={p.y} r={isHov ? 7 : 4}
                  fill={isHov ? "#a3b18a" : "white"} stroke="#a3b18a" strokeWidth="2"
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                {/* Month label */}
                <text x={p.x} y={H - P.bottom + 16} textAnchor="middle"
                  fontSize="11" fill={isHov ? "#44633f" : "#999"}
                  fontFamily="system-ui" fontWeight={isHov ? "700" : "400"}>
                  {p.month}
                </text>

                {/* Tooltip */}
                {isHov && (
                  <g>
                    {/* Vertical guide */}
                    <line x1={p.x} x2={p.x} y1={p.y + 8} y2={P.top + CH}
                      stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                    <rect x={p.x - 44} y={p.y - 40} width={88} height={30} rx="6"
                      fill="white" stroke="#e5e7eb" strokeWidth="1"
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))" />
                    <text x={p.x} y={p.y - 28} textAnchor="middle" fontSize="10" fill="#999" fontFamily="system-ui">{p.month}</text>
                    <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize="11" fill="#44633f" fontFamily="system-ui" fontWeight="700">
                      {p.users.toLocaleString()} users
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
