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
};

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

/**
 * Paleta pastel (sobre fondo oscuro funciona bien).
 * Si querés “más suave”, subí lightness; si querés “más vivo”, subí saturation.
 */
const PASTEL_PALETTE = [
  "#A7F3D0", // mint
  "#BFDBFE", // light blue
  "#FBCFE8", // pink
  "#FDE68A", // warm yellow
  "#DDD6FE", // lavender
  "#BAE6FD", // sky
  "#FECACA", // soft red
  "#BBF7D0", // soft green
  "#F9A8D4", // rose
  "#C7D2FE", // periwinkle
  "#99F6E4", // teal
  "#FED7AA", // peach
];

/** Hash simple y estable para asignar color por categoría */
function hashStringToIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

function colorForCategory(category: string) {
  const idx = hashStringToIndex(category ?? "", PASTEL_PALETTE.length);
  return PASTEL_PALETTE[idx];
}

export default function ReportsChart({ data }: { data: Row[] }) {
  const safeData = Array.isArray(data) ? data : [];

  if (!safeData.length) {
    return <div className="text-sm text-muted-foreground">Sin datos para graficar.</div>;
  }

  // Opcional: asegurar orden descendente por importe (si tu RPC ya lo trae así, no hace falta)
  const chartData = [...safeData].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 32 }}
        >
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
            {chartData.map((r) => (
              <Cell key={r.category} fill={colorForCategory(r.category)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
