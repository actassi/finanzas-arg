import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/db";
import AccountsTableClient from "./AccountsTableClient";

type AccountRow = Account & { tx_count: number };

export default async function AccountsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: accountsData, error } = await supabase
    .from("accounts")
    .select("id,user_id,name,type,institution,currency,credit_limit,cut_off_day,due_day,interest_rate,created_at")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) console.error("Error cargando accounts:", error);

  const accountsBase = (accountsData ?? []) as Account[];

  // tx_count por cuenta (para permitir borrar solo si está en 0)
  const counts = await Promise.all(
    accountsBase.map(async (a) => {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("account_id", a.id);

      return { accountId: a.id, tx_count: Number(count ?? 0) };
    })
  );

  const countMap = new Map(counts.map((c) => [c.accountId, c.tx_count]));
  const accounts: AccountRow[] = accountsBase.map((a) => ({
    ...(a as any),
    tx_count: countMap.get(a.id) ?? 0,
  }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Cuentas</h1>
          <div className="text-sm text-slate-300">
            Administrá tus cuentas (banco, tarjeta, efectivo) para luego imputar transacciones y visualizar.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link
            href="/protected/transactions"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Ir a Transacciones
          </Link>
          <Link
            href="/protected/reports"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Ir a Visualizaciones
          </Link>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        Borrado: permitido solo si la cuenta no tiene movimientos asociados.
      </div>

      <AccountsTableClient accounts={accounts} />
    </div>
  );
}
