"use client";

import { useEffect, useMemo, useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/types/db";
import {
  createAccount,
  updateAccountInline,
  deleteAccountIfEmpty,
  type AccountActionState,
} from "./actions";

type AccountRow = Account & { tx_count: number };

const INITIAL_STATE: AccountActionState = { ok: false, error: null, message: null };

function toStr(v: any) {
  return v == null ? "" : String(v);
}

function toNumOrNull(s: string): number | null {
  const x = String(s ?? "").trim();
  if (!x) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function AccountsTableClient({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const rows = useMemo(() => accounts ?? [], [accounts]);

  // CREATE
  const [createState, createAction] = useActionState(createAccount, INITIAL_STATE);

  const [createForm, setCreateForm] = useState({
    name: "",
    type: "checking",
    currency: "ARS",
    institution: "",
    credit_limit: "",
    cut_off_day: "",
    due_day: "",
    interest_rate: "",
  });

  // INLINE EDIT / DELETE feedback
  const [opMsg, setOpMsg] = useState<AccountActionState>({ ok: false, error: null, message: null });
  const [isPending, startTransition] = useTransition();

  // EDIT STATE
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "checking",
    currency: "ARS",
    institution: "",
    credit_limit: "",
    cut_off_day: "",
    due_day: "",
    interest_rate: "",
  });

  // Cuando CREATE OK: refrescar y reset
  useEffect(() => {
    if (!createState.ok) return;
    setCreateForm({
      name: "",
      type: "checking",
      currency: "ARS",
      institution: "",
      credit_limit: "",
      cut_off_day: "",
      due_day: "",
      interest_rate: "",
    });
    router.refresh();
  }, [createState.ok, router]);

  function beginEdit(a: AccountRow) {
    setOpMsg({ ok: false, error: null, message: null });
    setEditingId(a.id);
    setEditForm({
      name: toStr(a.name),
      type: toStr(a.type || "checking"),
      currency: toStr(a.currency || "ARS"),
      institution: toStr(a.institution),
      credit_limit: toStr((a as any).credit_limit),
      cut_off_day: toStr((a as any).cut_off_day),
      due_day: toStr((a as any).due_day),
      interest_rate: toStr((a as any).interest_rate),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setOpMsg({ ok: false, error: null, message: null });
  }

  async function saveEdit(accountId: string) {
    setOpMsg({ ok: false, error: null, message: null });

    startTransition(async () => {
      const res = await updateAccountInline({
        accountId,
        name: editForm.name,
        type: editForm.type,
        currency: editForm.currency,
        institution: editForm.institution.trim() ? editForm.institution.trim() : null,
        credit_limit: toNumOrNull(editForm.credit_limit),
        cut_off_day: toNumOrNull(editForm.cut_off_day),
        due_day: toNumOrNull(editForm.due_day),
        interest_rate: toNumOrNull(editForm.interest_rate),
      });

      setOpMsg(res);
      if (res.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  async function onDelete(a: AccountRow) {
    setOpMsg({ ok: false, error: null, message: null });

    if (a.tx_count > 0) {
      setOpMsg({ ok: false, error: "No se puede borrar: la cuenta tiene transacciones asociadas.", message: null });
      return;
    }

    const ok = window.confirm(`¿Borrar la cuenta "${a.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    startTransition(async () => {
      const res = await deleteAccountIfEmpty(a.id);
      setOpMsg(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Mensajes CREATE */}
      {createState.error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {createState.error}
        </div>
      ) : null}
      {createState.ok && createState.message ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {createState.message}
        </div>
      ) : null}

      {/* Mensajes EDIT/DELETE */}
      {opMsg.error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {opMsg.error}
        </div>
      ) : null}
      {opMsg.ok && opMsg.message ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {opMsg.message}
        </div>
      ) : null}

      {/* Form nueva cuenta */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <div className="text-lg font-semibold text-slate-100">Nueva cuenta</div>
          <div className="text-sm text-slate-300">
            Alta rápida para banco/tarjeta/efectivo. Los campos de tarjeta (cierre/vencimiento/límite) son opcionales.
          </div>
        </div>

        <form action={createAction} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Nombre</label>
            <input
              name="name"
              value={createForm.name}
              onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Ej: Visa Macro / Caja ARS"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Tipo</label>
            <select
              name="type"
              value={createForm.type}
              onChange={(e) => setCreateForm((s) => ({ ...s, type: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="checking">checking</option>
              <option value="savings">savings</option>
              <option value="credit_card">credit_card</option>
              <option value="cash">cash</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Moneda</label>
            <select
              name="currency"
              value={createForm.currency}
              onChange={(e) => setCreateForm((s) => ({ ...s, currency: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Institución (opcional)</label>
            <input
              name="institution"
              value={createForm.institution}
              onChange={(e) => setCreateForm((s) => ({ ...s, institution: e.target.value }))}
              placeholder="Ej: Banco Macro"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-300">Límite (opcional)</label>
            <input
              name="credit_limit"
              type="number"
              step="0.01"
              value={createForm.credit_limit}
              onChange={(e) => setCreateForm((s) => ({ ...s, credit_limit: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-300">Cierre (día)</label>
            <input
              name="cut_off_day"
              type="number"
              value={createForm.cut_off_day}
              onChange={(e) => setCreateForm((s) => ({ ...s, cut_off_day: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-300">Venc. (día)</label>
            <input
              name="due_day"
              type="number"
              value={createForm.due_day}
              onChange={(e) => setCreateForm((s) => ({ ...s, due_day: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-300">TNA/TEM (opcional)</label>
            <input
              name="interest_rate"
              type="number"
              step="0.01"
              value={createForm.interest_rate}
              onChange={(e) => setCreateForm((s) => ({ ...s, interest_rate: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-12 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              Crear
            </button>
          </div>
        </form>
      </div>

      {/* Listado + inline edit */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-200">
          Cuentas ({rows.length}) {isPending ? <span className="text-slate-400">· aplicando cambios…</span> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/40 text-slate-300">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Moneda</th>
                <th className="text-left px-4 py-2">Institución</th>
                <th className="text-right px-4 py-2">Mov.</th>
                <th className="text-right px-4 py-2">Límite</th>
                <th className="text-right px-4 py-2">Cierre</th>
                <th className="text-right px-4 py-2">Venc.</th>
                <th className="text-right px-4 py-2">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {rows.map((a) => {
                const isEditing = editingId === a.id;

                return (
                  <tr key={a.id} className="text-slate-200 align-top">
                    <td className="px-4 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
                          className="w-64 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      ) : (
                        a.name
                      )}
                    </td>

                    <td className="px-4 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.type}
                          onChange={(e) => setEditForm((s) => ({ ...s, type: e.target.value }))}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="checking">checking</option>
                          <option value="savings">savings</option>
                          <option value="credit_card">credit_card</option>
                          <option value="cash">cash</option>
                        </select>
                      ) : (
                        a.type
                      )}
                    </td>

                    <td className="px-4 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.currency}
                          onChange={(e) => setEditForm((s) => ({ ...s, currency: e.target.value }))}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="ARS">ARS</option>
                          <option value="USD">USD</option>
                        </select>
                      ) : (
                        a.currency
                      )}
                    </td>

                    <td className="px-4 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.institution}
                          onChange={(e) => setEditForm((s) => ({ ...s, institution: e.target.value }))}
                          className="w-56 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      ) : (
                        a.institution ?? "—"
                      )}
                    </td>

                    <td className="px-4 py-2 text-right">{a.tx_count}</td>

                    <td className="px-4 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.credit_limit}
                          onChange={(e) => setEditForm((s) => ({ ...s, credit_limit: e.target.value }))}
                          className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                        />
                      ) : (
                        (a as any).credit_limit ?? "—"
                      )}
                    </td>

                    <td className="px-4 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.cut_off_day}
                          onChange={(e) => setEditForm((s) => ({ ...s, cut_off_day: e.target.value }))}
                          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                        />
                      ) : (
                        (a as any).cut_off_day ?? "—"
                      )}
                    </td>

                    <td className="px-4 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.due_day}
                          onChange={(e) => setEditForm((s) => ({ ...s, due_day: e.target.value }))}
                          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                        />
                      ) : (
                        (a as any).due_day ?? "—"
                      )}
                    </td>

                    <td className="px-4 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.interest_rate}
                          onChange={(e) => setEditForm((s) => ({ ...s, interest_rate: e.target.value }))}
                          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                        />
                      ) : (
                        (a as any).interest_rate ?? "—"
                      )}
                    </td>

                    <td className="px-4 py-2 text-right">
                      {!isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => beginEdit(a)}
                            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => onDelete(a)}
                            disabled={a.tx_count > 0 || isPending}
                            className={[
                              "rounded-md border px-3 py-1 text-sm",
                              a.tx_count > 0 || isPending
                                ? "border-slate-800 text-slate-500 cursor-not-allowed"
                                : "border-rose-500/40 text-rose-200 hover:bg-rose-500/10",
                            ].join(" ")}
                            title={a.tx_count > 0 ? "No se puede borrar: tiene movimientos." : "Borrar cuenta"}
                          >
                            Borrar
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => saveEdit(a.id)}
                            disabled={isPending}
                            className="rounded-md bg-emerald-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isPending}
                            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-400" colSpan={9}>
                    Todavía no hay cuentas creadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
