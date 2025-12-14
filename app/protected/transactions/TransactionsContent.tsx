import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, TransactionType } from "@/types/db";

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

  // Si ya agregaste columnas:
  receipt?: string | null;
  installment_number?: number | null;
  installments_total?: number | null;
};

function firstDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}
function lastDayOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
}

function getParam(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function buildQueryString(
  sp: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>
) {
  const params = new URLSearchParams();

  // Copiamos existentes
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") params.set(k, val);
  }

  // Aplicamos patch
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
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export default async function TransactionsContent(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sp = await props.searchParams;

  const from = getParam(sp, "from") ?? firstDayOfMonthISO();
  const to = getParam(sp, "to") ?? lastDayOfMonthISO();

  const accountId = getParam(sp, "account") ?? "";
  const type = (getParam(sp, "type") ?? "") as TransactionType | "";
  const categoryId = getParam(sp, "category") ?? "";
  const q = (getParam(sp, "q") ?? "").trim();
  const uncategorized = getParam(sp, "uncategorized") === "1";

  const per = Math.min(Math.max(Number(getParam(sp, "per") ?? "50") || 50, 10), 200);
  const page = Math.max(Number(getParam(sp, "page") ?? "1") || 1, 1);

  const fromIdx = (page - 1) * per;
  const toIdx = fromIdx + per - 1;

  // Cargar cuentas/categorías (para filtros + labels)
  const [{ data: accountsData }, { data: categoriesData }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, user_id, name, type, institution, currency, credit_limit, cut_off_day, due_day, interest_rate, created_at")
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

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Query transacciones (paginada + count)
  let txQ = supabase
    .from("transactions")
    .select(
      "id,user_id,account_id,date,description_raw,merchant_name,category_id,amount,type,import_batch_id,created_at,receipt,installment_number,installments_total",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .gte("date", from)
    .lte("date", to);

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

  if (txErr) {
    console.error("Error cargando transactions:", txErr);
  }

  const rows = (txData ?? []) as TxRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / per), 1);

  // Totales del “resultado visible” (página actual)
  const pageTotals = rows.reduce(
    (acc, r) => {
      acc.all += r.amount;
      acc.byType[r.type] = (acc.byType[r.type] ?? 0) + r.amount;
      return acc;
    },
    { all: 0, byType: {} as Record<string, number> }
  );

  const basePath = "/protected/transactions";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Transacciones</h1>
            <p className="text-sm text-slate-300">
              Mostrando {rows.length} de {totalCount} (página {page} de {totalPages})
            </p>
          </div>

          <div className="text-right text-sm text-slate-300">
            <div>Total página: <span className="text-slate-100 font-medium">{formatMoneyARS(pageTotals.all)}</span></div>
            <div className="text-xs text-slate-400">
              Gastos: {formatMoneyARS(pageTotals.byType.expense ?? 0)} · Ingresos: {formatMoneyARS(pageTotals.byType.income ?? 0)} · Pagos: {formatMoneyARS(pageTotals.byType.payment ?? 0)}
            </div>
          </div>
        </header>

        {/* Filtros (GET -> URL params) */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
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
              <label className="text-xs text-slate-300">Buscar (merchant o descripción)</label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Ej: mercadopago, shell, energía..."
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

            {/* Siempre volver a página 1 al filtrar */}
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
        </section>

        {/* Tabla */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900">
                <tr className="text-left text-slate-300">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2">Merchant</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Comprobante</th>
                  <th className="px-3 py-2">Cuota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => {
                  const acc = accountById.get(r.account_id);
                  const cat = r.category_id ? categoryById.get(r.category_id) : null;
                  const currency = acc?.currency ?? "ARS";

                  const cuota =
                    r.installment_number != null && r.installments_total != null
                      ? `${String(r.installment_number).padStart(2, "0")}/${String(r.installments_total).padStart(2, "0")}`
                      : "";

                  return (
                    <tr key={r.id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{acc?.name ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.merchant_name ?? "—"}
                      </td>
                      <td className="px-3 py-2">{r.description_raw}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {cat ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </span>
                        ) : (
                          <span className="text-amber-300">Sin categoría</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.type}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {formatMoneyARS(r.amount, currency)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.receipt ?? ""}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{cuota}</td>
                    </tr>
                  );
                })}

                {!rows.length && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-300" colSpan={9}>
                      No hay transacciones para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
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
        </section>
      </div>
    </main>
  );
}
