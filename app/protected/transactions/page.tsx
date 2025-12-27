import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, TransactionType } from "@/types/db";
import TransactionsTableClient from "./TransactionsTableClient";
import TransactionsFiltersClient from "./TransactionsFiltersClient";

type TxRow = {
  id: string;
  user_id: string;
  account_id: string;
  date: string;
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
  created_at: string;
  provider: string | null;
  institution: string | null;
  file_name: string | null;
  due_date: string | null;
  cut_off_date: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  note: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

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

function endOfMonthISO(isoDate: string, tz: string) {
  const y = Number(isoDate.slice(0, 4));
  const m0 = Number(isoDate.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(y, m0 + 1, 0, 12, 0, 0));
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

export default async function TransactionsPage(props: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const sp = await props.searchParams;

  const tz = "America/Argentina/Cordoba";
  const today = getLocalISODate(tz);
  const defaultFrom = startOfMonthISO(today);
  const defaultTo = endOfMonthISO(today, tz);
  const defaultBudgetMonth = today.slice(0, 7); // YYYY-MM

  const from = (getParam(sp, "from") ?? defaultFrom).trim();
  const to = (getParam(sp, "to") ?? defaultTo).trim();

  const accountId = (getParam(sp, "account") ?? "").trim();
  const batchId = (getParam(sp, "batch") ?? "").trim();
  const useDate = getParam(sp, "useDate") === "1";

  // ✅ nuevo
  const budget = getParam(sp, "budget") === "1";
  const budgetMonth = (getParam(sp, "budgetMonth") ?? defaultBudgetMonth).trim(); // YYYY-MM
  const budgetStart = `${budgetMonth}-01`;
  const budgetEnd = endOfMonthISO(budgetStart, tz);

  const type = ((getParam(sp, "type") ?? "").trim() as TransactionType | "") || "";
  const categoryId = (getParam(sp, "category") ?? "").trim();
  const q = (getParam(sp, "q") ?? "").trim();
  const uncategorized = getParam(sp, "uncategorized") === "1";

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
      .limit(60),
  ]);

  const accounts = (accountsData ?? []) as Account[];
  const categories = (categoriesData ?? []) as Category[];
  const allBatches = (batchesData ?? []) as ImportBatchRow[];
  if (batchesErr) console.error("Error cargando import_batches:", batchesErr);

  // ✅ en modo presupuesto mensual, necesitamos los batch ids cuyo due_date cae en el mes
  let budgetBatchIds: string[] = [];
  if (budget) {
    let qb = supabase
      .from("import_batches")
      .select("id")
      .eq("user_id", user.id)
      .gte("due_date", budgetStart)
      .lte("due_date", budgetEnd)
      .limit(500);

    if (accountId) qb = qb.eq("account_id", accountId);

    const { data: idRows, error: idErr } = await qb;
    if (idErr) console.error("Error buscando batches para presupuesto mensual:", idErr);
    budgetBatchIds = (idRows ?? []).map((r: any) => String(r.id));
  }

  /**
   * ✅ FILTRO
   * - Si budget=1: (TC por due_date del batch) OR (manuales por date dentro del mes)
   * - Si budget=0: se mantienen las 4 reglas anteriores (Fecha/Resumen)
   */
  const applyFilters = (q0: any) => {
    let qx = q0.eq("user_id", user.id);

    if (budget) {
      // OR:
      // 1) import_batch_id in (batches del mes)  -> tarjeta
      // 2) import_batch_id is null AND date in [budgetStart, budgetEnd] -> manuales del mes
      if (budgetBatchIds.length > 0) {
        const inList = budgetBatchIds.join(",");
        qx = qx.or(
          `import_batch_id.in.(${inList}),and(import_batch_id.is.null,date.gte.${budgetStart},date.lte.${budgetEnd})`
        );
      } else {
        qx = qx.is("import_batch_id", null).gte("date", budgetStart).lte("date", budgetEnd);
      }
      // En presupuesto mensual, ignoramos batchId y useDate deliberadamente.
    } else {
      // Reglas originales:
      if (!useDate) {
        if (batchId) qx = qx.eq("import_batch_id", batchId);
      } else {
        qx = qx.gte("date", from).lte("date", to);
        if (batchId) qx = qx.eq("import_batch_id", batchId);
        else qx = qx.is("import_batch_id", null);
      }
    }

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

  // Listado
  let txQ = supabase
    .from("transactions")
    .select(
      "id,user_id,account_id,date,description_raw,merchant_name,category_id,amount,type,import_batch_id,created_at,receipt,installment_number,installments_total",
      { count: "exact" }
    );

  txQ = applyFilters(txQ);

  const { data: txData, error: txErr, count } = await txQ
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (txErr) console.error("Error cargando transactions:", txErr);

  const rows = (txData ?? []) as TxRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / per), 1);

  // Totales (chunk)
  const totals = {
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

      let tq = supabase.from("transactions").select("amount,type");
      tq = applyFilters(tq);

      const { data: part, error: partErr } = await tq.range(off, hi);
      if (partErr) {
        console.error("Error calculando totales (chunk):", partErr);
        break;
      }

      for (const r of part ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const t = String((r as any).type ?? "other") as TransactionType | "other";

        totals.total += amount;
        if (t === "expense") totals.expense += amount;
        else if (t === "income") totals.income += amount;
        else if (t === "payment") totals.payment += amount;
        else if (t === "transfer") totals.transfer += amount;
        else if (t === "fee") totals.fee += amount;
        else totals.other += amount;
      }
    }
  }

  // Conteo sin categoría
  let uncQ = supabase.from("transactions").select("id", { count: "exact", head: true });
  uncQ = applyFilters(uncQ).is("category_id", null);
  const { count: uncategorizedCount, error: uncErr } = await uncQ;
  if (uncErr) console.error("uncategorized count error:", uncErr);

  const basePath = "/protected/transactions";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="text-sm text-slate-300">
          Mostrando {rows.length} de {totalCount} (página {page} de {totalPages})
        </div>

        <div className="text-right text-sm text-slate-300">
          <div>
            Total filtro:{" "}
            <span className="text-slate-100 font-medium">{formatMoneyARS(totals.total)}</span>
          </div>
          <div className="text-xs text-slate-400">
            Gastos: {formatMoneyARS(totals.expense)} · Ingresos: {formatMoneyARS(totals.income)} · Pagos:{" "}
            {formatMoneyARS(totals.payment)}
          </div>
        </div>
      </div>

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
      </div>

      <TransactionsFiltersClient
        basePath={basePath}
        accounts={accounts}
        categories={categories}
        batches={allBatches.map((b) => ({
          id: b.id,
          account_id: b.account_id,
          label: batchLabel(b),
          due_date: b.due_date,
          cut_off_date: b.cut_off_date,
        }))}
        initial={{
          from,
          to,
          accountId,
          batchId,
          type,
          categoryId,
          q,
          uncategorized,
          per,
          useDate,
          budget,
          budgetMonth,
        }}
      />

      <TransactionsTableClient rows={rows} accounts={accounts} categories={categories} />

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
