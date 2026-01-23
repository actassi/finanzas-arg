"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

type CategoryPieData = {
  category: string;
  category_id: string | null;
  amount: number;
  txCount: number;
  color: string | null;
};

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function isCssColor(s: string) {
  const v = (s ?? "").trim();
  if (!v) return false;
  return (
    v.startsWith("#") ||
    v.startsWith("rgb(") ||
    v.startsWith("rgba(") ||
    v.startsWith("hsl(") ||
    v.startsWith("hsla(")
  );
}

const FALLBACK_COLORS = [
  "#64748b", "#94a3b8", "#475569", "#334155", "#6b7280",
  "#9ca3af", "#4b5563", "#374151", "#71717a", "#a1a1aa",
];

function truncate(s: string, max = 12) {
  if (!s) return "(sin cat.)";
  return s.length > max ? s.slice(0, max) + ".." : s;
}

export default function CategoryPieChart({ data }: { data: CategoryPieData[] }) {
  const safeData = Array.isArray(data) ? data : [];

  if (!safeData.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400">
        Sin datos para graficar.
      </div>
    );
  }

  const colorFor = (r: CategoryPieData, idx: number) => {
    if (r.color && isCssColor(r.color)) return r.color;
    if (!r.category_id) return "#f59e0b"; // Sin categoria = amber
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={safeData}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="45%"
            outerRadius={70}
            innerRadius={30}
            paddingAngle={2}
            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {safeData.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={colorFor(entry, idx)}
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
              const row = props?.payload as CategoryPieData | undefined;
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
              <span className="text-slate-300">{truncate(String(value))}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
