'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TransactionType } from '@/types/db';
import { parseMacroVisaStatementPdf, type MacroVisaParsedRow } from '@/lib/pdf/macroVisaOcrClient';
import { importMacroVisaFromRows } from './actions';

type AccountRow = {
  id: string;
  name: string;
  currency: string;
};

async function sha256Hex(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', ab);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function ImportMacroVisaClient(props: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState('');
  const [fallbackType, setFallbackType] = useState<TransactionType>('expense');

  const [provider, setProvider] = useState('VISA');
  const [institution, setInstitution] = useState('GALICIA'); // ajustá default si querés
  const [note, setNote] = useState('');

  const [dueDate, setDueDate] = useState('');
  const [cutOffDate, setCutOffDate] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const [file, setFile] = useState<File | null>(null);

  const [rows, setRows] = useState<MacroVisaParsedRow[] | null>(null);
  const [parseMsg, setParseMsg] = useState<string>('');
  const [errMsg, setErrMsg] = useState<string>('');

  const canParse = useMemo(() => !!file, [file]);
  const canImport = useMemo(() => !!rows?.length && !!accountId && !!dueDate && !!file, [rows, accountId, dueDate, file]);

  async function onParse() {
    setErrMsg('');
    setParseMsg('');
    setRows(null);

    if (!file) return;

    try {
      setParseMsg('Procesando PDF (OCR)…');
      const parsed = await parseMacroVisaStatementPdf(file);
      setRows(parsed);
      setParseMsg(`OK: ${parsed.length} filas detectadas.`);
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message ?? 'Error parseando PDF.');
      setParseMsg('');
    }
  }

  async function onImport() {
    setErrMsg('');
    if (!file || !rows?.length) return;

    startTransition(async () => {
      try {
        const fileHash = await sha256Hex(file);

        const res = await importMacroVisaFromRows({
          accountId,
          fallbackType,

          provider,
          institution: institution || null,
          note: note || null,

          dueDate,
          cutOffDate: cutOffDate || null,
          statementPeriodStart: periodStart || null,
          statementPeriodEnd: periodEnd || null,

          fileName: file.name,
          fileSha256: fileHash,

          rows,
        });

        if (res.duplicate) {
          setErrMsg('Este PDF ya fue importado (sha256 duplicado).');
          return;
        }

        router.push(`/protected/transactions?batch=${res.batchId ?? ''}`);
        router.refresh();
      } catch (e: any) {
        console.error(e);
        setErrMsg(e?.message ?? 'Error importando.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label className="text-xs text-slate-300">Archivo PDF</label>
          <input
            type="file"
            accept="application/pdf"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="mt-1 text-[11px] text-slate-400">
            Este importador usa OCR en el navegador (no usa canvas nativo en Node).
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="text-xs text-slate-300">Cuenta</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Seleccionar…</option>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Tipo fallback</label>
          <select
            value={fallbackType}
            onChange={(e) => setFallbackType(e.target.value as TransactionType)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="payment">Pago</option>
            <option value="fee">Comisión</option>
            <option value="transfer">Transferencia</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div className="md:col-span-3 flex gap-2 justify-end">
          <button
            type="button"
            disabled={!canParse || isPending}
            onClick={onParse}
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            Parsear (OCR)
          </button>
          <button
            type="button"
            disabled={!canImport || isPending}
            onClick={onImport}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            Importar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Vencimiento (due_date)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Cierre (cut_off_date)</label>
          <input
            type="date"
            value={cutOffDate}
            onChange={(e) => setCutOffDate(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Período desde</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Período hasta</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Provider</label>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Institución</label>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
        </div>

        <div className="md:col-span-12">
          <label className="text-xs text-slate-300">Nota</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: RESUMEN VENCIMIENTO DICIEMBRE 2025"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {parseMsg ? (
        <div className="text-sm text-slate-300">{parseMsg}</div>
      ) : null}

      {errMsg ? (
        <div className="text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded-md p-3">{errMsg}</div>
      ) : null}

      {/* Preview */}
      {rows?.length ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-sm text-slate-200 font-medium">Preview (primeras 8)</div>
          <div className="mt-2 space-y-1 text-xs text-slate-300">
            {rows.slice(0, 8).map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <span className="text-slate-100">{r.date}</span>
                <span className="text-slate-400">#{r.receipt ?? '—'}</span>
                <span className="text-slate-100">{r.amount.toLocaleString('es-AR')}</span>
                <span className="text-slate-300 truncate max-w-[700px]">{r.description}</span>
                {r.installmentNumber && r.installmentsTotal ? (
                  <span className="text-slate-400">C.{String(r.installmentNumber).padStart(2, '0')}/{String(r.installmentsTotal).padStart(2, '0')}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
