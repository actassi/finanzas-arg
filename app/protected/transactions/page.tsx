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
  date: string; // YYYY-MM-DD (fecha del movimiento)
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

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

// Fecha local ISO (tz) sin librerías externas
function getLocalISODate(tz = "America/Argentina/Cordoba", d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function startOfMonthISO(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

// Fin de mes en TZ (evita off-by-one por UTC)
function endOfMonthISO(isoDate: string, tz: string) {
  const y = Number(isoDate.slice(0, 4));
  const m0 = Number(isoDate.slice(5, 7)) - 1; // 0-11
  const d = new Date(Date.UTC(y, m0 + 1, 0, 12, 0, 0)); // último día del mes (a mediodía UTC)
  return getLocalISODate(tz, d);
}

function buildQueryString(sp: SearchParams, patch: Record<string, string | undefined>) {
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
  searchParams: Promise<SearchParams>;
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

  const accountId = (getParam(sp, "account") ?? "").trim();
  const type = ((getParam(sp, "type") ?? "").trim() as TransactionType | "") || "";
  const categoryId = (getParam(sp, "category") ?? "").trim();
  const q = (getParam(sp, "q") ?? "").trim();
  const uncategorized = getParam(sp, "uncategorized") === "1";

  // Batch (opcional)
  const batchId = (getParam(sp, "batch") ?? "").trim();

  // Paginación
  const per = Math.min(Math.max(Number(getParam(sp, "per") ?? "50") || 50, 10), 200);
  const page = Math.max(Number(getParam(sp, "page") ?? "1") || 1, 1);

  const fromIdx = (page - 1) * per;
  const toIdx = fromIdx + per - 1;

  const tz = "America/Argentina/Cordoba";
  const today = getLocalISODate(tz);
  const defaultFrom = startOfMonthISO(today);
  const defaultTo = endOfMonthISO(today, tz);

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

  // Dropdown batches filtrado por cuenta, pero manteniendo el seleccionado visible
  let batches = accountId ? allBatches.filter((b) => b.account_id === accountId) : allBatches;
  if (selectedBatch && !batches.some((b) => b.id === selectedBatch.id)) {
    batches = [selectedBatch, ...batches];
  }

  if (batchesErr) {
    console.error("Error cargando import_batches:", batchesErr);
  }

  /**
   * FILTRO PRINCIPAL (NUEVO):
   * Usamos budget_month (primer día de mes) para alinear:
   * - Resúmenes TC: mes del due_date del batch
   * - Transacciones manuales: mes de due_date si existe (o del date si no existe)
   *
   * UI sigue siendo “Desde / Hasta” con input date, pero el filtro se aplica por mes.
   */
  const fromParam = (getParam(sp, "from") ?? "").trim();
  const toParam = (getParam(sp, "to") ?? "").trim();

  // Si hay batch y tiene due_date, sugerimos ese mes en la UI (sin forzar)
  const batchDue = selectedBatch?.due_date ?? "";
  const suggestedFromUi = batchDue ? startOfMonthISO(batchDue) : "";
  const suggestedToUi = batchDue ? endOfMonthISO(batchDue, tz) : "";

  const fromUi = fromParam || suggestedFromUi || defaultFrom;
  const toUi = toParam || suggestedToUi || defaultTo;

  // Valores efectivos del filtro por mes (budget_month siempre es YYYY-MM-01)
  const fromBudget = startOfMonthISO(fromUi);
  const toBudget = startOfMonthISO(toUi);

  // Helper: aplica filtros comunes a una query
  const applyCommonFilters = (q0: any) => {
    let qx = q0.eq("user_id", user.id);

    // Filtro por mes imputado (budget_month)
    qx = qx.gte("budget_month", fromBudget).lte("budget_month", toBudget);

    // Batch (opcional)
    if (batchId) qx = qx.eq("import_batch_id", batchId);

    if (accountId) qx = qx.eq("account_id", accountId);
    if (type) qx = qx.eq("type", type);

    if (uncategorized) qx = qx.is("category_id", null);
    else if (categoryId) qx = qx.eq("category_id", categoryId);

    if (q) {
      const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      qx = qx.or(`merchant_name.ilike.${like},description_raw.ilike.${like}`);
    }

    return qx;
  };

  // Query transacciones paginadas (listado)
  let txQ = supabase
    .from("transactions")
    .select(
      "id,user_id,account_id,date,description_raw,merchant_name,category_id,amount,type,import_batch_id,created_at,receipt,installment_number,installments_total",
      { count: "exact" }
    );

  txQ = applyCommonFilters(txQ);

  const { data: txData, error: txErr, count } = await txQ
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (txErr) console.error("Error cargando transactions:", txErr);

  const rows = (txData ?? []) as TxRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / per), 1);

  /**
   * TOTALES (alineados a budget_month)
   * Para no depender de RPCs (que todavía filtran por `date`), calculamos en server-side
   * paginando en chunks para que el total sea correcto.
   */
  const totalsAcc = {
    total: 0,
    expense: 0,
    income: 0,
    payment: 0,
    transfer: 0,
    fee: 0,
    other: 0,
    count: totalCount,
  };

  if (totalCount > 0) {
    const CHUNK = 5000;
    const pages = Math.ceil(totalCount / CHUNK);

    for (let i = 0; i < pages; i++) {
      const off = i * CHUNK;
      const hi = off + CHUNK - 1;

      let tq = supabase
        .from("transactions")
        .select("amount,type", { count: "exact" });

      tq = applyCommonFilters(tq);

      const { data: part, error: partErr } = await tq.range(off, hi);
      if (partErr) {
        console.error("Error calculando totales (chunk):", partErr);
        break;
      }

      for (const r of part ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const t = String((r as any).type ?? "other") as TransactionType | "other";

        totalsAcc.total += amount;
        if (t === "expense") totalsAcc.expense += amount;
        else if (t === "income") totalsAcc.income += amount;
        else if (t === "payment") totalsAcc.payment += amount;
        else if (t === "transfer") totalsAcc.transfer += amount;
        else if (t === "fee") totalsAcc.fee += amount;
        else totalsAcc.other += amount;
      }
    }
  }

  // Conteo “sin categoría” (misma base)
  let uncQ = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true });

  uncQ = applyCommonFilters(uncQ).is("category_id", null);

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

          <div className="mt-2 text-xs text-slate-300">
            <span className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 inline-flex items-center">
              Mes imputado (budget_month):{" "}
              <span className="ml-2 text-slate-100 font-medium">
                {fromBudget} → {toBudget}
              </span>
            </span>
          </div>

          {selectedBatch ? (
            <div className="mt-2 text-xs text-slate-300">
              <span className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 inline-flex items-center">
                Resumen seleccionado:{" "}
                <span className="ml-2 text-slate-100 font-medium">{batchLabel(selectedBatch)}</span>
              </span>
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
          <span className="text-slate-100 font-medium">{formatMoneyARS(Number(totalsAcc.total ?? 0))}</span>
        </div>
        <div className="text-xs text-slate-400">
          Gastos: {formatMoneyARS(Number(totalsAcc.expense ?? 0))} · Ingresos:{" "}
          {formatMoneyARS(Number(totalsAcc.income ?? 0))} · Pagos:{" "}
          {formatMoneyARS(Number(totalsAcc.payment ?? 0))}
        </div>
      </div>

      {/* Atajo “Sin categoría” */}
      <div className="flex items-center gap-2">
        <Link
          href={basePath + buildQueryString(sp, { uncategorized: "1", category: "", page: "1" })}
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
          <div className="mt-1 text-[11px] text-slate-400">Filtra por mes imputado (budget_month).</div>
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
            El mes imputado de un resumen se calcula por su <span className="text-slate-200">vencimiento</span>.
          </div>
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
        <div className="text-xs text-slate-400">
          Página {page} de {totalPages}
        </div>

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
