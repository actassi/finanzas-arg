import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IncomeExpenseChart from "./income-expense-chart";
import CategoryPieChart from "./category-pie-chart";
import MerchantPieChart from "./merchant-pie-chart";
import ReportsFiltersClient from "./ReportsFiltersClient";

type SearchParams = Record<string, string | string[] | undefined>;

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
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

type TxMini = {
  amount: number;
  type: string;
  category_id: string | null;
  merchant_name: string | null;
};

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
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

function batchLabel(b: ImportBatchRow) {
  const ref = b.due_date ?? (b.created_at ? b.created_at.slice(0, 10) : "");
  const provider = b.provider ? b.provider.toUpperCase() : "PDF";
  const note = b.note ? ` · ${b.note}` : "";
  const file = b.file_name ? ` · ${b.file_name}` : "";
  return `${provider} · ${ref}${note}${file}`;
}

function buildTxHref(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") usp.set(k, v);
  });
  const qs = usp.toString();
  return qs ? `/protected/transactions?${qs}` : `/protected/transactions`;
}

export default async function ReportsPage(props: { searchParams: SearchParams | Promise<SearchParams> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const sp = await props.searchParams;

  const tz = "America/Argentina/Cordoba";
  const today = getLocalISODate(tz);
  const defaultFrom = startOfMonthISO(today);
  const defaultTo = endOfMonthISO(today, tz);
  const defaultBudgetMonth = today.slice(0, 7);

  const from = (getParam(sp, "from") ?? defaultFrom).trim();
  const to = (getParam(sp, "to") ?? defaultTo).trim();

  const accountId = ((getParam(sp, "account") ?? "").trim() || "") as string;
  const batchId = ((getParam(sp, "batch") ?? "").trim() || "") as string;
  const useDate = getParam(sp, "useDate") === "1";

  // ✅ nuevo
  const budget = getParam(sp, "budget") === "1";
  const budgetMonth = (getParam(sp, "budgetMonth") ?? defaultBudgetMonth).trim();
  const budgetStart = `${budgetMonth}-01`;
  const budgetEnd = endOfMonthISO(budgetStart, tz);

  const [
    { data: accountsData, error: accErr },
    { data: batchesData, error: batchesErr },
    { data: catsData, error: catsErr },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,user_id,name,currency")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("import_batches")
      .select(
        "id,user_id,account_id,created_at,provider,institution,file_name,due_date,cut_off_date,statement_period_start,statement_period_end,note"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("categories")
      .select("id,name,subcategory,color")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
  ]);

  if (accErr) console.error("Error cargando accounts:", accErr);
  if (batchesErr) console.error("Error cargando import_batches:", batchesErr);
  if (catsErr) console.error("Error cargando categories:", catsErr);

  const accounts = (accountsData ?? []) as AccountRow[];
  const batchesAll = (batchesData ?? []) as ImportBatchRow[];

  // Map categoría -> nombre + color
  const catMap = new Map<string, string>();
  const catColorMap = new Map<string, string>();
  for (const c of catsData ?? []) {
    const id = String((c as any).id);
    const name = String((c as any).name ?? "");
    const sub = String((c as any).subcategory ?? "").trim();
    const color = String((c as any).color ?? "").trim();
    catMap.set(id, sub ? `${name} / ${sub}` : name);
    if (color) catColorMap.set(id, color);
  }

  // ✅ batches del mes (por due_date) para presupuesto mensual
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

  const applyFilters = (q0: any) => {
    let qx = q0.eq("user_id", user.id);

    if (budget) {
      if (budgetBatchIds.length > 0) {
        const inList = budgetBatchIds.join(",");
        qx = qx.or(
          `import_batch_id.in.(${inList}),and(import_batch_id.is.null,date.gte.${budgetStart},date.lte.${budgetEnd})`
        );
      } else {
        qx = qx.is("import_batch_id", null).gte("date", budgetStart).lte("date", budgetEnd);
      }
      // ignora batchId/useDate
    } else {
      if (!useDate) {
        if (batchId) qx = qx.eq("import_batch_id", batchId);
      } else {
        qx = qx.gte("date", from).lte("date", to);
        if (batchId) qx = qx.eq("import_batch_id", batchId);
        else qx = qx.is("import_batch_id", null);
      }
    }

    if (accountId) qx = qx.eq("account_id", accountId);
    return qx;
  };

  // count total
  let countQ = supabase.from("transactions").select("id", { count: "exact", head: true });
  countQ = applyFilters(countQ);
  const { count: totalCount, error: countErr } = await countQ;
  if (countErr) console.error("Error count transactions:", countErr);

  const kpi = {
    total: 0,
    expense: 0,
    income: 0,
    payment: 0,
    fee: 0,
    transfer: 0,
    other: 0,
    txCount: Number(totalCount ?? 0),
    uncategorizedAmount: 0,
    uncategorizedCount: 0,
  };

  const byCat = new Map<string, { amount: number; count: number }>();
  const byMer = new Map<string, { amount: number; count: number }>();

  const CHUNK = 5000;
  const pages = Math.ceil((totalCount ?? 0) / CHUNK);

  for (let i = 0; i < pages; i++) {
    const off = i * CHUNK;
    const hi = off + CHUNK - 1;

    let qx = supabase.from("transactions").select("amount,type,category_id,merchant_name").range(off, hi);
    qx = applyFilters(qx);

    const { data: part, error: partErr } = await qx;
    if (partErr) {
      console.error("Error agregando (chunk):", partErr);
      break;
    }

    for (const r0 of (part ?? []) as any[]) {
      const r = r0 as TxMini;
      const amt = Number(r.amount ?? 0);
      const t = String(r.type ?? "other");

      kpi.total += amt;
      if (t === "expense") kpi.expense += amt;
      else if (t === "income") kpi.income += amt;
      else if (t === "payment") kpi.payment += amt;
      else if (t === "transfer") kpi.transfer += amt;
      else if (t === "fee") kpi.fee += amt;
      else kpi.other += amt;

      const isEgreso = t === "expense" || t === "fee";
      if (isEgreso) {
        if (!r.category_id) {
          kpi.uncategorizedAmount += amt;
          kpi.uncategorizedCount += 1;
        }

        const catKey = r.category_id ?? "null";
        const prevC = byCat.get(catKey) ?? { amount: 0, count: 0 };
        prevC.amount += amt;
        prevC.count += 1;
        byCat.set(catKey, prevC);

        const merName = String(r.merchant_name ?? "—").trim() || "—";
        const prevM = byMer.get(merName) ?? { amount: 0, count: 0 };
        prevM.amount += amt;
        prevM.count += 1;
        byMer.set(merName, prevM);
      }
    }
  }

  const byCatList = Array.from(byCat.entries())
    .map(([key, v]) => {
      const category_id = key === "null" ? null : key;
      const category_name = category_id ? catMap.get(category_id) ?? "Sin categoría" : "Sin categoría";
      return { category_id, category_name, total_amount: v.amount, tx_count: v.count };
    })
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 12);

  const byMerList = Array.from(byMer.entries())
    .map(([merchant_name, v]) => ({ merchant_name, total_amount: v.amount, tx_count: v.count }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10);

  const categoryChartData = byCatList.map((r) => ({
    category: r.category_name,
    amount: r.total_amount,
    txCount: r.tx_count,
    category_id: r.category_id,
    color: r.category_id ? (catColorMap.get(r.category_id) ?? null) : null,
  }));

  // Links a transacciones: preserva presupuesto mensual si está activo
  const txBaseParams: Record<string, string | undefined> = {
    account: accountId || undefined,

    budget: budget ? "1" : undefined,
    budgetMonth: budget ? budgetMonth : undefined,

    batch: !budget ? (batchId || undefined) : undefined,
    useDate: !budget && useDate ? "1" : undefined,
    from: !budget && useDate ? from : undefined,
    to: !budget && useDate ? to : undefined,
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Visualizaciones</h1>
          <div className="text-sm text-slate-300">
            Alcance:{" "}
            <span className="text-slate-100 font-medium">
              {budget
                ? `Presupuesto mensual (${budgetMonth})`
                : !useDate && !batchId
                ? "Todas las transacciones"
                : !useDate && batchId
                ? "Resumen (completo)"
                : useDate && !batchId
                ? "Manual (por fecha)"
                : "Resumen (por fecha)"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            href={buildTxHref(txBaseParams)}
          >
            Transacciones
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            href="/protected/categories"
          >
            Categorías
          </Link>
        </div>
      </div>

      <ReportsFiltersClient
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        batches={batchesAll.map((b) => ({
          id: b.id,
          account_id: b.account_id,
          label: batchLabel(b),
          due_date: b.due_date,
          cut_off_date: b.cut_off_date,
        }))}
        initial={{ from, to, accountId, batchId, useDate, budget, budgetMonth }}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800/50 transition"
          href={buildTxHref(txBaseParams)}
        >
          <div className="text-xs text-slate-400">Total movimientos</div>
          <div className="text-xl font-semibold text-slate-100">{kpi.txCount}</div>
          <div className="text-sm mt-1 text-slate-200">{fmtArs(kpi.total)}</div>
        </Link>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Ingresos</div>
          <div className="text-xl font-semibold text-slate-100">{fmtArs(kpi.income)}</div>
          <div className="text-xs text-slate-500 mt-1">type=income</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Egresos (expense + fee)</div>
          <div className="text-xl font-semibold text-slate-100">
            {fmtArs(Number(kpi.expense) + Number(kpi.fee))}
          </div>
          <div className="text-xs text-slate-500 mt-1">expense + fee</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Sin categoría (egresos)</div>
          <div className="text-xl font-semibold text-slate-100">{kpi.uncategorizedCount}</div>
          <div className="text-sm mt-1 text-slate-200">{fmtArs(kpi.uncategorizedAmount)}</div>
        </div>
      </div>

      {/* Comparativa */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-slate-100">Comparativa Ingresos vs Egresos</h2>
          <div className="text-xs text-slate-400">Incluye Neto (Ingresos − Egresos)</div>
        </div>
        <IncomeExpenseChart income={kpi.income} expense={Number(kpi.expense) + Number(kpi.fee)} />
      </div>

      {/* Rankings con Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">Top categorias (expense + fee)</h3>
            <Link className="text-sm underline text-slate-200" href={buildTxHref(txBaseParams)}>
              Ver transacciones
            </Link>
          </div>

          <CategoryPieChart data={categoryChartData} />

          <div className="mt-3 space-y-2">
            {byCatList.map((r) => {
              const href = buildTxHref({
                ...txBaseParams,
                category: r.category_id ?? undefined,
                uncategorized: r.category_id ? undefined : "1",
              });

              return (
                <Link
                  key={`${r.category_id ?? "null"}`}
                  href={href}
                  className="block rounded-md border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-800/50 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate text-slate-100">{r.category_name}</div>
                      <div className="text-xs text-slate-400">{r.tx_count} movimientos</div>
                    </div>
                    <div className="font-semibold text-slate-100">{fmtArs(r.total_amount)}</div>
                  </div>
                </Link>
              );
            })}

            {!byCatList.length ? <div className="text-sm text-slate-400">Sin datos para el alcance.</div> : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">Top merchants (expense + fee)</h3>
            <Link className="text-sm underline text-slate-200" href={buildTxHref(txBaseParams)}>
              Ver transacciones
            </Link>
          </div>

          <MerchantPieChart
            data={byMerList.map((r) => ({
              merchant_name: r.merchant_name,
              amount: r.total_amount,
              txCount: r.tx_count,
            }))}
          />

          <div className="mt-3 space-y-2">
            {byMerList.map((r) => {
              const href = buildTxHref({ ...txBaseParams, q: r.merchant_name });

              return (
                <Link
                  key={r.merchant_name}
                  href={href}
                  className="block rounded-md border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-800/50 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate text-slate-100">{r.merchant_name}</div>
                      <div className="text-xs text-slate-400">{r.tx_count} movimientos</div>
                    </div>
                    <div className="font-semibold text-slate-100">{fmtArs(r.total_amount)}</div>
                  </div>
                </Link>
              );
            })}

            {!byMerList.length ? <div className="text-sm text-slate-400">Sin datos para el alcance.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
