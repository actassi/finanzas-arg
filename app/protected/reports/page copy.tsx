// import Link from "next/link";
// import { redirect } from "next/navigation";
// import { createClient } from "@/lib/supabase/server";
// import ReportsChart from "./reports-chart";
// import IncomeExpenseChart from "./income-expense-chart";

// type SearchParams = Record<string, string | string[] | undefined>;

// type AccountRow = {
//   id: string;
//   user_id: string;
//   name: string;
//   currency: string;
// };

// type ImportBatchRow = {
//   id: string;
//   user_id: string;
//   account_id: string;
//   created_at: string; // timestamptz
//   provider: string | null;
//   institution: string | null;
//   file_name: string | null;
//   due_date: string | null; // date
//   cut_off_date: string | null; // date
//   statement_period_start: string | null; // date
//   statement_period_end: string | null; // date
//   note: string | null;
// };

// function fmtArs(n: number) {
//   return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n || 0));
// }

// function getParam(sp: SearchParams, key: string): string | undefined {
//   const v = sp[key];
//   return Array.isArray(v) ? v[0] : v;
// }

// // Fecha local ISO (tz) sin librerías externas
// function getLocalISODate(tz = "America/Argentina/Cordoba", d = new Date()) {
//   const parts = new Intl.DateTimeFormat("en-CA", {
//     timeZone: tz,
//     year: "numeric",
//     month: "2-digit",
//     day: "2-digit",
//   }).formatToParts(d);
//   const y = parts.find((p) => p.type === "year")?.value ?? "1970";
//   const m = parts.find((p) => p.type === "month")?.value ?? "01";
//   const day = parts.find((p) => p.type === "day")?.value ?? "01";
//   return `${y}-${m}-${day}`;
// }

// function startOfMonthISO(isoDate: string) {
//   return `${isoDate.slice(0, 7)}-01`;
// }

// // Fin de mes en TZ (evita “off by one” por UTC)
// function endOfMonthISO(isoDate: string, tz: string) {
//   const y = Number(isoDate.slice(0, 4));
//   const m0 = Number(isoDate.slice(5, 7)) - 1; // 0-11
//   // Usamos 12:00 UTC para evitar cruzar de día al formatear en TZ
//   const d = new Date(Date.UTC(y, m0 + 1, 0, 12, 0, 0)); // día 0 del mes siguiente => último día del mes actual
//   return getLocalISODate(tz, d);
// }

// function buildTxHref(params: Record<string, string | undefined>) {
//   const usp = new URLSearchParams();
//   Object.entries(params).forEach(([k, v]) => {
//     if (v !== undefined && v !== "") usp.set(k, v);
//   });
//   const qs = usp.toString();
//   return qs ? `/protected/transactions?${qs}` : `/protected/transactions`;
// }

// function batchLabel(b: ImportBatchRow) {
//   const ref = b.due_date ?? (b.created_at ? b.created_at.slice(0, 10) : "");
//   const provider = b.provider ? b.provider.toUpperCase() : "PDF";
//   const note = b.note ? ` · ${b.note}` : "";
//   const file = b.file_name ? ` · ${b.file_name}` : "";
//   return `${provider} · ${ref}${note}${file}`;
// }

// export default async function ReportsPage(props: {
//   searchParams: SearchParams | Promise<SearchParams>;
// }) {
//   const supabase = await createClient();

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   if (!user) redirect("/auth/login");

//   const sp = await props.searchParams;

//   const tz = "America/Argentina/Cordoba";
//   const today = getLocalISODate(tz);
//   const defaultFrom = startOfMonthISO(today);
//   const defaultTo = endOfMonthISO(today, tz);

//   // Inputs “como en Transacciones”
//   const fromInput = getParam(sp, "from") ?? defaultFrom;
//   const toInput = getParam(sp, "to") ?? defaultTo;

//   const accountRaw = (getParam(sp, "account") ?? "").trim();
//   const accountId = accountRaw ? accountRaw : "";

//   const batchRaw = (getParam(sp, "batch") ?? "").trim();
//   const batchId = batchRaw ? batchRaw : "";

//   // Cargar cuentas + batches + categorías (para mapear nombres + colores)
//   const [
//     { data: accountsData, error: accErr },
//     { data: batchesData, error: batchesErr },
//     { data: catsData, error: catsErr },
//   ] = await Promise.all([
//     supabase
//       .from("accounts")
//       .select("id,user_id,name,currency")
//       .eq("user_id", user.id)
//       .order("name", { ascending: true }),
//     supabase
//       .from("import_batches")
//       .select(
//         "id,user_id,account_id,created_at,provider,institution,file_name,due_date,cut_off_date,statement_period_start,statement_period_end,note"
//       )
//       .eq("user_id", user.id)
//       .order("created_at", { ascending: false })
//       .limit(80),
//     // ✅ IMPORTANTE: traemos color
//     supabase
//       .from("categories")
//       .select("id,name,subcategory,color")
//       .eq("user_id", user.id)
//       .order("name", { ascending: true }),
//   ]);

//   if (accErr) console.error("Error cargando accounts:", accErr);
//   if (batchesErr) console.error("Error cargando import_batches:", batchesErr);
//   if (catsErr) console.error("Error cargando categories:", catsErr);

//   const accounts = (accountsData ?? []) as AccountRow[];

//   const batchesAll = (batchesData ?? []) as ImportBatchRow[];
//   const batches = accountId ? batchesAll.filter((b) => b.account_id === accountId) : batchesAll;
//   const selectedBatch = batchId ? batchesAll.find((b) => b.id === batchId) ?? null : null;

//   // Map id -> "Nombre / Sub" + Map id -> color
//   const catMap = new Map<string, string>();
//   const catColorMap = new Map<string, string>();

//   for (const c of catsData ?? []) {
//     const id = String((c as any).id);
//     const name = String((c as any).name ?? "");
//     const sub = String((c as any).subcategory ?? "").trim();
//     const color = String((c as any).color ?? "").trim();

//     catMap.set(id, sub ? `${name} / ${sub}` : name);
//     if (color) catColorMap.set(id, color);
//   }

//   /**
//    * Modo efectivo (igual a Transacciones):
//    * - Si hay batch seleccionado => “Resumen” manda (ignora fechas)
//    * - Si NO hay batch => se usa from/to
//    */
//   const mode: "statement" | "dates" = selectedBatch ? "statement" : "dates";

//   // Período “mostrado” (informativo)
//   const effFrom =
//     mode === "statement"
//       ? (selectedBatch?.statement_period_start ?? selectedBatch?.cut_off_date ?? fromInput)
//       : fromInput;

//   const effTo =
//     mode === "statement"
//       ? (selectedBatch?.statement_period_end ?? selectedBatch?.due_date ?? toInput)
//       : toInput;

//   // KPIs / Rankings
//   let kpi = {
//     total: 0,
//     expense: 0,
//     income: 0,
//     payment: 0,
//     fee: 0,
//     transfer: 0,
//     txCount: 0,
//     uncategorizedAmount: 0,
//     uncategorizedCount: 0,
//   };

//   let byCatList: Array<{ category_id: string | null; category_name: string; total_amount: number; tx_count: number }> = [];
//   let byMerList: Array<{ merchant_name: string; total_amount: number; tx_count: number }> = [];

//   if (mode === "dates") {
//     // Fechas (RPCs)
//     const { data: totals, error: totalsErr } = await supabase.rpc("tx_totals", {
//       p_from: effFrom,
//       p_to: effTo,
//       p_account_id: accountId ? accountId : null,
//       p_types: null,
//     });

//     const { data: byCat, error: byCatErr } = await supabase.rpc("tx_by_category", {
//       p_from: effFrom,
//       p_to: effTo,
//       p_account_id: accountId ? accountId : null,
//       p_types: ["expense", "fee"],
//       p_limit: 12,
//     });

//     const { data: byMer, error: byMerErr } = await supabase.rpc("tx_by_merchant", {
//       p_from: effFrom,
//       p_to: effTo,
//       p_account_id: accountId ? accountId : null,
//       p_types: ["expense", "fee"],
//       p_limit: 10,
//     });

//     if (totalsErr) console.error("tx_totals error:", totalsErr);
//     if (byCatErr) console.error("tx_by_category error:", byCatErr);
//     if (byMerErr) console.error("tx_by_merchant error:", byMerErr);

//     const t0 = totals?.[0];
//     kpi = {
//       total: Number(t0?.total_amount ?? 0),
//       expense: Number(t0?.expense_amount ?? 0),
//       income: Number(t0?.income_amount ?? 0),
//       payment: Number(t0?.payment_amount ?? 0),
//       fee: Number(t0?.fee_amount ?? 0),
//       transfer: Number(t0?.transfer_amount ?? 0),
//       uncategorizedAmount: Number(t0?.uncategorized_amount ?? 0),
//       txCount: Number(t0?.tx_count ?? 0),
//       uncategorizedCount: Number(t0?.uncategorized_count ?? 0),
//     };

//     byCatList = (byCat ?? []).map((r: any) => ({
//       category_id: (r.category_id as string | null) ?? null,
//       category_name: String(r.category_name ?? "Sin categoría"),
//       total_amount: Number(r.total_amount ?? 0),
//       tx_count: Number(r.tx_count ?? 0),
//     }));

//     byMerList = (byMer ?? []).map((r: any) => ({
//       merchant_name: String(r.merchant_name ?? "Sin merchant"),
//       total_amount: Number(r.total_amount ?? 0),
//       tx_count: Number(r.tx_count ?? 0),
//     }));
//   } else {
//     // Resumen (batch): query directa por import_batch_id (sin fechas)
//     let q = supabase
//       .from("transactions")
//       .select("id,amount,type,category_id,merchant_name", { count: "exact" })
//       .eq("user_id", user.id)
//       .eq("import_batch_id", batchId)
//       .range(0, 4999);

//     if (accountId) q = q.eq("account_id", accountId);

//     const { data: txRows, error: txErr, count } = await q;

//     if (txErr) console.error("Error cargando tx por batch:", txErr);

//     const rows = (txRows ?? []) as any[];

//     const totalsAcc = {
//       total: 0,
//       expense: 0,
//       income: 0,
//       payment: 0,
//       fee: 0,
//       transfer: 0,
//       txCount: Number(count ?? rows.length ?? 0),
//       uncategorizedAmount: 0,
//       uncategorizedCount: 0,
//     };

//     const catAgg = new Map<string, { category_id: string | null; category_name: string; total: number; count: number }>();
//     const merAgg = new Map<string, { merchant_name: string; total: number; count: number }>();

//     for (const r of rows) {
//       const amount = Number(r.amount ?? 0);
//       const type = String(r.type ?? "other");

//       totalsAcc.total += amount;
//       if (type === "expense") totalsAcc.expense += amount;
//       else if (type === "income") totalsAcc.income += amount;
//       else if (type === "payment") totalsAcc.payment += amount;
//       else if (type === "fee") totalsAcc.fee += amount;
//       else if (type === "transfer") totalsAcc.transfer += amount;

//       const catId: string | null = r.category_id ?? null;

//       if (!catId) {
//         const isOut = type === "expense" || type === "fee";
//         if (isOut) {
//           totalsAcc.uncategorizedAmount += amount;
//           totalsAcc.uncategorizedCount += 1;
//         }
//       }

//       // Rankings solo expense+fee
//       if (type === "expense" || type === "fee") {
//         const key = catId ?? "__null__";
//         const name = catId ? (catMap.get(catId) ?? "Categoría eliminada") : "Sin categoría";

//         const prev = catAgg.get(key);
//         if (!prev) catAgg.set(key, { category_id: catId, category_name: name, total: amount, count: 1 });
//         else {
//           prev.total += amount;
//           prev.count += 1;
//         }

//         const m = String(r.merchant_name ?? "Sin merchant").trim() || "Sin merchant";
//         const pm = merAgg.get(m);
//         if (!pm) merAgg.set(m, { merchant_name: m, total: amount, count: 1 });
//         else {
//           pm.total += amount;
//           pm.count += 1;
//         }
//       }
//     }

//     kpi = totalsAcc;

//     byCatList = [...catAgg.values()]
//       .sort((a, b) => b.total - a.total)
//       .slice(0, 12)
//       .map((x) => ({
//         category_id: x.category_id,
//         category_name: x.category_name,
//         total_amount: x.total,
//         tx_count: x.count,
//       }));

//     byMerList = [...merAgg.values()]
//       .sort((a, b) => b.total - a.total)
//       .slice(0, 10)
//       .map((x) => ({
//         merchant_name: x.merchant_name,
//         total_amount: x.total,
//         tx_count: x.count,
//       }));
//   }

//   // ✅ Agregamos color sin cambiar la interfaz de ReportsChart
//   const categoryChartData = byCatList.map((r) => ({
//     category: r.category_name,
//     amount: r.total_amount,
//     txCount: r.tx_count,
//     category_id: r.category_id,
//     color: r.category_id ? (catColorMap.get(r.category_id) ?? null) : null,
//   }));

//   return (
//     <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-6">
//       <div className="flex items-start justify-between gap-4 flex-wrap">
//         <div className="min-w-0">
//           <h1 className="text-xl font-semibold text-slate-100">Visualizaciones</h1>
//           <div className="text-sm text-slate-300">
//             Modo:{" "}
//             <span className="text-slate-100 font-medium">
//               {mode === "statement" ? "Resumen (PDF)" : "Por fechas"}
//             </span>{" "}
//             · Período: <span className="text-slate-100 font-medium">{effFrom}</span> a{" "}
//             <span className="text-slate-100 font-medium">{effTo}</span>
//           </div>

//           {mode === "statement" && selectedBatch ? (
//             <div className="mt-2 text-xs text-slate-300">
//               <span className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 inline-flex items-center">
//                 Resumen seleccionado:{" "}
//                 <span className="ml-2 text-slate-100 font-medium">{batchLabel(selectedBatch)}</span>
//               </span>
//             </div>
//           ) : null}
//         </div>

//         <div className="flex gap-2">
//           <Link
//             className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
//             href="/protected/transactions"
//           >
//             Transacciones
//           </Link>
//           <Link
//             className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
//             href="/protected/categories"
//           >
//             Categorías
//           </Link>
//         </div>
//       </div>

//       {/* Filtros (mismo “look & feel” que Transacciones) */}
//       <form method="get" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
//         <div className="md:col-span-2">
//           <label className="text-xs text-slate-300">Desde</label>
//           <input
//             type="date"
//             name="from"
//             defaultValue={fromInput}
//             className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
//           />
//         </div>

//         <div className="md:col-span-2">
//           <label className="text-xs text-slate-300">Hasta</label>
//           <input
//             type="date"
//             name="to"
//             defaultValue={toInput}
//             className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
//           />
//         </div>

//         <div className="md:col-span-3">
//           <label className="text-xs text-slate-300">Cuenta</label>
//           <select
//             name="account"
//             defaultValue={accountId}
//             className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
//           >
//             <option value="">Todas</option>
//             {accounts.map((a) => (
//               <option key={a.id} value={a.id}>
//                 {a.name} ({a.currency})
//               </option>
//             ))}
//           </select>
//         </div>

//         <div className="md:col-span-5">
//           <label className="text-xs text-slate-300">Resumen (PDF importado)</label>
//           <select
//             name="batch"
//             defaultValue={batchId}
//             className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
//           >
//             <option value="">(Sin resumen: usa fechas)</option>
//             {batches.map((b) => (
//               <option key={b.id} value={b.id}>
//                 {batchLabel(b)}
//               </option>
//             ))}
//           </select>
//           <div className="mt-1 text-[11px] text-slate-400">
//             Si seleccionás un resumen, el período se toma del batch (las fechas quedan como referencia).
//           </div>
//         </div>

//         <div className="md:col-span-12 flex justify-end gap-2">
//           <button
//             type="submit"
//             className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
//           >
//             Aplicar
//           </button>
//         </div>
//       </form>

//       {/* KPIs */}
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
//         <Link
//           className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800/50 transition"
//           href={
//             mode === "statement"
//               ? buildTxHref({ batch: batchId || undefined, account: accountId || undefined })
//               : buildTxHref({ from: effFrom, to: effTo, account: accountId || undefined })
//           }
//         >
//           <div className="text-xs text-slate-400">Total movimientos</div>
//           <div className="text-xl font-semibold text-slate-100">{kpi.txCount}</div>
//           <div className="text-sm mt-1 text-slate-200">{fmtArs(kpi.total)}</div>
//         </Link>

//         <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
//           <div className="text-xs text-slate-400">Ingresos</div>
//           <div className="text-xl font-semibold text-slate-100">{fmtArs(kpi.income)}</div>
//           <div className="text-xs text-slate-500 mt-1">type=income</div>
//         </div>

//         <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
//           <div className="text-xs text-slate-400">Egresos (expense + fee)</div>
//           <div className="text-xl font-semibold text-slate-100">
//             {fmtArs(Number(kpi.expense) + Number(kpi.fee))}
//           </div>
//           <div className="text-xs text-slate-500 mt-1">expense + fee</div>
//         </div>

//         <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
//           <div className="text-xs text-slate-400">Sin categoría (egresos)</div>
//           <div className="text-xl font-semibold text-slate-100">{kpi.uncategorizedCount}</div>
//           <div className="text-sm mt-1 text-slate-200">{fmtArs(kpi.uncategorizedAmount)}</div>
//         </div>
//       </div>

//       {/* Comparativa */}
//       <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
//         <div className="flex items-center justify-between flex-wrap gap-2">
//           <h2 className="font-semibold text-slate-100">Comparativa Ingresos vs Egresos</h2>
//           <div className="text-xs text-slate-400">Incluye Neto (Ingresos − Egresos)</div>
//         </div>
//         <IncomeExpenseChart income={kpi.income} expense={Number(kpi.expense) + Number(kpi.fee)} />
//       </div>

//       {/* Por categoría */}
//       <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
//         <div className="flex items-center justify-between flex-wrap gap-2">
//           <h2 className="font-semibold text-slate-100">Egresos por categoría (expense + fee)</h2>
//           <div className="text-xs text-slate-400">Eje X: categoría · Eje Y: importe ARS</div>
//         </div>
//         <ReportsChart data={categoryChartData} />
//       </div>

//       {/* Rankings */}
//       <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
//         <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-slate-100">Top categorías (expense + fee)</h3>
//             <Link
//               className="text-sm underline text-slate-200"
//               href={
//                 mode === "statement"
//                   ? buildTxHref({ batch: batchId || undefined, account: accountId || undefined })
//                   : buildTxHref({ from: effFrom, to: effTo, account: accountId || undefined })
//               }
//             >
//               Ver transacciones
//             </Link>
//           </div>

//           <div className="mt-3 space-y-2">
//             {byCatList.map((r) => {
//               const href =
//                 mode === "statement"
//                   ? buildTxHref({
//                       batch: batchId || undefined,
//                       account: accountId || undefined,
//                       category: r.category_id ?? undefined,
//                       uncategorized: r.category_id ? undefined : "1",
//                     })
//                   : buildTxHref({
//                       from: effFrom,
//                       to: effTo,
//                       account: accountId || undefined,
//                       category: r.category_id ?? undefined,
//                       uncategorized: r.category_id ? undefined : "1",
//                     });

//               return (
//                 <Link
//                   key={`${r.category_id ?? "null"}`}
//                   href={href}
//                   className="block rounded-md border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-800/50 transition"
//                 >
//                   <div className="flex items-center justify-between gap-3">
//                     <div className="min-w-0">
//                       <div className="font-medium truncate text-slate-100">{r.category_name}</div>
//                       <div className="text-xs text-slate-400">{r.tx_count} movimientos</div>
//                     </div>
//                     <div className="font-semibold text-slate-100">{fmtArs(r.total_amount)}</div>
//                   </div>
//                 </Link>
//               );
//             })}

//             {!byCatList.length ? (
//               <div className="text-sm text-slate-400">Sin datos para el período/alcance.</div>
//             ) : null}
//           </div>
//         </div>

//         <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-slate-100">Top merchants (expense + fee)</h3>
//             <Link
//               className="text-sm underline text-slate-200"
//               href={
//                 mode === "statement"
//                   ? buildTxHref({ batch: batchId || undefined, account: accountId || undefined })
//                   : buildTxHref({ from: effFrom, to: effTo, account: accountId || undefined })
//               }
//             >
//               Ver transacciones
//             </Link>
//           </div>

//           <div className="mt-3 space-y-2">
//             {byMerList.map((r) => {
//               const href =
//                 mode === "statement"
//                   ? buildTxHref({ batch: batchId || undefined, account: accountId || undefined, q: r.merchant_name })
//                   : buildTxHref({ from: effFrom, to: effTo, account: accountId || undefined, q: r.merchant_name });

//               return (
//                 <Link
//                   key={r.merchant_name}
//                   href={href}
//                   className="block rounded-md border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-800/50 transition"
//                 >
//                   <div className="flex items-center justify-between gap-3">
//                     <div className="min-w-0">
//                       <div className="font-medium truncate text-slate-100">{r.merchant_name}</div>
//                       <div className="text-xs text-slate-400">{r.tx_count} movimientos</div>
//                     </div>
//                     <div className="font-semibold text-slate-100">{fmtArs(r.total_amount)}</div>
//                   </div>
//                 </Link>
//               );
//             })}

//             {!byMerList.length ? (
//               <div className="text-sm text-slate-400">Sin datos para el período/alcance.</div>
//             ) : null}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
