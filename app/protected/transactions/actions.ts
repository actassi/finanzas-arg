// app/protected/transactions/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseStatementPdf } from '@/lib/pdf/statementParser';
import type { MerchantRule, MatchType, TransactionType } from '@/types/db';
import crypto from 'node:crypto';

/**
 * Devuelve siempre positivo (según tu requerimiento actual).
 */
function signedAmount(amount: number): number {
  return Math.abs(amount);
}

/**
 * Normaliza el tipo para casos especiales.
 * - "SU PAGO EN PESOS" no es gasto: lo marcamos como payment (o filtralo si preferís).
 */
function normalizeType(desc: string, fallback: TransactionType): TransactionType {
  if (desc.trim().toUpperCase() === 'SU PAGO EN PESOS') return 'payment';
  return fallback;
}

/** Normalización suave para matching (case-insensitive, sin tildes, espacios colapsados). */
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

  // Mayor prioridad primero; a igual prioridad, patrón más largo (más específico)
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

export async function importTransactionsFromPdf(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(userError);
    throw new Error('No se pudo validar la sesión.');
  }
  if (!user) redirect('/login');

  const accountId = String(formData.get('account_id') ?? '').trim();
  const fallbackType = String(formData.get('type') ?? 'expense').trim() as TransactionType;

  const file = formData.get('file');
  if (!accountId) throw new Error('Falta account_id.');
  if (!(file instanceof File)) throw new Error('Falta el archivo PDF.');
  if (file.type && file.type !== 'application/pdf') throw new Error('El archivo no es un PDF.');

  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);

  const rows = await parseStatementPdf(buffer);

  if (!rows.length) {
    redirect('/protected/transactions/import-pdf?imported=0');
  }

  // Cargar reglas una sola vez
  const { data: rulesData, error: rulesErr } = await supabase
    .from('merchant_rules')
    .select('id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at')
    .eq('user_id', user.id)
    .order('priority', { ascending: false });

  if (rulesErr) {
    console.error('Error cargando merchant_rules:', rulesErr);
  }

  const rules = (rulesData ?? []) as MerchantRule[];

  const importBatchId = crypto.randomUUID();

  // IMPORTANTE:
  // Esto asume que ya agregaste estas columnas a `transactions`:
  // - receipt (text)
  // - installment_number (int)
  // - installments_total (int)
  const inserts = rows.map((r) => {
    const type = normalizeType(r.description, fallbackType);

    // Para pagos, por defecto no categorizamos (opcional). Si querés categorizarlos, remové este if.
    const { merchant_name, category_id } =
      type === 'payment'
        ? { merchant_name: null, category_id: null, matched_rule_id: null }
        : applyMerchantRules(r.description, rules);

    const finalMerchantName = merchant_name ?? r.description;

    return {
      user_id: user.id,
      account_id: accountId,
      date: r.date,                   // YYYY-MM-DD
      description_raw: r.description,  // solo alfabético
      merchant_name: finalMerchantName,
      category_id,
      amount: signedAmount(r.amount),  // siempre positivo
      type,
      import_batch_id: importBatchId,

      // Columnas separadas
      receipt: r.receipt,
      installment_number: r.installmentNumber,
      installments_total: r.installmentsTotal,
    };
  });

  const { error: insErr, data: inserted } = await supabase
    .from('transactions')
    .insert(inserts)
    .select('id');

  if (insErr) {
    console.error('Supabase insert error:', insErr);
    throw new Error('Error insertando transacciones en la base.');
  }

  revalidatePath('/protected/transactions');
  revalidatePath('/protected/transactions/import-pdf');

  const importedCount = inserted?.length ?? inserts.length;
  redirect(`/protected/transactions/import-pdf?imported=${importedCount}`);
}
