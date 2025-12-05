'use client';

import { useState } from 'react';
import type { MerchantRule } from '@/types/db';
import {
  applyMerchantRules,
  normalizeDescription,
} from '@/lib/classification';
import { createOrUpdateRule, deleteRule } from './actions';

interface CategorySummary {
  id: string;
  name: string;
  subcategory: string | null;
}

interface RulesClientProps {
  rules: MerchantRule[];
  categories: CategorySummary[];
  categoryMap: Record<string, string>;
}

export default function RulesClient({
  rules,
  categories,
  categoryMap,
}: RulesClientProps) {
  const [testDescription, setTestDescription] = useState(
    'MERCADOPAGO*PEDIDOSYA 1234 CABA AR'
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    pattern: '',
    match_type: 'contains',
    merchant_name: '',
    category_id: '',
    priority: '100',
  });

  const classification = applyMerchantRules(testDescription, rules);

  const getCategoryLabel = (categoryId: string | null) => {
    if (!categoryId) return '—';
    return categoryMap[categoryId] ?? categoryId;
  };

  const startCreateNew = () => {
    setEditingId(null);
    setFormState({
      pattern: '',
      match_type: 'contains',
      merchant_name: '',
      category_id: '',
      priority: '100',
    });
  };

  const startEdit = (rule: MerchantRule) => {
    setEditingId(rule.id);
    setFormState({
      pattern: rule.pattern,
      match_type: rule.match_type,
      merchant_name: rule.merchant_name ?? '',
      category_id: rule.category_id ?? '',
      priority: String(rule.priority ?? 100),
    });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* FORMULARIO CREAR / EDITAR */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">
              {editingId ? 'Editar regla' : 'Nueva regla'}
            </h1>
            {editingId && (
              <button
                type="button"
                onClick={startCreateNew}
                className="text-xs px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
              >
                + Nueva regla
              </button>
            )}
          </div>

          <form
            action={createOrUpdateRule}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
          >
            {/* id oculto para saber si es update */}
            <input type="hidden" name="id" value={editingId ?? ''} />

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Pattern</label>
              <input
                name="pattern"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.pattern}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, pattern: e.target.value }))
                }
                placeholder="PEDIDOSYA, SPOTIFY..."
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Match</label>
              <select
                name="match_type"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.match_type}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, match_type: e.target.value }))
                }
              >
                <option value="contains">contains</option>
                <option value="starts_with">starts_with</option>
                <option value="ends_with">ends_with</option>
                <option value="equals">equals</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Merchant</label>
              <input
                name="merchant_name"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.merchant_name}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    merchant_name: e.target.value,
                  }))
                }
                placeholder="PedidosYa, Spotify..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Categoría</label>
              <select
                name="category_id"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.category_id}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    category_id: e.target.value,
                  }))
                }
              >
                <option value="">Sin categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.subcategory
                      ? `${cat.name} / ${cat.subcategory}`
                      : cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Prioridad</label>
              <input
                name="priority"
                type="number"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.priority}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, priority: e.target.value }))
                }
              />
            </div>

            <div className="md:col-span-5 flex justify-end mt-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
              >
                {editingId ? 'Guardar cambios' : 'Crear regla'}
              </button>
            </div>
          </form>
        </section>

        {/* TABLA DE REGLAS */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Reglas existentes</h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">Pattern</th>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2 text-left">Merchant</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  <th className="px-3 py-2 text-right">Prioridad</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-t border-slate-800 odd:bg-slate-900/40"
                  >
                    <td className="px-3 py-2 font-mono">{rule.pattern}</td>
                    <td className="px-3 py-2">{rule.match_type}</td>
                    <td className="px-3 py-2">
                      {rule.merchant_name ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {getCategoryLabel(rule.category_id)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {rule.priority}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(rule)}
                          className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
                        >
                          Editar
                        </button>

                        <form action={deleteRule}>
                          <input
                            type="hidden"
                            name="id"
                            value={rule.id}
                          />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 rounded-md border border-red-700 text-red-300 hover:bg-red-900/40"
                          >
                            Borrar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}

                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-4 text-center text-slate-500"
                    >
                      Todavía no hay reglas cargadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* PLAYGROUND DE CLASIFICACIÓN */}
        <section className="border-t border-slate-800 pt-6">
          <h2 className="text-lg font-semibold mb-4">
            Probar clasificación con estas reglas
          </h2>

          <label className="block text-sm font-medium mb-1">
            Descripción del movimiento (como viene del banco)
          </label>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm mb-2 outline-none focus:ring-2 focus:ring-emerald-500"
            value={testDescription}
            onChange={(e) => setTestDescription(e.target.value)}
          />

          <p className="text-xs text-slate-400 mb-4">
            Normalizada:{' '}
            <span className="font-mono">
              {normalizeDescription(testDescription)}
            </span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs text-slate-400 mb-1">
                Merchant detectado
              </div>
              <div className="font-semibold">
                {classification.merchantName ?? '— (sin match)'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs text-slate-400 mb-1">
                Categoría
              </div>
              <div className="font-mono">
                {getCategoryLabel(classification.categoryId)}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs text-slate-400 mb-1">
                Regla aplicada (ruleId)
              </div>
              <div className="font-mono">
                {classification.ruleId ?? '—'}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
