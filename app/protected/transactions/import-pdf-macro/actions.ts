'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { MerchantRule, MatchType, TransactionType } from '@/types/db';
import type { MacroVisaParsedRow } from '@/lib/pdf/macroVisaOcrClient';
import { sanitizeDbError } from '@/lib/errors';

/**
 * Devuelve siempre positivo (según tu requerimiento actual).
 */
function signedAmount(amount: number): number {
  return Math.abs(amount);
}

function normalizeType(desc: string, fallback: TransactionType): TransactionType {
  if (desc.trim().toUpperCase() === 'SU PAGO EN PESOS') return 'payment';
  return fallback;
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesByType(haystack: string, needle: string, matchType: MatchType) {
  switch (matchType) {
    case 'contains':
      return haystack.includes(needle);
    case 'starts_with':
      return haystack.startsWith(needle);
    case 'ends_with':
      return haystack.endsWith(needle);
    case 'equals':
      return haystack === needle;
    default:
      return false;
  }
}

function applyMerchantRules(
  descriptionRaw: string,
  rules: MerchantRule[]
): { merchant_name: string | null; category_id: string | null; matched_rule_id: string | null } {
  const text = normalizeText(descriptionRaw);

  const sorted = [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.pattern?.length ?? 0) - (a.pattern?.length ?? 0);
  });

  for (const r of sorted) {
    const pat = normalizeText(r.pattern);
    if (!pat) continue;

    if (matchesByType(text, pat, r.match_type)) {
      return {
        merchant_name: r.merchant_name ?? null,
        category_id: r.category_id ?? null,
        matched_rule_id: r.id,
      };
    }
  }

  return { merchant_name: null, category_id: null, matched_rule_id: null };
}

function cleanTextOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function isoDateOrNull(v: unknown, fieldName: string): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Fecha inválida en ${fieldName}. Debe ser YYYY-MM-DD.`);
  }
  return s;
}

export async function importMacroVisaFromRows(input: {
  accountId: string;
  fallbackType: TransactionType;

  // metadata batch
  provider?: string | null;
  institution?: string | null;
  note?: string | null;

  dueDate: string; // requerido
  cutOffDate?: string | null;
  statementPeriodStart?: string | null;
  statementPeriodEnd?: string | null;

  fileName: string;
  fileSha256: string;

  rows: MacroVisaParsedRow[];
}): Promise<{ imported: number; batchId?: string; duplicate?: boolean }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error('No se pudo validar la sesión.');
  if (!user) redirect('/auth/login');

  const accountId = String(input.accountId ?? '').trim();
  if (!accountId) throw new Error('Falta accountId.');

  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error('No hay filas parseadas para importar.');
  }

  const provider = cleanTextOrNull(input.provider) ?? 'VISA';
  const institution = cleanTextOrNull(input.institution) ?? null;
  const note = cleanTextOrNull(input.note) ?? null;

  const dueDate = isoDateOrNull(input.dueDate, 'dueDate');
  if (!dueDate) throw new Error('Falta dueDate.');
  const cutOffDate = isoDateOrNull(input.cutOffDate, 'cutOffDate');
  const periodStart = isoDateOrNull(input.statementPeriodStart, 'statementPeriodStart');
  const periodEnd = isoDateOrNull(input.statementPeriodEnd, 'statementPeriodEnd');

  const fileName = String(input.fileName ?? '').trim() || 'macro_visa.pdf';
  const fileSha256 = String(input.fileSha256 ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(fileSha256)) {
    throw new Error('fileSha256 inválido.');
  }

  // reglas merchant
  const { data: rulesData, error: rulesErr } = await supabase
    .from('merchant_rules')
    .select('id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at')
    .eq('user_id', user.id)
    .order('priority', { ascending: false });

  if (rulesErr) console.error('Error cargando merchant_rules:', rulesErr);
  const rules = (rulesData ?? []) as MerchantRule[];

  // crear batch
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({
      user_id: user.id,
      account_id: accountId,
      source: 'pdf',
      provider: `${provider} (OCR)`,
      institution,
      file_name: fileName,
      file_sha256: fileSha256,
      due_date: dueDate,
      cut_off_date: cutOffDate,
      statement_period_start: periodStart,
      statement_period_end: periodEnd,
      note,
    })
    .select('id')
    .single();

  if (batchErr) {
    const code = (batchErr as any)?.code;
    if (code === '23505') {
      return { imported: 0, duplicate: true };
    }
    console.error('Error creando import_batch (macro):', batchErr);
    throw new Error('Error creando el batch de importación (macro).');
  }

  const importBatchId = batch.id as string;

  const inserts = input.rows.map((r) => {
    const desc = String(r.description ?? '').trim();
    const type = normalizeType(desc, input.fallbackType);

    const { merchant_name, category_id } =
      type === 'payment'
        ? { merchant_name: null, category_id: null, matched_rule_id: null }
        : applyMerchantRules(desc, rules);

    const finalMerchantName = merchant_name ?? desc;

    return {
      user_id: user.id,
      account_id: accountId,

      date: r.date,
      due_date: dueDate, // clave para budget_month (vencimiento resumen)

      description_raw: desc,
      merchant_name: type === 'payment' ? null : finalMerchantName,
      category_id: type === 'payment' ? null : (category_id ?? null),

      amount: signedAmount(Number(r.amount ?? 0)),
      type,
      import_batch_id: importBatchId,

      receipt: r.receipt ?? null,
      installment_number: r.installmentNumber ?? null,
      installments_total: r.installmentsTotal ?? null,
    };
  });

  const { error: insErr, data: inserted } = await supabase
    .from('transactions')
    .insert(inserts)
    .select('id');

  if (insErr) {
    // cleanup best-effort
    try {
      await supabase.from('import_batches').delete().eq('id', importBatchId).eq('user_id', user.id);
    } catch (e) {
      console.warn('No se pudo limpiar import_batches tras fallo (macro):', e);
    }

    throw new Error(sanitizeDbError(insErr, "insert transactions macro"));
  }

  revalidatePath('/protected/transactions');
  revalidatePath('/protected/reports');
  revalidatePath('/protected/transactions/import-pdf');

  return { imported: inserted?.length ?? inserts.length, batchId: importBatchId };
}
