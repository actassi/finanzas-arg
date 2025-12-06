'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Account, MerchantRule } from '@/types/db';
import {
  applyMerchantRules,
  normalizeDescription,
} from '@/lib/classification';
import { createTransaction } from '../actions';

interface CategorySummary {
  id: string;
  name: string;
  subcategory: string | null;
}

interface NewTransactionClientProps {
  accounts: Account[];
  categories: CategorySummary[];
  rules: MerchantRule[];
  categoryMap: Record<string, string>;
  saved?: boolean;
}

export default function NewTransactionClient({
  accounts,
  categories,
  rules,
  categoryMap,
  saved,
}: NewTransactionClientProps) {
  const router = useRouter();

  const [formState, setFormState] = useState({
    account_id: accounts[0]?.id ?? '',
    date: new Date().toISOString().slice(0, 10), // hoy
    description_raw: '',
    amount: '',
    type: 'expense',
  });

  const [suggestedMerchant, setSuggestedMerchant] = useState<string | null>(
    null
  );
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<
    string | null
  >(null);
  const [matchedRuleId, setMatchedRuleId] = useState<string | null>(null);

  // Recalcula sugerencias cuando cambia la descripción
  useEffect(() => {
    if (!formState.description_raw || rules.length === 0) {
      setSuggestedMerchant(null);
      setSuggestedCategoryId(null);
      setMatchedRuleId(null);
      return;
    }

    const result = applyMerchantRules(formState.description_raw, rules);
    setSuggestedMerchant(result.merchantName);
    setSuggestedCategoryId(result.categoryId);
    setMatchedRuleId(result.ruleId);
  }, [formState.description_raw, rules]);

  const getCategoryLabel = (categoryId: string | null) => {
    if (!categoryId) return '—';
    return categoryMap[categoryId] ?? categoryId;
  };

  // Cuando saved es true, mostramos el cartel y luego recargamos la página
  useEffect(() => {
    if (!saved) return;

    const timeout = setTimeout(() => {
      router.replace('/protected/transactions/new'); // sin ?saved=1
    }, 3500); // 3.5 segundos

    return () => clearTimeout(timeout);
  }, [saved, router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-xl font-semibold mb-4">Nueva transacción</h1>

          {saved && (
            <div className="mb-4 rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Transacción guardada correctamente. Recargando formulario...
            </div>
          )}

          <form action={createTransaction} className="space-y-4">
            {/* Cuenta */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Cuenta</label>
              <select
                name="account_id"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.account_id}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    account_id: e.target.value,
                  }))
                }
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha + Tipo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Fecha</label>
                <input
                  type="date"
                  name="date"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formState.date}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, date: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Tipo</label>
                <select
                  name="type"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formState.type}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, type: e.target.value }))
                  }
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                  <option value="payment">Pago</option>
                  <option value="transfer">Transferencia</option>
                  <option value="fee">Comisión</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>

            {/* Descripción */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                Descripción (como viene del banco)
              </label>
              <input
                name="description_raw"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.description_raw}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    description_raw: e.target.value,
                  }))
                }
                placeholder="MERCADOPAGO*POSTADEFUNESSA..."
                required
              />
              <p className="text-[11px] text-slate-400">
                Normalizada:{' '}
                <span className="font-mono">
                  {normalizeDescription(formState.description_raw)}
                </span>
              </p>
            </div>

            {/* Monto */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Monto</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.amount}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, amount: e.target.value }))
                }
                required
              />
            </div>

            {/* Valores sugeridos que viajan al servidor */}
            <input
              type="hidden"
              name="merchant_name"
              value={suggestedMerchant ?? ''}
            />
            <input
              type="hidden"
              name="category_id"
              value={suggestedCategoryId ?? ''}
            />

            {/* Sugerencias */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mt-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-xs text-slate-400 mb-1">
                  Merchant sugerido
                </div>
                <div className="font-semibold">
                  {suggestedMerchant ?? '— (sin match)'}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-xs text-slate-400 mb-1">
                  Categoría sugerida
                </div>
                <div className="font-mono">
                  {getCategoryLabel(suggestedCategoryId)}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-xs text-slate-400 mb-1">
                  Regla aplicada
                </div>
                <div className="font-mono text-xs">
                  {matchedRuleId ?? '—'}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
              >
                Guardar transacción
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
