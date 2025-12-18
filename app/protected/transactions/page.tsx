// app/(protected)/transactions/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

type TxType = "expense" | "income" | "transfer" | "payment" | "fee";

function fmtArs(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function asString(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

function parseTypes(sp: SearchParams): TxType[] | null {
  const t = asString(sp.type);
  const types = asString(sp.types);

  const raw = (t ?? types)?.trim();
  if (!raw) return null;

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const allowed: TxType[] = ["expense", "income", "transfer", "payment", "fee"];
  const out = parts.filter((p) => allowed.includes(p as TxType)) as TxType[];
  return out.length ? out : null;
}

function buildSelfHref(filters: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") qs.set(k, v);
  }
  return `/protected/transactions?${qs.toString()}`;
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();

  const from = asString(searchParams.from);
  const to = asString(searchParams.to);
  const accountId = asString(searchParams.accountId);
  const categoryId = asString(searchParams.categoryId);
  const merchant = asString(searchParams.merchant);
  const q = asString(searchParams.q);

  const uncategorized =
    asString(searchParams.uncategorized) === "1" ||
    asString(searchParams.uncategorized)?.toLowerCase() === "true";

  const types = parseTypes(searchParams);

  // Paginación simple
  const page = Math.max(1, Number(asString(searchParams.page) ?? "1"));
  const pageSize = Math.min(200, Math.max(10, Number(asString(searchParams.pageSize) ?? "50")));
  const fromRow = (page - 1) * pageSize;
  const toRow = fromRow + pageSize - 1;

  // Listas para filtros (asumiendo RLS por user_id)
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  // Query base
  let query = supabase
    .from("transactions")
    .select(
      "id, date, description_raw, merchant_name, category_id, account_id, amount, type, receipt, installment_number, installments_total, created_at",
      { count: "exact" }
    );

  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (accountId) query = query.eq("account_id", accountId);
  if (categoryId) query = query.eq("category_id", categoryId);

  // Filtro "Sin categoría" (diseñado para gastos)
  if (uncategorized) {
    query = query.is("category_id", null).in("type", ["expense", "fee"]);
  } else if (types?.length) {
    query = query.in("type", types);
  }

  if (merchant) query = query.ilike("merchant_name", `%${merchant}%`);
  if (q) query = query.ilike("description_raw", `%${q}%`);

  // Orden + paginado
  const { data: rows, count, error } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromRow, toRow);

  // Lookups (evita join complejo; estable)
  const catMap = new Map((categories ?? []).map((c: any) => [c.id, c.name]));
  const accMap = new Map((accounts ?? []).map((a: any) => [a.id, a.name]));

  // Totales (del período/selección principal). Nota: tx_totals no contempla category/merchant/q;
  // pero sirve como KPI de contexto. Si querés "totales exactos del filtro", lo resolvemos con otro RPC.
  const { data: totals } = await supabase.rpc("tx_totals", {
    p_from: from ?? "1900-01-01",
    p_to: to ?? "2999-12-31",
    p_account_id: accountId ?? null,
    p_types: uncategorized ? ["expense", "fee"] : types ?? null,
  });
  const t0: any = totals?.[0];
  const totalAmount = Number(t0?.total_amount ?? 0);
  const txCount = Number(t0?.tx_count ?? 0);

  const totalPages = Math.max(1, Math.ceil(Number(count ?? 0) / pageSize));

  const currentFilters = {
    from,
    to,
    accountId: accountId ?? undefined,
    categoryId: categoryId ?? undefined,
    merchant: merchant ?? undefined,
    q: q ?? undefined,
    type: (types?.length ? types.join(",") : undefined),
    uncategorized: uncategorized ? "1" : undefined,
    pageSize: String(pageSize),
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Transacciones</h1>
          <div className="text-sm text-muted-foreground">
            Resultado: <span className="font-medium">{count ?? 0}</span> | Contexto período/tipo:{" "}
            <span className="font-medium">{txCount}</span> | Total: <span className="font-medium">{fmtArs(totalAmount)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link className="h-9 px-3 rounded-md border inline-flex items-center" href="/protected/reports">
            Ir a Reportes
          </Link>
          <Link className="h-9 px-3 rounded-md bg-primary text-primary-foreground inline-flex items-center" href="/protected/transactions/import-pdf">
            Importar PDF
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border p-3 text-sm">
          Error al cargar transacciones: <span className="text-muted-foreground">{error.message}</span>
        </div>
      ) : null}

      {/* Barra de filtros (GET) */}
      <form method="get" className="rounded-lg border p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <input name="from" defaultValue={from ?? ""} type="date" className="h-9 rounded-md border px-2 bg-background" />
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input name="to" defaultValue={to ?? ""} type="date" className="h-9 rounded-md border px-2 bg-background" />
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Cuenta</label>
          <select name="accountId" defaultValue={accountId ?? ""} className="h-9 rounded-md border px-2 bg-background">
            <option value="">Todas</option>
            {(accounts ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <select name="type" defaultValue={(types?.[0] ?? "") as any} className="h-9 rounded-md border px-2 bg-background">
            <option value="">Todos</option>
            <option value="expense">expense</option>
            <option value="income">income</option>
            <option value="payment">payment</option>
            <option value="fee">fee</option>
            <option value="transfer">transfer</option>
          </select>
          {/* Nota: si querés multi-tipo, podés reemplazar esto por un input types="expense,fee" */}
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Categoría</label>
          <select name="categoryId" defaultValue={categoryId ?? ""} className="h-9 rounded-md border px-2 bg-background">
            <option value="">Todas</option>
            {(categories ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Merchant (contiene)</label>
          <input name="merchant" defaultValue={merchant ?? ""} className="h-9 rounded-md border px-2 bg-background" placeholder="Ej: MERPAGO" />
        </div>

        <div className="md:col-span-4 grid gap-1">
          <label className="text-xs text-muted-foreground">Buscar en descripción</label>
          <input name="q" defaultValue={q ?? ""} className="h-9 rounded-md border px-2 bg-background" placeholder="Texto libre (ilike)" />
        </div>

        <div className="md:col-span-1 flex items-end gap-2">
          <label className="text-sm inline-flex items-center gap-2 select-none">
            <input name="uncategorized" type="checkbox" value="1" defaultChecked={uncategorized} />
            Sin categoría
          </label>
        </div>

        <div className="md:col-span-1 flex items-end gap-2">
          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <button className="h-9 rounded-md bg-primary text-primary-foreground px-3 text-sm">Aplicar</button>
          <Link className="h-9 rounded-md border px-3 text-sm inline-flex items-center" href="/protected/transactions">
            Limpiar
          </Link>
        </div>
      </form>

      {/* Lista */}
      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
          <div className="col-span-2">Fecha</div>
          <div className="col-span-4">Descripción</div>
          <div className="col-span-2">Merchant</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-1">Tipo</div>
          <div className="col-span-1 text-right">Monto</div>
        </div>

        {(rows ?? []).map((r: any) => {
          const catName = r.category_id ? catMap.get(r.category_id) : "Sin categoría";
          const accName = r.account_id ? accMap.get(r.account_id) : "";
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-b last:border-b-0">
              <div className="col-span-2">
                <div className="font-medium">{r.date}</div>
                <div className="text-xs text-muted-foreground truncate">{accName}</div>
              </div>

              <div className="col-span-4 min-w-0">
                <div className="truncate">{r.description_raw}</div>
                <div className="text-xs text-muted-foreground">
                  {r.receipt ? `Comp: ${r.receipt}` : ""}
                  {r.installment_number ? ` · Cuota: ${r.installment_number}/${r.installments_total ?? "?"}` : ""}
                </div>
              </div>

              <div className="col-span-2 min-w-0">
                <div className="truncate">{r.merchant_name ?? "—"}</div>
              </div>

              <div className="col-span-2 min-w-0">
                <div className="truncate">{catName}</div>
              </div>

              <div className="col-span-1">
                <div className="text-xs rounded-md border px-2 py-1 inline-block">{r.type}</div>
              </div>

              <div className="col-span-1 text-right font-semibold">{fmtArs(Number(r.amount ?? 0))}</div>
            </div>
          );
        })}

        {(rows ?? []).length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Sin transacciones para el filtro actual.</div>
        ) : null}
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Página {page} de {totalPages}
        </div>

        <div className="flex gap-2">
          <Link
            className={`h-9 px-3 rounded-md border inline-flex items-center ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            href={buildSelfHref({ ...currentFilters, page: String(page - 1) })}
          >
            Anterior
          </Link>
          <Link
            className={`h-9 px-3 rounded-md border inline-flex items-center ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
            href={buildSelfHref({ ...currentFilters, page: String(page + 1) })}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </div>
  );
}
