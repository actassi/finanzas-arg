'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Account } from '@/types/db';
import { importTransactionsFromPdf } from '../actions';

interface ImportPdfClientProps {
  accounts: Account[];
  imported: number;
}

export default function ImportPdfClient({
  accounts,
  imported,
}: ImportPdfClientProps) {
  const router = useRouter();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [type, setType] = useState('expense');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cuando se importan N filas, mostramos aviso y luego limpiamos la URL
  useEffect(() => {
    if (!imported) return;

    const timeout = setTimeout(() => {
      router.replace('/protected/transactions/import-pdf');
    }, 4000);

    return () => clearTimeout(timeout);
  }, [imported, router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-xl font-semibold mb-4">
            Importar transacciones desde PDF
          </h1>

          {imported > 0 && (
            <div className="mb-4 rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Se importaron correctamente {imported} transacciones desde el
              resumen PDF. Limpiando estado...
            </div>
          )}

          <p className="text-sm text-slate-300 mb-4">
            Subí el PDF del resumen de la tarjeta / cuenta. El parser principal
            busca líneas que empiezan con una fecha corta (por ejemplo{' '}
            <span className="font-mono">25.10.25</span> o{' '}
            <span className="font-mono">12-10-24</span>) y terminan con un
            importe tipo <span className="font-mono">14.590,00</span>. Más
            adelante podremos sumar parsers específicos por banco/tarjeta.
          </p>

          <form
            // Importante: no especificar method ni encType; React los define para server actions
            action={async (formData) => {
              setIsSubmitting(true);
              await importTransactionsFromPdf(formData);
              setIsSubmitting(false);
            }}
            className="space-y-4"
          >
            {/* Cuenta destino */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Cuenta destino</label>
              <select
                name="account_id"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo por defecto */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                Tipo por defecto para estas filas
              </label>
              <select
                name="type"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
                <option value="payment">Pago</option>
                <option value="transfer">Transferencia</option>
                <option value="fee">Comisión</option>
                <option value="other">Otro</option>
              </select>
            </div>

            {/* Archivo PDF */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                Archivo PDF del resumen
              </label>
              <input
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                className="text-sm text-slate-200"
                required
              />
              <p className="text-[11px] text-slate-400">
                Idealmente el PDF descargado directo del home banking. Si el
                formato es distinto y no se detectan líneas, ajustaremos el
                parser más adelante.
              </p>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Importando desde PDF...'
                  : 'Importar transacciones desde PDF'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
