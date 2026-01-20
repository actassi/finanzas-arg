import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, TransactionRow, TransactionType } from "@/types/db";
import TransactionsTableClient from "./TransactionsTableClient";

function firstDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

function lastDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
}

/**
 * Convierte cualquier YYYY-MM-DD al primer día de ese mes: YYYY-MM-01
 * (Evita problemas de timezone y alinea con budget_month).
 */
function monthStartISO(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function getParam(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
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

export default async function TransactionsContent(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  // Mantener compatibilidad con tu flujo (claims + user)
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const sp = await props.searchParams;

  const from = getParam(sp, "from") ?? firstDayOfMonthISO();
  const to = getParam(sp, "to") ?? lastDayOfMonthISO();

  // Modo:
  // - useDate=1 => filtra por fecha real (t.date)
  // - default  => filtra por mes presupuestario (t.budget_month)
  const useDate = getParam(sp, "useDate") === "1";

  const fromMonth = monthStartISO(from);
  const toMonth = monthStartISO(to);

  const accountId = getParam(sp, "account") ?? "";
  const type = (getParam(sp, "type") ?? "") as TransactionType | "";
  const categoryId = getParam(sp, "category") ?? "";
  const q = (getParam(sp, "q") ?? "").trim();
  const uncategorized = getParam(sp, "uncategorized") === "1";

  const per = Math.min(
    Math.max(Number(getParam(sp, "per") ?? "50") || 50, 10),
    200
  );
  const page = Math.max(Number(getParam(sp, "page") ?? "1") || 1, 1);

  const fromIdx = (page - 1) * per;
  const toIdx = fromIdx + per - 1;

  const [{ data: accountsData }, { data: categoriesData }] = await Promise.all([
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
  ]);

  const accounts = (accountsData ?? []) as Account[];
  const categories = (categoriesData ?? []) as Category[];

  // Query transacciones paginadas
  let txQ = supabase
    .from("transactions")
    .select(
      "id,user_id,account_id,date,description_raw,merchant_name,category_id,amount,type,import_batch_id,created_at,receipt,installment_number,installments_total",
      { count: "exact" }
    )
    .eq("user_id", user.id);

  // Base date filter
  if (useDate) {
    txQ = txQ.gte("date", from).lte("date", to);
  } else {
    txQ = txQ.gte("budget_month", fromMonth).lte("budget_month", toMonth);
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

  const rows = (txData ?? []) as TransactionRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / per), 1);

  // Totales del período filtrado (RPC)
  // Nota: si tus RPCs fueron ajustados para budget_month, mandamos fromMonth/toMonth en modo presupuestario.
  const rpcFrom = useDate ? from : fromMonth;
  const rpcTo = useDate ? to : toMonth;

  const { data: totalsData, error: totalsErr } = await supabase.rpc("tx_totals", {
    p_user_id: user.id,
    p_from: rpcFrom,
    p_to: rpcTo,
    p_account_id: accountId || null,
    p_type: type || null,
    p_category_id: uncategorized ? null : categoryId || null,
    p_uncategorized: uncategorized,
    p_q: q || null,
  });

  if (totalsErr) console.error("tx_totals RPC error:", totalsErr);

  const totals = (Array.isArray(totalsData) ? totalsData[0] : null) as
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
      };

  // Conteo “sin categoría” (mismo filtro base, ignorando category/uncategorized)
  let uncQ = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (useDate) {
    uncQ = uncQ.gte("date", from).lte("date", to);
  } else {
    uncQ = uncQ.gte("budget_month", fromMonth).lte("budget_month", toMonth);
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
      {/* Header Totales */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="text-sm text-slate-300">
          Mostrando {rows.length} de {totalCount} (página {page} de {totalPages})
        </div>

        <div className="text-right text-sm text-slate-300">
          <div>
            Total filtro:{" "}
            <span className="text-slate-100 font-medium">
              {formatMoneyARS(totals?.total ?? 0)}
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Gastos: {formatMoneyARS(totals?.expense ?? 0)} · Ingresos:{" "}
            {formatMoneyARS(totals?.income ?? 0)} · Pagos:{" "}
            {formatMoneyARS(totals?.payment ?? 0)}
          </div>
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

      {/* Filtros (GET) */}
      <form method="get" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Desde</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Hasta</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
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

        {/* Mantener el modo actual al aplicar filtros */}
        {useDate && <input type="hidden" name="useDate" value="1" />}

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
