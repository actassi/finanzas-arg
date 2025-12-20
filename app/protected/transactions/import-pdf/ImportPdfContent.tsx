import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { importTransactionsFromPdf } from "../actions";

type SearchParams = { imported?: string; duplicate?: string };

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  type?: string | null;
  institution?: string | null;
};

export default async function ImportPdfContent(props: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const sp = await props.searchParams;

  const imported = Number(sp.imported ?? "0") || 0;
  const duplicate = sp.duplicate === "1";

  const { data: accountsData, error: accErr } = await supabase
    .from("accounts")
    .select("id, user_id, name, currency, type, institution")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (accErr) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="text-sm text-red-300">
          Error cargando cuentas: {accErr.message}
        </div>
      </div>
    );
  }

  const accounts = (accountsData ?? []) as AccountRow[];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Importar PDF</h1>
          <p className="text-sm text-slate-300">
            Importación por PDF (VISA). Se generará un “batch” y se asociarán las transacciones al PDF.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/protected/transactions"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Volver a Transacciones
          </Link>
          <Link
            href="/protected/reports"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Ir a Visualizaciones
          </Link>
        </div>
      </div>

      {duplicate ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Este PDF ya fue importado (duplicado detectado por hash). No se insertaron transacciones.
        </div>
      ) : null}

      {imported > 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Importación OK. Se insertaron <span className="font-semibold">{imported}</span> transacciones.
        </div>
      ) : null}

      <form action={importTransactionsFromPdf} className="space-y-4">
        {/* Bloque: archivo + cuenta + tipo */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="text-xs text-slate-300">Cuenta</label>
            <select
              name="account_id"
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Seleccionar...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency}){a.institution ? ` · ${a.institution}` : ""}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-slate-400">
              Se usa para vincular el batch y las transacciones.
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-300">Tipo por defecto</label>
            <select
              name="type"
              defaultValue="expense"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="expense">expense (gasto)</option>
              <option value="income">income (ingreso)</option>
              <option value="payment">payment (pago)</option>
              <option value="fee">fee (comisión)</option>
              <option value="transfer">transfer (transferencia)</option>
            </select>
            <div className="mt-1 text-[11px] text-slate-400">
              “SU PAGO EN PESOS” se normaliza automáticamente a payment.
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Archivo PDF</label>
            <input
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-100 hover:file:bg-slate-700"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Se calcula SHA-256 para evitar duplicados (si el índice está activo).
            </div>
          </div>
        </div>

        {/* Bloque: metadata para “encontrar el resumen” */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-medium text-slate-100">Datos del resumen (batch)</div>
              <div className="text-xs text-slate-400">
                Recomendado para ubicar “Vencimiento Noviembre 2025”, etc.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <label className="text-xs text-slate-300">Proveedor</label>
              <input
                name="provider"
                defaultValue="VISA"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="VISA"
              />
            </div>

            <div className="md:col-span-4">
              <label className="text-xs text-slate-300">Institución (opcional)</label>
              <input
                name="institution"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Ej: Galicia"
              />
            </div>

            <div className="md:col-span-5">
              <label className="text-xs text-slate-300">Nota (opcional)</label>
              <input
                name="note"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Ej: Resumen vencimiento Noviembre 2025"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-300">Vencimiento</label>
              <input
                name="due_date"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-300">Cierre</label>
              <input
                name="cut_off_date"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-300">Período desde</label>
              <input
                name="statement_period_start"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-300">Período hasta</label>
              <input
                name="statement_period_end"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-400">
            Estas fechas no afectan el parseo del PDF; quedan guardadas en <code>import_batches</code> para poder filtrar/ubicar el resumen.
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            Importar
          </button>
        </div>
      </form>
    </div>
  );
}
