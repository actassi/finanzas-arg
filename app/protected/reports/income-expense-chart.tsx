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

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

type Row = { label: string; value: number };

const COLORS = {
  income: "#A7F3D0",  // pastel mint
  expense: "#FBCFE8", // pastel pink
  net: "#BFDBFE",     // pastel blue
};

export default function IncomeExpenseChart(props: {
  income: number;
  expense: number; // expense+fee recomendado
}) {
  const income = Number(props.income ?? 0);
  const expense = Number(props.expense ?? 0);
  const net = income - expense;

  const data: Row[] = [
    { label: "Ingresos", value: income },
    { label: "Egresos", value: expense },
    { label: "Neto", value: net },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
          <Tooltip formatter={(v) => fmtArs(Number(v))} />

          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((r) => {
              const key = r.label === "Ingresos" ? "income" : r.label === "Egresos" ? "expense" : "net";
              return <Cell key={r.label} fill={COLORS[key]} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
