"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Account, Category, TransactionType } from "@/types/db";

type BatchUI = {
  id: string;
  account_id: string;
  label: string;
  due_date: string | null;
  cut_off_date: string | null;
};

type Props = {
  basePath: string;
  accounts: Account[];
  categories: Category[];
  batches: BatchUI[];
  initial: {
    from: string;
    to: string;
    accountId: string;
    batchId: string;
    type: TransactionType | "";
    categoryId: string;
    q: string;
    uncategorized: boolean;
    per: number;

    useDate: boolean; // “Fecha”
    budget: boolean; // “Presupuesto mensual”
    budgetMonth: string; // YYYY-MM
  };
};

export default function TransactionsFiltersClient({
  basePath,
  accounts,
  categories,
  batches,
  initial,
}: Props) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const [accountId, setAccountId] = useState(initial.accountId);
  const [batchId, setBatchId] = useState(initial.batchId);

  const [useDate, setUseDate] = useState(initial.useDate);

  const [budget, setBudget] = useState(initial.budget);
  const [budgetMonth, setBudgetMonth] = useState(initial.budgetMonth);

  const [type, setType] = useState<TransactionType | "">(initial.type);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [q, setQ] = useState(initial.q);
  const [uncategorized, setUncategorized] = useState(initial.uncategorized);
  const [per, setPer] = useState(String(initial.per));

  const selectedBatch = useMemo(
    () => (batchId ? batches.find((b) => b.id === batchId) ?? null : null),
    [batchId, batches]
  );

  // UI logic:
  // - budget ON: manda budget=1 + budgetMonth; “Fecha” y “Resumen” quedan deshabilitados (sin romper estado).
  // - budget OFF: se respeta la lógica anterior.
  const disableDateInputs = budget || !useDate;
  const disableUseDate = budget;
  const disableBatch = budget;

  const batchesFiltered = useMemo(() => {
    let list = accountId ? batches.filter((b) => b.account_id === accountId) : batches;
    if (selectedBatch && !list.some((b) => b.id === selectedBatch.id)) {
      list = [selectedBatch, ...list];
    }
    return list;
  }, [accountId, batches, selectedBatch]);

  const hint = useMemo(() => {
    if (budget)
      return "Alcance: Presupuesto mensual (TC por vencimiento del resumen + manuales por date dentro del mes).";

    if (!useDate && batchId) return "Alcance: solo transacciones del resumen (sin filtro por fecha).";
    if (!useDate && !batchId) return "Alcance: todas las transacciones (sin filtro por fecha).";
    if (useDate && batchId) return "Alcance: resumen dentro del rango (date).";
    return "Alcance: solo manuales dentro del rango (date).";
  }, [budget, useDate, batchId]);

  return (
    <form method="get" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
      {/* Presupuesto mensual */}
      <div className="md:col-span-4">
        <label className="text-xs text-slate-300">Presupuesto mensual</label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="budget"
            type="checkbox"
            name="budget"
            value="1"
            checked={budget}
            onChange={(e) => {
              const on = e.target.checked;
              setBudget(on);
              if (on) setUseDate(false); // solo UI; server prioriza budget igualmente
            }}
            className="h-4 w-4 accent-emerald-500"
          />
          <label htmlFor="budget" className="text-sm text-slate-200">
            Presupuesto mensual
          </label>

          <input
            type="month"
            name="budgetMonth"
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(e.target.value)}
            disabled={!budget}
            className="ml-auto w-[170px] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
          />
        </div>

        <div className="mt-1 text-[11px] text-slate-400">
          Si está activo, incluye TC por vencimiento del resumen y manuales por fecha dentro del mes.
        </div>
      </div>

      {/* Desde */}
      <div className="md:col-span-2">
        <label className="text-xs text-slate-300">Desde</label>

        {disableDateInputs ? (
          <div className="mt-1 space-y-2">
            {budget ? (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                Mes: <span className="ml-2 text-slate-100">{budgetMonth || "—"}</span>
              </span>
            ) : batchId ? (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                Vencimiento:{" "}
                <span className="ml-2 text-slate-100">{selectedBatch?.due_date ?? "—"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                Sin filtro de fecha
              </span>
            )}
          </div>
        ) : (
          <input
            type="date"
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        {disableDateInputs ? <input type="hidden" name="from" value={from} /> : null}

        <div className="mt-2 flex items-center gap-2">
          <input
            id="useDate"
            type="checkbox"
            name="useDate"
            value="1"
            checked={useDate}
            onChange={(e) => setUseDate(e.target.checked)}
            disabled={disableUseDate}
            className="h-4 w-4 accent-emerald-500 disabled:opacity-60"
          />
          <label htmlFor="useDate" className={`text-sm ${disableUseDate ? "text-slate-500" : "text-slate-200"}`}>
            Fecha
          </label>
        </div>

        <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
      </div>

      {/* Hasta */}
      <div className="md:col-span-2">
        <label className="text-xs text-slate-300">Hasta</label>

        {disableDateInputs ? (
          <div className="mt-1">
            {budget ? (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                —
              </span>
            ) : batchId ? (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                Cierre:{" "}
                <span className="ml-2 text-slate-100">{selectedBatch?.cut_off_date ?? "—"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                —
              </span>
            )}
          </div>
        ) : (
          <input
            type="date"
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        {disableDateInputs ? <input type="hidden" name="to" value={to} /> : null}
      </div>

      {/* Cuenta */}
      <div className="md:col-span-3">
        <label className="text-xs text-slate-300">Cuenta</label>
        <select
          name="account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </div>

      {/* Resumen */}
      <div className="md:col-span-5">
        <label className="text-xs text-slate-300">Resumen (PDF importado)</label>
        <select
          name="batch"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          disabled={disableBatch}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        >
          <option value="">(Sin resumen)</option>
          {batchesFiltered.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-slate-400">
          En “Presupuesto mensual” el resumen no aplica (se toma por vencimiento del mes).
        </div>
      </div>

      {/* Tipo */}
      <div className="md:col-span-2">
        <label className="text-xs text-slate-300">Tipo</label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todos</option>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="payment">Pago</option>
          <option value="transfer">Transferencia</option>
          <option value="fee">Comisión</option>
          <option value="other">Otro</option>
        </select>
      </div>

      {/* Categoría */}
      <div className="md:col-span-3">
        <label className="text-xs text-slate-300">Categoría</label>
        <select
          name="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={uncategorized}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.subcategory ? ` / ${c.subcategory}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Buscar */}
      <div className="md:col-span-3">
        <label className="text-xs text-slate-300">Buscar</label>
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej: mercadopago, shell..."
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Sin categoría */}
      <div className="md:col-span-2 flex items-center gap-2">
        <input
          id="uncategorized"
          type="checkbox"
          name="uncategorized"
          value="1"
          checked={uncategorized}
          onChange={(e) => setUncategorized(e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        <label htmlFor="uncategorized" className="text-sm text-slate-200">
          Sin categoría
        </label>
      </div>

      {/* Por página */}
      <div className="md:col-span-2">
        <label className="text-xs text-slate-300">Por página</label>
        <select
          name="per"
          value={per}
          onChange={(e) => setPer(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </div>

      <input type="hidden" name="page" value="1" />

      <div className="md:col-span-2 flex gap-2 justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Aplicar
        </button>
        <Link
          href={basePath}
          className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
