'use client';

import { useEffect, useMemo, useState } from 'react';
import { createCategory, updateCategory, deleteCategory } from './actions';
import { Save, Trash2, Plus } from 'lucide-react';

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  subcategory: string | null;
  is_essential: boolean;
  color: string;
  created_at: string;
};

type Draft = {
  name: string;
  subcategory: string;
  is_essential: boolean;
  color: string;
};

function normalizeColor(v: string) {
  const s = String(v ?? '').trim();
  return s || '#0ea5e9';
}

export default function CategoriesTableClient(props: { initialCategories: CategoryRow[] }) {
  const [rows, setRows] = useState<CategoryRow[]>(props.initialCategories ?? []);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [msgById, setMsgById] = useState<Record<string, { ok?: boolean; err?: string }>>({});

  // Form alta
  const [newName, setNewName] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newEssential, setNewEssential] = useState(false);
  const [newColor, setNewColor] = useState('#0ea5e9');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok?: boolean; err?: string }>({});

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Inicializa drafts por fila
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const r of rows) {
        const p = prev[r.id];
        next[r.id] = {
          name: p?.name ?? r.name,
          subcategory: p?.subcategory ?? (r.subcategory ?? ''),
          is_essential: p?.is_essential ?? !!r.is_essential,
          color: p?.color ?? normalizeColor(r.color),
        };
      }
      return next;
    });
  }, [rows]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { name: '', subcategory: '', is_essential: false, color: '#0ea5e9' }),
        ...patch,
      },
    }));
  }

  async function onCreate() {
    setCreateMsg({});
    const name = newName.trim();
    if (!name) {
      setCreateMsg({ err: 'El nombre es obligatorio.' });
      return;
    }

    setCreating(true);
    try {
      await createCategory({
        name,
        subcategory: newSub.trim() || null,
        is_essential: newEssential,
        color: normalizeColor(newColor),
      });

      // Optimista: agregamos localmente (orden simple por name/sub)
      const temp: CategoryRow = {
        id: `tmp-${crypto.randomUUID()}`,
        user_id: 'me',
        name,
        subcategory: newSub.trim() || null,
        is_essential: newEssential,
        color: normalizeColor(newColor),
        created_at: new Date().toISOString(),
      };

      // Nota: al revalidar, server volverá a traer IDs reales. Mantener UX fluida.
      setRows((p) =>
        [...p, temp].sort((a, b) => {
          const an = (a.name ?? '').localeCompare(b.name ?? '', 'es');
          if (an !== 0) return an;
          return (a.subcategory ?? '').localeCompare(b.subcategory ?? '', 'es');
        })
      );

      setNewName('');
      setNewSub('');
      setNewEssential(false);
      setNewColor('#0ea5e9');
      setCreateMsg({ ok: true });
    } catch (e: any) {
      setCreateMsg({ err: e?.message ?? 'Error creando categoría.' });
    } finally {
      setCreating(false);
    }
  }

  async function onSave(id: string) {
    const d = drafts[id];
    const base = rowsById.get(id);
    if (!d || !base) return;

    setSavingById((p) => ({ ...p, [id]: true }));
    setMsgById((p) => ({ ...p, [id]: {} }));

    try {
      await updateCategory({
        id,
        name: d.name.trim(),
        subcategory: d.subcategory.trim() || null,
        is_essential: !!d.is_essential,
        color: normalizeColor(d.color),
      });

      setMsgById((p) => ({ ...p, [id]: { ok: true } }));
      // Optimista: reflejar local
      setRows((p) =>
        p.map((r) =>
          r.id === id
            ? {
                ...r,
                name: d.name.trim(),
                subcategory: d.subcategory.trim() || null,
                is_essential: !!d.is_essential,
                color: normalizeColor(d.color),
              }
            : r
        )
      );
    } catch (e: any) {
      setMsgById((p) => ({ ...p, [id]: { err: e?.message ?? 'Error guardando.' } }));
    } finally {
      setSavingById((p) => ({ ...p, [id]: false }));
    }
  }

  async function onDelete(id: string) {
    const base = rowsById.get(id);
    if (!base) return;

    const ok = confirm(`Eliminar categoría "${base.name}${base.subcategory ? ` / ${base.subcategory}` : ''}"?`);
    if (!ok) return;

    setSavingById((p) => ({ ...p, [id]: true }));
    setMsgById((p) => ({ ...p, [id]: {} }));

    try {
      await deleteCategory({ id });
      setRows((p) => p.filter((r) => r.id !== id));
    } catch (e: any) {
      setMsgById((p) => ({ ...p, [id]: { err: e?.message ?? 'Error eliminando.' } }));
    } finally {
      setSavingById((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Alta */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-medium text-slate-100">Nueva categoría</div>
          {createMsg?.ok && <div className="text-xs text-emerald-300">Creada.</div>}
          {createMsg?.err && <div className="text-xs text-red-300">{createMsg.err}</div>}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Nombre</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ej: Alimentos"
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Subcategoría (opcional)</label>
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ej: Supermercado"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Color</label>
            <input
              type="color"
              value={normalizeColor(newColor)}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <input
              id="new-essential"
              type="checkbox"
              checked={newEssential}
              onChange={(e) => setNewEssential(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <label htmlFor="new-essential" className="text-sm text-slate-200">
              Esencial
            </label>
          </div>

          <div className="md:col-span-12 flex justify-end">
            <button
              type="button"
              disabled={creating}
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              <Plus size={16} />
              {creating ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-300">
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Subcategoría</th>
              <th className="px-3 py-2">Color</th>
              <th className="px-3 py-2">Esencial</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => {
              const d = drafts[r.id] ?? {
                name: r.name,
                subcategory: r.subcategory ?? '',
                is_essential: !!r.is_essential,
                color: normalizeColor(r.color),
              };

              const saving = !!savingById[r.id];
              const msg = msgById[r.id];

              return (
                <tr key={r.id} className="hover:bg-slate-900/50">
                  <td className="px-3 py-2">
                    <input
                      value={d.name}
                      onChange={(e) => setDraft(r.id, { name: e.target.value })}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      value={d.subcategory}
                      onChange={(e) => setDraft(r.id, { subcategory: e.target.value })}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="(opcional)"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={normalizeColor(d.color)}
                        onChange={(e) => setDraft(r.id, { color: e.target.value })}
                        className="h-9 w-14 rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
                      />
                      <span className="text-xs text-slate-400">{normalizeColor(d.color)}</span>
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!d.is_essential}
                        onChange={(e) => setDraft(r.id, { is_essential: e.target.checked })}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      <span className="text-sm text-slate-200">Sí</span>
                    </label>
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onSave(r.id)}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                      >
                        <Save size={16} />
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onDelete(r.id)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {msg?.ok && <div className="mt-1 text-xs text-emerald-300 text-right">Guardado.</div>}
                    {msg?.err && <div className="mt-1 text-xs text-red-300 text-right">{msg.err}</div>}
                  </td>
                </tr>
              );
            })}

            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-300">
                  No hay categorías aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400">
        Nota: el constraint unique actual es (user_id, name, subcategory). Si querés que “Alimentos” sin subcategoría sea único,
        está perfecto tal como está.
      </div>
    </div>
  );
}
