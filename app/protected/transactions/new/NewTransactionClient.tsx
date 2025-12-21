"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Account, MerchantRule, TransactionType } from "@/types/db";
import { applyMerchantRules, normalizeDescription } from "@/lib/classification";
import { createTransaction } from "../actions";

type CategorySummary = {
  id: string;
  name: string;
  subcategory: string | null;
  color: string;
};

interface NewTransactionClientProps {
  accounts: Account[];
  categories: CategorySummary[];
  rules: MerchantRule[];
  categoryLabelMap: Record<string, string>;
  categoryColorMap: Record<string, string>;
  saved?: boolean;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewTransactionClient({
  accounts,
  categories,
  rules,
  categoryLabelMap,
  categoryColorMap,
  saved,
}: NewTransactionClientProps) {
  const router = useRouter();

  const hasAccounts = accounts.length > 0;

  const [formState, setFormState] = useState(() => ({
    account_id: accounts[0]?.id ?? "",
    date: todayISO(),
    description_raw: "",
    amount: "",
    type: "expense" as TransactionType,
    merchant_name: "",
    category_id: "",
    save_rule: true,
  }));

  // “Dirty flags” para no pisar lo que el usuario eligió manualmente
  const [merchantTouched, setMerchantTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);

  const [matchedRuleId, setMatchedRuleId] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeDescription(formState.description_raw), [formState.description_raw]);

  // Recalcula sugerencias cuando cambia la descripción
  useEffect(() => {
    if (!formState.description_raw || rules.length === 0) {
      setMatchedRuleId(null);
      // no limpies merchant/category si el usuario ya escribió algo
      if (!merchantTouched) setFormState((s) => ({ ...s, merchant_name: "" }));
      if (!categoryTouched) setFormState((s) => ({ ...s, category_id: "" }));
      return;
    }

    const result = applyMerchantRules(formState.description_raw, rules);

    setMatchedRuleId(result.ruleId ?? null);

    // Solo prefill si el usuario no tocó manualmente esos campos
    if (!merchantTouched) {
      setFormState((s) => ({
        ...s,
        merchant_name: result.merchantName ?? "",
      }));
    }

    if (!categoryTouched) {
      setFormState((s) => ({
        ...s,
        category_id: result.categoryId ?? "",
      }));
    }
  }, [formState.description_raw, rules, merchantTouched, categoryTouched]);

  // Cuando saved es true, mostramos el cartel y luego "limpiamos" la URL
  useEffect(() => {
    if (!saved) return;

    const timeout = setTimeout(() => {
      router.replace("/protected/transactions/new");
    }, 2500);

    return () => clearTimeout(timeout);
  }, [saved, router]);

  const categoryDotColor = formState.category_id ? categoryColorMap[formState.category_id] ?? "#64748b" : "#64748b";

  if (!hasAccounts) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h1 className="text-xl font-semibold text-slate-100">Nueva transacción</h1>
        <p className="mt-2 text-sm text-slate-300">
          No tenés cuentas cargadas. Creá al menos una cuenta para poder registrar transacciones manuales.
        </p>
        <div className="mt-4">
          <Link
            href="/protected/transactions"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Volver a Transacciones
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">Nueva transacción</h1>
          <p className="text-sm text-slate-300">
            Alta manual (ingresos, egresos, transferencias, etc.). No pertenece a un resumen PDF.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/protected/transactions"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Volver
          </Link>
        </div>
      </div>

      {saved && (
        <div className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Transacción guardada correctamente.
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
            onChange={(e) => setFormState((s) => ({ ...s, account_id: e.target.value }))}
            required
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
              onChange={(e) => setFormState((s) => ({ ...s, date: e.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Tipo</label>
            <select
              name="type"
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={formState.type}
              onChange={(e) => setFormState((s) => ({ ...s, type: e.target.value as TransactionType }))}
              required
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
          <label className="text-xs text-slate-300">Descripción (raw)</label>
          <input
            name="description_raw"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            value={formState.description_raw}
            onChange={(e) => {
              setFormState((s) => ({ ...s, description_raw: e.target.value }));
              // Si el usuario edita la descripción, permitimos re-sugerir:
              // no reseteamos touched acá; queda a criterio del usuario.
            }}
            placeholder="Ej: MERCADOPAGO*POSTADEFUNESSA..."
            required
          />
          <p className="text-[11px] text-slate-400">
            Normalizada: <span className="font-mono">{normalized}</span>
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
            onChange={(e) => setFormState((s) => ({ ...s, amount: e.target.value }))}
            required
          />
          <p className="text-[11px] text-slate-400">Se guardará como valor positivo (ABS).</p>
        </div>

        {/* Merchant + Categoría (editables) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Merchant (editable)</label>
            <input
              name="merchant_name"
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={formState.merchant_name}
              onChange={(e) => {
                setMerchantTouched(true);
                setFormState((s) => ({ ...s, merchant_name: e.target.value }));
              }}
              placeholder="Ej: Shell, Coto, MercadoPago..."
            />
            <div className="text-[11px] text-slate-400">
              Sugerido por reglas. Podés sobrescribirlo.
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Categoría (editable)</label>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full border border-slate-700 shrink-0"
                style={{ backgroundColor: categoryDotColor }}
                title={formState.category_id ? categoryLabelMap[formState.category_id] : "Sin categoría"}
              />
              <select
                name="category_id"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={formState.category_id}
                onChange={(e) => {
                  setCategoryTouched(true);
                  setFormState((s) => ({ ...s, category_id: e.target.value }));
                }}
              >
                <option value="">(Sin categoría)</option>
                {categories.map((c) => {
                  const label = c.subcategory ? `${c.name} / ${c.subcategory}` : c.name;
                  return (
                    <option key={c.id} value={c.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="text-[11px] text-slate-400">
              Se recomienda categorizar egresos; ingresos es opcional.
            </div>
          </div>
        </div>

        {/* Guardar regla */}
        <div className="flex items-center gap-2 pt-1">
          <input
            id="save_rule"
            type="checkbox"
            name="save_rule"
            value="1"
            checked={formState.save_rule}
            onChange={(e) => setFormState((s) => ({ ...s, save_rule: e.target.checked }))}
            className="h-4 w-4 accent-emerald-500"
          />
          <label htmlFor="save_rule" className="text-sm text-slate-200">
            Guardar regla Merchant → Categoría para futuros imports
          </label>
        </div>

        {/* Panel de diagnóstico (útil para MVP) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mt-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400 mb-1">Merchant actual</div>
            <div className="font-semibold">{formState.merchant_name || "—"}</div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400 mb-1">Categoría actual</div>
            <div className="font-mono">
              {formState.category_id ? categoryLabelMap[formState.category_id] ?? formState.category_id : "—"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400 mb-1">Regla aplicada</div>
            <div className="font-mono text-xs">{matchedRuleId ?? "—"}</div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            Guardar transacción
          </button>
        </div>
      </form>
    </div>
  );
}
