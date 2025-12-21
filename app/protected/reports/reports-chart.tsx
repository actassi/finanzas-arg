"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

type Row = {
  category: string;
  amount: number;
  txCount?: number;
  category_id?: string | null;
  color?: string | null;
};

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
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

export default function ReportsChart({ data }: { data: Row[] }) {
  const safeData = Array.isArray(data) ? data : [];

  if (!safeData.length) {
    return <div className="text-sm text-muted-foreground">Sin datos para graficar.</div>;
  }

  const chartData = [...safeData].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0));

  const colorFor = (r: Row) => {
    if (r.color && isCssColor(r.color)) return r.color;
    if (!r.category_id) return "#f59e0b"; // Sin categoría
    return "#64748b"; // fallback (slate)
  };

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis
            dataKey="category"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => {
              const n = Number(v || 0);
              if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
              if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
              return `${Math.round(n)}`;
            }}
          />

          <Tooltip
            formatter={(value, _name, props) => {
              const v = Number(value || 0);
              const row = props?.payload as Row | undefined;
              const extra = row?.txCount != null ? ` · ${row.txCount} mov.` : "";
              return [`${fmtArs(v)}${extra}`, "Importe"];
            }}
            labelFormatter={(label) => `Categoría: ${label}`}
          />

          <Bar dataKey="amount" name="Importe ARS" radius={[8, 8, 0, 0]}>
            {chartData.map((r, idx) => (
              <Cell
                key={`${r.category_id ?? "null"}-${r.category}-${idx}`}
                fill={colorFor(r)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
