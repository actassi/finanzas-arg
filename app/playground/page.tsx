'use client';

import { useState } from 'react';
import { applyMerchantRules, normalizeDescription } from '@/lib/classification';
import type { MerchantRule } from '@/types/db';

const mockRules: MerchantRule[] = [
  {
    id: '1',
    user_id: 'user-mock',
    pattern: 'PEDIDOSYA',
    match_type: 'contains',
    merchant_name: 'PedidosYa',
    category_id: 'cat-comidas-delivery',
    priority: 10,
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    user_id: 'user-mock',
    pattern: 'MERCADOPAGO',
    match_type: 'contains',
    merchant_name: 'MercadoPago genérico',
    category_id: 'cat-varios',
    priority: 50,
    created_at: new Date().toISOString(),
  },
];

export default function PlaygroundPage() {
  const [input, setInput] = useState(
    'MERCADOPAGO*PEDIDOSYA 1234 CABA AR'
  );

  const classification = applyMerchantRules(input, mockRules);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-4">
          Playground clasificación de gastos
        </h1>

        <label className="block text-sm font-medium mb-1">
          Descripción del movimiento (como viene del banco)
        </label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-emerald-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div className="text-xs text-slate-400 mb-4">
          Normalizada:{' '}
          <span className="font-mono">
            {normalizeDescription(input)}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-slate-400">Merchant detectado: </span>
            <span className="font-semibold">
              {classification.merchantName ?? '— (sin match)'}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Categoría ID: </span>
            <span className="font-mono">
              {classification.categoryId ?? '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Regla aplicada (ruleId): </span>
            <span className="font-mono">
              {classification.ruleId ?? '—'}
            </span>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-800 pt-3 text-xs text-slate-500">
          Probá cambiar la descripción a cosas como:
          <br />
          <span className="font-mono">
            DEBITO AUTOMATICO SPOTIFY SAO PAULO
          </span>{' '}
          (debería no matchear ninguna regla y mostrar “sin match”).
        </div>
      </div>
    </main>
  );
}
