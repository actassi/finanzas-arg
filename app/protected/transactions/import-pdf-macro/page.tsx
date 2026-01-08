import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ImportMacroVisaClient from './ImportMacroVisaClient';

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
};

export default async function ImportPdfMacroPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: accountsData, error: accErr } = await supabase
    .from('accounts')
    .select('id,user_id,name,currency')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (accErr) console.error('Error cargando accounts:', accErr);

  const accounts = (accountsData ?? []) as AccountRow[];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Importar PDF (Macro/Visa – OCR)</h1>
          <div className="text-sm text-slate-300">
            Importador separado (no toca tu parser existente). Parseo en el navegador + OCR.
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/protected/transactions/import-pdf"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Importador actual
          </Link>
          <Link
            href="/protected/transactions"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Transacciones
          </Link>
        </div>
      </div>

      <ImportMacroVisaClient accounts={accounts} />
    </div>
  );
}
