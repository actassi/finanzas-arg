// app/(protected)/transactions/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, TransactionType } from "@/types/db";
import TransactionsTableClient from "./TransactionsTableClient";

type TxRow = {
  id: string;
  user_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description_raw: string;
  merchant_name: string | null;
  category_id: string | null;
  amount: number;
  type: TransactionType;
  import_batch_id: string | null;
  created_at: string;

  receipt?: string | null;
  installment_number?: number | null;
  installments_total?: number | null;
};

type ImportBatchRow = {
  id: string;
  user_id: string;
  account_id: string;
  created_at: string; // timestamptz
  provider: string | null;
  institution: string | null;
  file_name: string | null;
  due_date: string | null; // date
  cut_off_date: string | null; // date
  statement_period_start: string | null; // date
  statement_period_end: string | null; // date
  note: string | null;
};

function firstDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

function lastDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
}

function getParam(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function buildQueryString(
  sp: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>
) {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") params.set(k, val);
  }

  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, v);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function formatMoneyARS(n: number, currency = "ARS") {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return Number(n).toFixed(2);
  }
}

function batchLabel(b: ImportBatchRow) {
  const ref = b.due_date ?? (b.created_at ? b.created_at.slice(0, 10) : "");
  const provider = b.provider ? b.provider.toUpperCase() : "PDF";
  const note = b.note ? ` · ${b.note}` : "";
  const file = b.file_name ? ` · ${b.file_name}` : "";
  return `${provider} · ${ref}${note}${file}`;
}

export default async function TransactionsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  // claims + user (tu flujo actual)
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const sp = await props.searchParams;

  const accountId = getParam(sp, "account") ?? "";
  const type = (getParam(sp, "type") ?? "") as TransactionType | "";
  const categoryId = getParam(sp, "category") ?? "";
  const q = (getParam(sp, "q") ?? "").trim();
  const uncategorized = getParam(sp, "uncategorized") === "1";

  // NUEVO: batch y control de fecha secundaria
  const batchId = getParam(sp, "batch") ?? "";
  const hasBatch = !!batchId;

  // Si hay batch: por defecto NO filtrar por fecha (a menos que useDate=1)
  const useDateParam = getParam(sp, "useDate") === "1";
  const useDate = hasBatch ? useDateParam : true;

  // Valores crudos desde URL (sirven para UI y, si useDate, para filtrar)
  const fromParam = getParam(sp, "from") ?? "";
  const toParam = getParam(sp, "to") ?? "";

  const per = Math.min(Math.max(Number(getParam(sp, "per") ?? "50") || 50, 10), 200);
  const page = Math.max(Number(getParam(sp, "page") ?? "1") || 1, 1);

  const fromIdx = (page - 1) * per;
  const toIdx = fromIdx + per - 1;

  const [
    { data: accountsData },
    { data: categoriesData },
    { data: batchesData, error: batchesErr },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, user_id, name, type, institution, currency, credit_limit, cut_off_day, due_day, interest_rate, created_at"
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, user_id, name, subcategory, is_essential, color, created_at")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("import_batches")
      .select(
        "id,user_id,account_id,created_at,provider,institution,file_name,due_date,cut_off_date,statement_period_start,statement_period_end,note"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const accounts = (accountsData ?? []) as Account[];
  const categories = (categoriesData ?? []) as Category[];

  const allBatches = (batchesData ?? []) as ImportBatchRow[];
  const selectedBatch = batchId ? allBatches.find((b) => b.id === batchId) ?? null : null;

  // Si filtrás por cuenta, aplicalo al dropdown, pero asegurá que el batch seleccionado siga apareciendo
  let batches = accountId ? allBatches.filter((b) => b.account_id === accountId) : allBatches;
  if (selectedBatch && !batches.some((b) => b.id === selectedBatch.id)) {
    batches = [selectedBatch, ...batches];
  }

  if (batchesErr) {
    console.error("Error cargando import_batches:", batchesErr);
  }

  // Sugerencias de período basadas en el batch (para UI)
  const suggestedFrom =
    selectedBatch?.statement_period_start ??
    selectedBatch?.cut_off_date ??
    "";
  const suggestedTo =
    selectedBatch?.statement_period_end ??
    selectedBatch?.due_date ??
    "";

  // Valores por defecto para inputs (UI)
  const fromUi = hasBatch ? (fromParam || suggestedFrom || "") : (fromParam || firstDayOfMonthISO());
  const toUi = hasBatch ? (toParam || suggestedTo || "") : (toParam || lastDayOfMonthISO());

  // Valores efectivos para filtrar por fecha (solo si corresponde)
  const fromEff =
    (!hasBatch || useDate)
      ? (hasBatch ? (fromParam || suggestedFrom || "") : (fromParam || firstDayOfMonthISO()))
      : undefined;

  const toEff =
    (!hasBatch || useDate)
      ? (hasBatch ? (toParam || suggestedTo || "") : (toParam || lastDayOfMonthISO()))
      : undefined;

  // Query transacciones paginadas
  let txQ = supabase
    .from("transactions")
    .select(
      "id,user_id,account_id,date,description_raw,merchant_name,category_id,amount,type,import_batch_id,created_at,receipt,installment_number,installments_total",
      { count: "exact" }
    )
    .eq("user_id", user.id);

  // 1) Batch primero
  if (batchId) txQ = txQ.eq("import_batch_id", batchId);

  // 2) Fecha secundaria (solo si no hay batch o si useDate=1)
  if (!hasBatch || useDate) {
    if (fromEff) txQ = txQ.gte("date", fromEff);
    if (toEff) txQ = txQ.lte("date", toEff);
  }

  if (accountId) txQ = txQ.eq("account_id", accountId);
  if (type) txQ = txQ.eq("type", type);

  if (uncategorized) txQ = txQ.is("category_id", null);
  else if (categoryId) txQ = txQ.eq("category_id", categoryId);

  if (q) {
    const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    txQ = txQ.or(`merchant_name.ilike.${like},description_raw.ilike.${like}`);
  }

  const { data: txData, error: txErr, count } = await txQ
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (txErr) console.error("Error cargando transactions:", txErr);

  const rows = (txData ?? []) as TxRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / per), 1);

  /**
   * TOTALES
   * - Si hay batch: calculo totales por query directa (refleja el batch y respeta filtros).
   * - Si NO hay batch: uso tu RPC existente.
   */
  let totals:
    | null
    | {
        total: number;
        expense: number;
        income: number;
        payment: number;
        transfer: number;
        fee: number;
        other: number;
        count: number;
      } = null;

  if (batchId) {
    let totalsQ = supabase
      .from("transactions")
      .select("amount,type,category_id,merchant_name,description_raw", { count: "exact" })
      .eq("user_id", user.id)
      .eq("import_batch_id", batchId)
      .range(0, 4999);

    // Fecha secundaria
    if (useDate) {
      if (fromEff) totalsQ = totalsQ.gte("date", fromEff);
      if (toEff) totalsQ = totalsQ.lte("date", toEff);
    }

    if (accountId) totalsQ = totalsQ.eq("account_id", accountId);
    if (type) totalsQ = totalsQ.eq("type", type);

    if (uncategorized) totalsQ = totalsQ.is("category_id", null);
    else if (categoryId) totalsQ = totalsQ.eq("category_id", categoryId);

    if (q) {
      const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      totalsQ = totalsQ.or(`merchant_name.ilike.${like},description_raw.ilike.${like}`);
    }

    const { data: allRows, error: allErr, count: allCount } = await totalsQ;

    if (allErr) {
      console.error("Totales por batch (query directa) error:", allErr);
      totals = null;
    } else {
      const acc = {
        total: 0,
        expense: 0,
        income: 0,
        payment: 0,
        transfer: 0,
        fee: 0,
        other: 0,
        count: Number(allCount ?? 0),
      };

      for (const r of allRows ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const t = String((r as any).type ?? "other") as TransactionType | "other";

        acc.total += amount;
        if (t === "expense") acc.expense += amount;
        else if (t === "income") acc.income += amount;
        else if (t === "payment") acc.payment += amount;
        else if (t === "transfer") acc.transfer += amount;
        else if (t === "fee") acc.fee += amount;
        else acc.other += amount;
      }

      totals = acc;
    }
  } else {
    const { data: totalsData, error: totalsErr } = await supabase.rpc("tx_totals", {
      p_user_id: user.id,
      p_from: fromEff ?? firstDayOfMonthISO(),
      p_to: toEff ?? lastDayOfMonthISO(),
      p_account_id: accountId || null,
      p_type: type || null,
      p_category_id: uncategorized ? null : categoryId || null,
      p_uncategorized: uncategorized,
      p_q: q || null,
    });

    if (totalsErr) console.error("tx_totals RPC error:", totalsErr);
    totals = (Array.isArray(totalsData) ? totalsData[0] : null) as any;
  }

  // Conteo “sin categoría” (misma base + batch + fecha secundaria)
  let uncQ = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (batchId) uncQ = uncQ.eq("import_batch_id", batchId);

  if (!hasBatch || useDate) {
    if (fromEff) uncQ = uncQ.gte("date", fromEff);
    if (toEff) uncQ = uncQ.lte("date", toEff);
  }

  if (accountId) uncQ = uncQ.eq("account_id", accountId);
  if (type) uncQ = uncQ.eq("type", type);

  if (q) {
    const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    uncQ = uncQ.or(`merchant_name.ilike.${like},description_raw.ilike.${like}`);
  }

  uncQ = uncQ.is("category_id", null);

  const { count: uncategorizedCount, error: uncErr } = await uncQ;
  if (uncErr) console.error("uncategorized count error:", uncErr);

  const basePath = "/protected/transactions";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Transacciones</h1>
          <div className="text-sm text-slate-300">
            Mostrando {rows.length} de {totalCount} (página {page} de {totalPages})
          </div>

          {selectedBatch ? (
            <div className="mt-2 text-xs text-slate-300">
              <span className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 inline-flex items-center">
                Resumen seleccionado:{" "}
                <span className="ml-2 text-slate-100 font-medium">
                  {batchLabel(selectedBatch)}
                </span>
              </span>
              {!useDate ? (
                <div className="mt-1 text-[11px] text-slate-400">
                  El rango de fechas no filtra mientras haya un Resumen seleccionado (activá “Filtrar por fecha” si lo necesitás).
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link
            href="/protected/reports"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Ir a Visualizaciones
          </Link>
          <Link
            href="/protected/transactions/import-pdf"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            Importar PDF
          </Link>
        </div>
      </div>

      {/* Totales */}
      <div className="text-right text-sm text-slate-300">
        <div>
          Total filtro:{" "}
          <span className="text-slate-100 font-medium">
            {formatMoneyARS(Number(totals?.total ?? 0))}
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Gastos: {formatMoneyARS(Number(totals?.expense ?? 0))} · Ingresos:{" "}
          {formatMoneyARS(Number(totals?.income ?? 0))} · Pagos:{" "}
          {formatMoneyARS(Number(totals?.payment ?? 0))}
        </div>
      </div>

      {/* Atajo “Sin categoría” */}
      <div className="flex items-center gap-2">
        <Link
          href={
            basePath +
            buildQueryString(sp, {
              uncategorized: "1",
              category: "",
              page: "1",
            })
          }
          className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/15"
        >
          Sin categoría
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-100 border border-amber-500/30">
            {uncategorizedCount ?? 0}
          </span>
        </Link>

        {uncategorized && (
          <Link
            href={basePath + buildQueryString(sp, { uncategorized: "", page: "1" })}
            className="text-sm text-slate-300 hover:text-slate-100"
          >
            Quitar filtro
          </Link>
        )}
      </div>

      {/* Filtros */}
      <form method="get" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Desde</label>
          <input
            type="date"
            name="from"
            defaultValue={fromUi}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Hasta</label>
          <input
            type="date"
            name="to"
            defaultValue={toUi}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-xs text-slate-300">Cuenta</label>
          <select
            name="account"
            defaultValue={accountId}
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

        {/* Selector de resumen PDF */}
        <div className="md:col-span-5">
          <label className="text-xs text-slate-300">Resumen (PDF importado)</label>
          <select
            name="batch"
            defaultValue={batchId}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {batchLabel(b)}
              </option>
            ))}
          </select>
          <div className="mt-1 text-[11px] text-slate-400">
            Consejo: cargá <span className="text-slate-200">Vencimiento</span> y{" "}
            <span className="text-slate-200">Nota</span> al importar para poder encontrarlo luego.
          </div>
        </div>

        {/* Fecha secundaria: sólo tiene efecto si hay batch y se activa */}
        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="useDate"
            type="checkbox"
            name="useDate"
            value="1"
            defaultChecked={useDate}
            className="h-4 w-4 accent-emerald-500"
          />
          <label htmlFor="useDate" className="text-sm text-slate-200">
            Filtrar por fecha
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Tipo</label>
          <select
            name="type"
            defaultValue={type}
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

        <div className="md:col-span-3">
          <label className="text-xs text-slate-300">Categoría</label>
          <select
            name="category"
            defaultValue={categoryId}
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

        <div className="md:col-span-3">
          <label className="text-xs text-slate-300">Buscar</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Ej: mercadopago, shell..."
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="uncategorized"
            type="checkbox"
            name="uncategorized"
            value="1"
            defaultChecked={uncategorized}
            className="h-4 w-4 accent-emerald-500"
          />
          <label htmlFor="uncategorized" className="text-sm text-slate-200">
            Sin categoría
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Por página</label>
          <select
            name="per"
            defaultValue={String(per)}
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

      {/* Tabla con quick edits */}
      <TransactionsTableClient rows={rows} accounts={accounts} categories={categories} />

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">Página {page} de {totalPages}</div>

        <div className="flex gap-2">
          <Link
            aria-disabled={page <= 1}
            className={`rounded-md border border-slate-700 px-3 py-1 text-sm ${
              page <= 1 ? "opacity-50 pointer-events-none" : "hover:bg-slate-800"
            }`}
            href={basePath + buildQueryString(sp, { page: String(page - 1) })}
          >
            Anterior
          </Link>

          <Link
            aria-disabled={page >= totalPages}
            className={`rounded-md border border-slate-700 px-3 py-1 text-sm ${
              page >= totalPages ? "opacity-50 pointer-events-none" : "hover:bg-slate-800"
            }`}
            href={basePath + buildQueryString(sp, { page: String(page + 1) })}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </div>
  );
}
