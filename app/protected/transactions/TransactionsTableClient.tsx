'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';

import type { Account, Category, TransactionType } from '@/types/db';
import { updateTransactionInline } from './actions';

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

  receipt?: string | null;
  installment_number?: number | null;
  installments_total?: number | null;
};

type Draft = {
  merchant_name: string;      // SIEMPRE string (evita controlled/uncontrolled)
  category_id: string;        // '' o id
  applyToSimilar: boolean;
};

function formatMoneyARS(n: number, currency = 'ARS') {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return Number(n).toFixed(2);
  }
}

export default function TransactionsTableClient(props: {
  rows: TxRow[];
  accounts: Account[];
  categories: Category[];
}) {
  const { rows, accounts, categories } = props;
  const router = useRouter();

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [msgById, setMsgById] = useState<Record<string, { ok?: boolean; err?: string }>>({});

  // Inicializa drafts por fila (y evita undefined)
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};

      for (const r of rows) {
        const prevDraft = prev[r.id];
        next[r.id] = {
          merchant_name: prevDraft?.merchant_name ?? (r.merchant_name ?? ''),
          category_id: prevDraft?.category_id ?? (r.category_id ?? ''),
          applyToSimilar: prevDraft?.applyToSimilar ?? true,
        };
      }

      return next;
    });
  }, [rows]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { merchant_name: '', category_id: '', applyToSimilar: true }), ...patch },
    }));
  }

  async function onSave(id: string) {
    const d = drafts[id] ?? { merchant_name: '', category_id: '', applyToSimilar: true };

    // Normalizaciones seguras (nunca trim sobre undefined)
    const merchantName = (d.merchant_name ?? '').trim();
    const categoryId = (d.category_id ?? '').trim();

    setSavingById((p) => ({ ...p, [id]: true }));
    setMsgById((p) => ({ ...p, [id]: {} }));

    try {
      await updateTransactionInline({
        txId: id,
        merchantName: merchantName ? merchantName : null,
        categoryId: categoryId ? categoryId : null,
        applyToSimilar: !!d.applyToSimilar,
      });

      setMsgById((p) => ({ ...p, [id]: { ok: true } }));

      // Refresca server components (para ver reflejado en tabla)
      router.refresh();
    } catch (e: any) {
      setMsgById((p) => ({ ...p, [id]: { err: e?.message ?? 'Error guardando cambios.' } }));
    } finally {
      setSavingById((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <div className="overflow-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900">
          <tr className="text-left text-slate-300">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Cuenta</th>
            <th className="px-3 py-2">Merchant</th>
            <th className="px-3 py-2">Descripción</th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2">Comprobante</th>
            <th className="px-3 py-2">Cuota</th>

            {/* Columna sticky para que NO quede cortada */}
            <th className="px-3 py-2 sticky right-0 bg-slate-900 border-l border-slate-800 min-w-[260px]">
              Acciones
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => {
            const acc = accountById.get(r.account_id);
            const currency = acc?.currency ?? 'ARS';
            const cat = r.category_id ? categoryById.get(r.category_id) : null;

            const cuota =
              r.installment_number != null && r.installments_total != null
                ? `${String(r.installment_number).padStart(2, '0')}/${String(r.installments_total).padStart(2, '0')}`
                : '';

            const d = drafts[r.id] ?? { merchant_name: r.merchant_name ?? '', category_id: r.category_id ?? '', applyToSimilar: true };
            const isSaving = !!savingById[r.id];
            const msg = msgById[r.id];

            return (
              <tr key={r.id} className="hover:bg-slate-900/60">
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 whitespace-nowrap">{acc?.name ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.merchant_name ?? '—'}</td>
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

                <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoneyARS(r.amount, currency)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.receipt ?? ''}</td>
                <td className="px-3 py-2 whitespace-nowrap">{cuota}</td>

                {/* Acciones sticky */}
                <td className="px-3 py-2 sticky right-0 bg-slate-950/60 border-l border-slate-800 align-top">
                  <div className="flex flex-col gap-2">
                    <select
                      value={d.category_id}
                      onChange={(e) => setDraft(r.id, { category_id: e.target.value })}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">(Sin categoría)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.subcategory ? ` / ${c.subcategory}` : ''}
                        </option>
                      ))}
                    </select>

                    <input
                      value={d.merchant_name ?? ''}  // <- SIEMPRE string
                      onChange={(e) => setDraft(r.id, { merchant_name: e.target.value })}
                      placeholder="Merchant..."
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={!!d.applyToSimilar}
                        onChange={(e) => setDraft(r.id, { applyToSimilar: e.target.checked })}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      Aplicar a similares
                    </label>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => onSave(r.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      <Save size={16} />
                      {isSaving ? 'Guardando…' : 'Guardar'}
                    </button>

                    {msg?.ok && <div className="text-xs text-emerald-300">Guardado.</div>}
                    {msg?.err && <div className="text-xs text-red-300">{msg.err}</div>}
                  </div>
                </td>
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
  );
}
