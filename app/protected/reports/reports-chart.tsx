"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type Row = {
  day: string;
  expense: number;
  income: number;
  payment: number;
  fee: number;
  transfer: number;
};

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

export default function ReportsChart({ data }: { data: Row[] }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground">Sin datos para graficar.</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
          <Tooltip formatter={(value) => fmtArs(Number(value))} />
          <Legend />

          <Area type="monotone" dataKey="expense" name="Gastos" />
          <Area type="monotone" dataKey="fee" name="Fees" />
          <Area type="monotone" dataKey="income" name="Ingresos" />
          <Area type="monotone" dataKey="payment" name="Pagos" />
          <Area type="monotone" dataKey="transfer" name="Transferencias" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
