"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

type MerchantPieData = {
  merchant_name: string;
  amount: number;
  txCount: number;
};

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

const MERCHANT_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f87171", // red-400
  "#a78bfa", // violet-400
  "#fb923c", // orange-400
  "#2dd4bf", // teal-400
  "#f472b6", // pink-400
  "#818cf8", // indigo-400
  "#4ade80", // green-400
];

function truncate(s: string, max = 18) {
  if (!s) return "(sin nombre)";
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export default function MerchantPieChart({ data }: { data: MerchantPieData[] }) {
  const safeData = Array.isArray(data) ? data : [];

  if (!safeData.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400">
        Sin datos para graficar.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={safeData}
            dataKey="amount"
            nameKey="merchant_name"
            cx="50%"
            cy="45%"
            outerRadius={70}
            innerRadius={30}
            paddingAngle={2}
            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {safeData.map((_, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={MERCHANT_COLORS[idx % MERCHANT_COLORS.length]}
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={1}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "#e2e8f0" }}
            formatter={(value, name, props) => {
              const row = props?.payload as MerchantPieData | undefined;
              const extra = row?.txCount != null ? ` (${row.txCount} mov.)` : "";
              return [`${fmtArs(Number(value))}${extra}`, name];
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            formatter={(value) => (
              <span className="text-slate-300">{truncate(String(value), 12)}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
