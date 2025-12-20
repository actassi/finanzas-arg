// app/(protected)/reports/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportsChart from "./reports-chart";

type SearchParams = Record<string, string | string[] | undefined>;

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

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function batchLabel(b: ImportBatchRow) {
  const ref = b.due_date ?? (b.created_at ? b.created_at.slice(0, 10) : "");
  const provider = b.provider ? b.provider.toUpperCase() : "PDF";
  const note = b.note ? ` · ${b.note}` : "";
  const file = b.file_name ? ` · ${b.file_name}` : "";
  return `${provider} · ${ref}${note}${file}`;
}

// OJO: alineado a tu /transactions actual (account/category/q/uncategorized + batch/useDate)
function buildTxHref(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, v);
  });
  return `/protected/transactions?${sp.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const supabase = await createClient();

  // sesión en rutas protegidas
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const sp = await searchParams;

  const tz = "America/Argentina/Cordoba";
  const today = getLocalISODate(tz);
  const defaultFrom = startOfMonthISO(today);

  // account (si viene) -> normalizar "" a null para evitar UUID parse error en Postgres
  const accountIdRaw = typeof (sp as any).account === "string" ? (sp as any).account : "";
  const accountId = accountIdRaw && accountIdRaw.trim() !== "" ? accountIdRaw : null;

  // batch principal
  const batchId = getParam(sp, "batch") ?? "";
  const hasBatch = !!batchId;

  // fechas secundarias si hay batch
  const useDateParam = getParam(sp, "useDate") === "1";
  const useDate = hasBatch ? useDateParam : true;

  const fromParam = getParam(sp, "from") ?? "";
  const toParam = getParam(sp, "to") ?? "";

  // Cargar batches (para selector)
  const { data: batchesData, error: batchesErr } = await supabase
    .from("import_batches")
    .select(
      "id,user_id,account_id,created_at,provider,institution,file_name,due_date,cut_off_date,statement_period_start,statement_period_end,note"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const allBatches = (batchesData ?? []) as ImportBatchRow[];
  const selectedBatch = batchId ? allBatches.find((b) => b.id === batchId) ?? null : null;

  // Si filtrás por account, filtrá el dropdown, pero asegurá que el batch seleccionado siga apareciendo
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

  // UI: valores que se muestran en inputs
  const fromUi = hasBatch ? (fromParam || suggestedFrom || "") : (fromParam || defaultFrom);
  const toUi = hasBatch ? (toParam || suggestedTo || "") : (toParam || today);

  // EFECTIVO: valores que filtran (solo si !hasBatch o useDate=1)
  const fromEff =
    (!hasBatch || useDate)
      ? (hasBatch ? (fromParam || suggestedFrom || "") : (fromParam || defaultFrom))
      : undefined;

  const toEff =
    (!hasBatch || useDate)
      ? (hasBatch ? (toParam || suggestedTo || "") : (toParam || today))
      : undefined;

  /**
   * DATA
   * - Sin batch: usa RPCs actuales (rápido, DB-side).
   * - Con batch: calcula desde transactions (batch típico es chico, funciona bien).
   */
  let totalsErr: any = null;
  let byCatErr: any = null;
  let byMerErr: any = null;

  // “Shape” compatible con tu UI actual
  let kpi = {
    total: 0,
    expense: 0,
    income: 0,
    payment: 0,
    fee: 0,
    uncategorizedAmount: 0,
    txCount: 0,
    uncategorizedCount: 0,
  };

  let byCat: Array<{
    category_id: string | null;
    category_name: string;
    total_amount: number;
    tx_count: number;
  }> = [];

  let byMer: Array<{
    merchant_name: string | null;
    total_amount: number;
    tx_count: number;
  }> = [];

  if (hasBatch) {
    // 1) KPIs por batch (sin RPC)
    let baseQ = supabase
      .from("transactions")
      .select("amount,type,category_id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("import_batch_id", batchId)
      .range(0, 4999);

    if (accountId) baseQ = baseQ.eq("account_id", accountId);
    if (useDate) {
      if (fromEff) baseQ = baseQ.gte("date", fromEff);
      if (toEff) baseQ = baseQ.lte("date", toEff);
    }

    const { data: allRows, error: allErr, count } = await baseQ;

    if (allErr) {
      totalsErr = allErr;
    } else {
      const acc = {
        total: 0,
        expense: 0,
        income: 0,
        payment: 0,
        fee: 0,
        transfer: 0,
        other: 0,
        txCount: Number(count ?? 0),
        uncategorizedAmount: 0,
        uncategorizedCount: 0,
      };

      for (const r of allRows ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const t = String((r as any).type ?? "other");

        acc.total += amount;

        if (t === "expense") acc.expense += amount;
        else if (t === "income") acc.income += amount;
        else if (t === "payment") acc.payment += amount;
        else if (t === "fee") acc.fee += amount;
        else if (t === "transfer") acc.transfer += amount;
        else acc.other += amount;

        // “Sin categoría” enfocado en gastos (expense+fee)
        const catId = (r as any).category_id as string | null;
        if ((t === "expense" || t === "fee") && !catId) {
          acc.uncategorizedCount += 1;
          acc.uncategorizedAmount += amount;
        }
      }

      kpi = {
        total: acc.total,
        expense: acc.expense,
        income: acc.income,
        payment: acc.payment,
        fee: acc.fee,
        uncategorizedAmount: acc.uncategorizedAmount,
        txCount: acc.txCount,
        uncategorizedCount: acc.uncategorizedCount,
      };
    }

    // 2) Top categorías por batch (expense + fee)
    // Traigo nombres de categorías para render
    const { data: catsData, error: catsErr } = await supabase
      .from("categories")
      .select("id,name")
      .eq("user_id", user.id);

    if (catsErr) {
      console.error("Error cargando categories para report:", catsErr);
    }

    const catNameById = new Map<string, string>();
    for (const c of catsData ?? []) {
      const id = String((c as any).id);
      const name = String((c as any).name ?? "");
      if (id && name) catNameById.set(id, name);
    }

    let catQ = supabase
      .from("transactions")
      .select("amount,type,category_id")
      .eq("user_id", user.id)
      .eq("import_batch_id", batchId)
      .in("type", ["expense", "fee"])
      .range(0, 4999);

    if (accountId) catQ = catQ.eq("account_id", accountId);
    if (useDate) {
      if (fromEff) catQ = catQ.gte("date", fromEff);
      if (toEff) catQ = catQ.lte("date", toEff);
    }

    const { data: catRows, error: catErr } = await catQ;
    if (catErr) {
      byCatErr = catErr;
    } else {
      const m = new Map<
        string,
        { category_id: string | null; category_name: string; total_amount: number; tx_count: number }
      >();

      for (const r of catRows ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const cid = ((r as any).category_id as string | null) ?? null;
        const key = cid ?? "__null__";
        const name = cid ? (catNameById.get(cid) ?? "Sin categoría") : "Sin categoría";

        const cur = m.get(key) ?? {
          category_id: cid,
          category_name: name,
          total_amount: 0,
          tx_count: 0,
        };

        cur.total_amount += amount;
        cur.tx_count += 1;
        m.set(key, cur);
      }

      byCat = Array.from(m.values())
        .sort((a, b) => Number(b.total_amount) - Number(a.total_amount))
        .slice(0, 12);
    }

    // 3) Top merchants por batch (expense + fee)
    let merQ = supabase
      .from("transactions")
      .select("amount,type,merchant_name,description_raw")
      .eq("user_id", user.id)
      .eq("import_batch_id", batchId)
      .in("type", ["expense", "fee"])
      .range(0, 4999);

    if (accountId) merQ = merQ.eq("account_id", accountId);
    if (useDate) {
      if (fromEff) merQ = merQ.gte("date", fromEff);
      if (toEff) merQ = merQ.lte("date", toEff);
    }

    const { data: merRows, error: merErr } = await merQ;
    if (merErr) {
      byMerErr = merErr;
    } else {
      const m = new Map<string, { merchant_name: string | null; total_amount: number; tx_count: number }>();

      for (const r of merRows ?? []) {
        const amount = Number((r as any).amount ?? 0);
        const name =
          (r as any).merchant_name != null && String((r as any).merchant_name).trim() !== ""
            ? String((r as any).merchant_name)
            : String((r as any).description_raw ?? "Sin merchant");

        const key = name || "Sin merchant";

        const cur = m.get(key) ?? { merchant_name: key, total_amount: 0, tx_count: 0 };
        cur.total_amount += amount;
        cur.tx_count += 1;
        m.set(key, cur);
      }

      byMer = Array.from(m.values())
        .sort((a, b) => Number(b.total_amount) - Number(a.total_amount))
        .slice(0, 10);
    }
  } else {
    /**
     * Sin batch: tus RPCs existentes
     * tx_totals(p_from, p_to, p_account_id, p_types)
     * tx_by_category(p_from, p_to, p_account_id, p_types, p_limit)
     * tx_by_merchant(p_from, p_to, p_account_id, p_types, p_limit)
     */
    const from = fromEff ?? defaultFrom;
    const to = toEff ?? today;

    const { data: totals, error: tErr } = await supabase.rpc("tx_totals", {
      p_from: from,
      p_to: to,
      p_account_id: accountId,
      p_types: null,
    });
    totalsErr = tErr;

    const { data: cat, error: cErr } = await supabase.rpc("tx_by_category", {
      p_from: from,
      p_to: to,
      p_account_id: accountId,
      p_types: ["expense", "fee"],
      p_limit: 12,
    });
    byCatErr = cErr;

    const { data: mer, error: mErr } = await supabase.rpc("tx_by_merchant", {
      p_from: from,
      p_to: to,
      p_account_id: accountId,
      p_types: ["expense", "fee"],
      p_limit: 10,
    });
    byMerErr = mErr;

    const t0 = (totals as any)?.[0];
    kpi = {
      total: Number(t0?.total_amount ?? 0),
      expense: Number(t0?.expense_amount ?? 0),
      income: Number(t0?.income_amount ?? 0),
      payment: Number(t0?.payment_amount ?? 0),
      fee: Number(t0?.fee_amount ?? 0),
      uncategorizedAmount: Number(t0?.uncategorized_amount ?? 0),
      txCount: Number(t0?.tx_count ?? 0),
      uncategorizedCount: Number(t0?.uncategorized_count ?? 0),
    };

    byCat =
      ((cat ?? []) as any[]).map((r) => ({
        category_id: (r as any).category_id ?? null,
        category_name: String((r as any).category_name ?? "Sin categoría"),
        total_amount: Number((r as any).total_amount ?? 0),
        tx_count: Number((r as any).tx_count ?? 0),
      })) ?? [];

    byMer =
      ((mer ?? []) as any[]).map((r) => ({
        merchant_name: (r as any).merchant_name ?? null,
        total_amount: Number((r as any).total_amount ?? 0),
        tx_count: Number((r as any).tx_count ?? 0),
      })) ?? [];
  }

  const hasErrors = totalsErr || byCatErr || byMerErr;

  // DATA DEL GRÁFICO: categorías (X) vs total_amount (Y)
  const categoryChartData =
    (byCat ?? []).map((r) => ({
      category: String(r.category_name ?? "Sin categoría"),
      amount: Number(r.total_amount ?? 0),
      txCount: Number(r.tx_count ?? 0),
      category_id: (r.category_id as string | null) ?? null,
    })) ?? [];

  // contexto para links a /transactions
  const txBaseParams: Record<string, string | undefined> = {
    account: accountId ?? undefined,
    batch: batchId || undefined,
    from: fromUi || undefined,
    to: toUi || undefined,
    useDate: hasBatch && useDate ? "1" : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Reportes</h1>

          {selectedBatch ? (
            <div className="text-sm text-muted-foreground mt-1">
              Resumen seleccionado:{" "}
              <span className="font-medium">{batchLabel(selectedBatch)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {useDate ? "· Filtrando por fecha" : "· Sin filtro de fecha"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Período: <span className="font-medium">{fromUi}</span> a{" "}
              <span className="font-medium">{toUi}</span>
            </p>
          )}
        </div>

        <form method="get" className="flex items-end gap-2 flex-wrap">
          {/* Resumen principal */}
          <div className="grid gap-1 min-w-[320px]">
            <label className="text-xs text-muted-foreground">Resumen (PDF importado)</label>
            <select name="batch" defaultValue={batchId} className="h-9 rounded-md border px-2 bg-background">
              <option value="">Todos</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {batchLabel(b)}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-muted-foreground">
              Consejo: cargá <span className="font-medium">Vencimiento</span> y <span className="font-medium">Nota</span>{" "}
              al importar para poder encontrarlo luego.
            </div>
          </div>

          {/* Fechas (secundarias si hay batch) */}
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <input
              name="from"
              defaultValue={fromUi}
              type="date"
              className="h-9 rounded-md border px-2 bg-background"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <input
              name="to"
              defaultValue={toUi}
              type="date"
              className="h-9 rounded-md border px-2 bg-background"
            />
          </div>

          {/* Checkbox: activa filtro de fecha solo si hay batch */}
          <div className="flex items-center gap-2 h-9 px-2 rounded-md border bg-background">
            <input
              id="useDate"
              type="checkbox"
              name="useDate"
              value="1"
              defaultChecked={useDate}
              disabled={!hasBatch}
              className="h-4 w-4"
            />
            <label htmlFor="useDate" className="text-sm text-muted-foreground">
              Filtrar por fecha
            </label>
          </div>

          {/* Solo enviar account si existe */}
          {accountId ? <input type="hidden" name="account" value={accountId} /> : null}

          <button className="h-9 rounded-md bg-primary text-primary-foreground px-3 text-sm">
            Aplicar
          </button>
        </form>
      </div>

      {hasErrors ? (
        <div className="rounded-md border p-3 text-sm">
          Se detectaron errores al cargar datos.
          <ul className="list-disc ml-5 mt-2 text-muted-foreground">
            {totalsErr && <li>totals: {totalsErr.message}</li>}
            {byCatErr && <li>by_category: {byCatErr.message}</li>}
            {byMerErr && <li>by_merchant: {byMerErr.message}</li>}
          </ul>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ ...txBaseParams })}
        >
          <div className="text-xs text-muted-foreground">Total movimientos</div>
          <div className="text-xl font-semibold">{kpi.txCount}</div>
          <div className="text-sm mt-1">{fmtArs(kpi.total)}</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ ...txBaseParams, type: "expense" })}
        >
          <div className="text-xs text-muted-foreground">Gastos</div>
          <div className="text-xl font-semibold">{fmtArs(kpi.expense)}</div>
          <div className="text-xs text-muted-foreground mt-1">type=expense</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ ...txBaseParams, type: "income" })}
        >
          <div className="text-xs text-muted-foreground">Ingresos</div>
          <div className="text-xl font-semibold">{fmtArs(kpi.income)}</div>
          <div className="text-xs text-muted-foreground mt-1">type=income</div>
        </Link>

        <Link
          className="rounded-lg border p-4 hover:bg-muted/30 transition"
          href={buildTxHref({ ...txBaseParams, uncategorized: "1" })}
        >
          <div className="text-xs text-muted-foreground">Sin categoría</div>
          <div className="text-xl font-semibold">{kpi.uncategorizedCount}</div>
          <div className="text-sm mt-1">{fmtArs(kpi.uncategorizedAmount)}</div>
        </Link>
      </div>

      {/* Gráfico: Categorías (X) vs ARS (Y) */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Gastos por categoría (expense + fee)</h2>
          <div className="text-xs text-muted-foreground">
            Eje X: categoría · Eje Y: importe ARS
            {selectedBatch ? (
              <span className="ml-2">
                · Resumen: <span className="font-medium">{selectedBatch.due_date ?? selectedBatch.created_at.slice(0, 10)}</span>
              </span>
            ) : null}
          </div>
        </div>
        <ReportsChart data={categoryChartData} />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Top categorías (expense + fee)</h3>
            <Link className="text-sm underline" href={buildTxHref({ ...txBaseParams })}>
              Ver transacciones
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(byCat ?? []).map((r) => {
              const href = r.category_id
                ? buildTxHref({ ...txBaseParams, category: r.category_id })
                : buildTxHref({ ...txBaseParams, uncategorized: "1" });

              return (
                <Link
                  key={`${r.category_id ?? "null"}`}
                  href={href}
                  className="block rounded-md border p-3 hover:bg-muted/30 transition"
                >
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
              <div className="text-sm text-muted-foreground">Sin datos para el filtro.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Top merchants (expense + fee)</h3>
            <Link className="text-sm underline" href={buildTxHref({ ...txBaseParams })}>
              Ver transacciones
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(byMer ?? []).map((r) => {
              const m = String(r.merchant_name ?? "Sin merchant");
              const href = buildTxHref({ ...txBaseParams, q: m });

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
              <div className="text-sm text-muted-foreground">Sin datos para el filtro.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
