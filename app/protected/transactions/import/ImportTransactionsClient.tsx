'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Account } from '@/types/db';
import { importTransactionsFromCsv } from '../actions';

interface ImportTransactionsClientProps {
  accounts: Account[];
  imported: number;
}

export default function ImportTransactionsClient({
  accounts,
  imported,
}: ImportTransactionsClientProps) {
  const router = useRouter();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [type, setType] = useState('expense');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si imported > 0, mostramos aviso y después limpiamos la query
  useEffect(() => {
    if (!imported) return;

    const timeout = setTimeout(() => {
      router.replace('/protected/transactions/import');
    }, 4000);

    return () => clearTimeout(timeout);
  }, [imported, router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-xl font-semibold mb-4">
            Importar transacciones desde CSV
          </h1>

          {imported > 0 && (
            <div className="mb-4 rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Se importaron correctamente {imported} transacciones. Limpiando
              estado...
            </div>
          )}

          <p className="text-sm text-slate-300 mb-4">
            Primera versión: esperá un CSV con columnas de{' '}
            <span className="font-mono">fecha</span>,{' '}
            <span className="font-mono">descripción</span> e{' '}
            <span className="font-mono">monto</span>. Intentamos detectar
            automáticamente los nombres más comunes (fecha, descripcion,
            importe, etc.). Formatos de fecha soportados:{' '}
            <span className="font-mono">YYYY-MM-DD</span> o{' '}
            <span className="font-mono">DD/MM/AAAA</span>. Los montos se
            interpretan con coma o punto decimal.
          </p>

          <form
            action={async (formData) => {
              setIsSubmitting(true);
              await importTransactionsFromCsv(formData);
              // no llega acá porque la action hace redirect,
              // pero lo dejamos por si cambiamos el flujo a futuro
              setIsSubmitting(false);
            }}
            encType="multipart/form-data"
            className="space-y-4"
          >
            {/* Cuenta */}
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

            {/* Archivo CSV */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                Archivo CSV de movimientos
              </label>
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                className="text-sm text-slate-200"
                required
              />
              <p className="text-[11px] text-slate-400">
                Idealmente exportado desde el banco con encabezados claros.
              </p>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Importando...'
                  : 'Importar transacciones desde CSV'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
