// app/(protected)/reports/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ReportsChart from "./reports-chart";

type SearchParams = Record<string, string | string[] | undefined>;

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

// Fecha local en TZ específica sin depender de librerías externas
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

function buildTxHref(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, v);
  });
  return `/protected/transactions?${sp.toString()}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const tz = "America/Argentina/Cordoba";
  const today = getLocalISODate(tz);
  const defaultFrom = startOfMonthISO(today);

  const from = (typeof searchParams.from === "string" ? searchParams.from : undefined) ?? defaultFrom;
  const to = (typeof searchParams.to === "string" ? searchParams.to : undefined) ?? today;
  const accountId = typeof searchParams.accountId === "string" ? searchParams.accountId : null;

  const supabase = await createClient();

  // KPIs
  const { data: totals, error: totalsErr } = await supabase.rpc("tx_totals", {
    p_from: from,
    p_to: to,
    p_account_id: accountId,
    p_types: null,
  });

  // Serie diaria (sin filtro de types para mostrar todo; si querés solo expense/income, pasás p_types)
  const { data: ts, error: tsErr } = await supabase.rpc("tx_timeseries_day", {
    p_from: from,
    p_to: to,
    p_account_id: accountId,
    p_types: null,
  });

  // Rankings (por defecto expense+fee)
  const { data: byCat, error: byCatErr } = await supabase.rpc("tx_by_category", {
    p_from: from,
    p_to: to,
    p_account_id: accountId,
    p_types: ["expense", "fee"],
    p_limit: 10,
  });

  const { data: byMer, error: byMerErr } = await supabase.rpc("tx_by_merchant", {
    p_from: from,
    p_to: to,
    p_account_id: accountId,
    p_types: ["expense", "fee"],
    p_limit: 10,
  });

  // Normalizaciones seguras
  const t0 = totals?.[0];
  const kpi = {
    total: Number(t0?.total_amount ?? 0),
    expense: Number(t0?.expense_amount ?? 0),
    income: Number(t0?.income_amount ?? 0),
    payment: Number(t0?.payment_amount ?? 0),
    fee: Number(t0?.fee_amount ?? 0),
    uncategorizedAmount: Number(t0?.uncategorized_amount ?? 0),
    txCount: Number(t0?.tx_count ?? 0),
    uncategorizedCount: Number(t0?.uncategorized_count ?? 0),
  };

  const chartData =
    (ts ?? []).map((r: any) => ({
      day: r.day as string,
      expense: Number(r.expense ?? 0),
      income: Number(r.income ?? 0),
      payment: Number(r.payment ?? 0),
      fee: Number(r.fee ?? 0),
      transfer: Number(r.transfer ?? 0),
    })) ?? [];

  const hasErrors = totalsErr || tsErr || byCatErr || byMerErr;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Período: <span className="font-medium">{from}</span> a <span className="font-medium">{to}</span>
          </p>
        </div>

        <form method="get" className="flex items-end gap-2 flex-wrap">
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <input name="from" defaultValue={from} type="date" className="h-9 rounded-md border px-2 bg-background" />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <input name="to" defaultValue={to} type="date" className="h-9 rounded-md border px-2 bg-background" />
          </div>
          <input type="hidden" name="accountId" value={accountId ?? ""} />
          <button className="h-9 rounded-md bg-primary text-primary-foreground px-3 text-sm">Aplicar</button>
        </form>
      </div>

      {hasErrors ? (
        <div className="rounded-md border p-3 text-sm">
          Se detectaron errores al cargar datos.
          <ul className="list-disc ml-5 mt-2 text-muted-foreground">
            {totalsErr && <li>tx_totals: {totalsErr.message}</li>}
            {tsErr && <li>tx_timeseries_day: {tsErr.message}</li>}
            {byCatErr && <li>tx_by_category: {byCatErr.message}</li>}
            {byMerErr && <li>tx_by_merchant: {byMerErr.message}</li>}
          </ul>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ from, to, accountId: accountId ?? undefined })}
        >
          <div className="text-xs text-muted-foreground">Total movimientos</div>
          <div className="text-xl font-semibold">{kpi.txCount}</div>
          <div className="text-sm mt-1">{fmtArs(kpi.total)}</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ from, to, accountId: accountId ?? undefined, type: "expense" })}
        >
          <div className="text-xs text-muted-foreground">Gastos</div>
          <div className="text-xl font-semibold">{fmtArs(kpi.expense)}</div>
          <div className="text-xs text-muted-foreground mt-1">type=expense</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ from, to, accountId: accountId ?? undefined, type: "income" })}
        >
          <div className="text-xs text-muted-foreground">Ingresos</div>
          <div className="text-xl font-semibold">{fmtArs(kpi.income)}</div>
          <div className="text-xs text-muted-foreground mt-1">type=income</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ from, to, accountId: accountId ?? undefined, uncategorized: "1" })}
        >
          <div className="text-xs text-muted-foreground">Sin categoría (gastos)</div>
          <div className="text-xl font-semibold">{kpi.uncategorizedCount}</div>
          <div className="text-sm mt-1">{fmtArs(kpi.uncategorizedAmount)}</div>
        </Link>
      </div>

      {/* Serie temporal */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Serie diaria</h2>
          <div className="text-xs text-muted-foreground">
            Consejo: si querés solo gasto/ingreso, pasá p_types en tx_timeseries_day.
          </div>
        </div>
        <ReportsChart data={chartData} />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Top categorías (expense + fee)</h3>
            <Link className="text-sm underline" href={buildTxHref({ from, to, accountId: accountId ?? undefined })}>
              Ver transacciones
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(byCat ?? []).map((r: any) => {
              const href = r.category_id
                ? buildTxHref({ from, to, accountId: accountId ?? undefined, categoryId: r.category_id })
                : buildTxHref({ from, to, accountId: accountId ?? undefined, uncategorized: "1" });

              return (
                <Link key={`${r.category_id ?? "null"}`} href={href} className="block rounded-md border p-3 hover:bg-muted/30 transition">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.category_name}</div>
                      <div className="text-xs text-muted-foreground">{Number(r.tx_count ?? 0)} movimientos</div>
                    </div>
                    <div className="font-semibold">{fmtArs(Number(r.total_amount ?? 0))}</div>
                  </div>
                </Link>
              );
            })}

            {(byCat ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin datos para el período.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Top merchants (expense + fee)</h3>
            <Link className="text-sm underline" href={buildTxHref({ from, to, accountId: accountId ?? undefined })}>
              Ver transacciones
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(byMer ?? []).map((r: any) => {
              const m = String(r.merchant_name ?? "Sin merchant");
              const href = buildTxHref({ from, to, accountId: accountId ?? undefined, merchant: m });

              return (
                <Link key={m} href={href} className="block rounded-md border p-3 hover:bg-muted/30 transition">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m}</div>
                      <div className="text-xs text-muted-foreground">{Number(r.tx_count ?? 0)} movimientos</div>
                    </div>
                    <div className="font-semibold">{fmtArs(Number(r.total_amount ?? 0))}</div>
                  </div>
                </Link>
              );
            })}

            {(byMer ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin datos para el período.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
