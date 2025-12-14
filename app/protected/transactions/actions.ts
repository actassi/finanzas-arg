// app/protected/transactions/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseStatementPdf } from '@/lib/pdf/statementParser';
import type { TransactionType } from '@/types/db';
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

  const importBatchId = crypto.randomUUID();

  // IMPORTANTE:
  // Esto asume que ya agregaste estas columnas a `transactions`:
  // - receipt (text)
  // - installment_number (int)
  // - installments_total (int)
  const inserts = rows.map((r) => {
    const type = normalizeType(r.description, fallbackType);

    return {
      user_id: user.id,
      account_id: accountId,
      date: r.date,                 // YYYY-MM-DD
      description_raw: r.description, // solo alfabético (viene del parser)
      merchant_name: null as string | null,
      category_id: null as string | null,
      amount: signedAmount(r.amount), // siempre positivo
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
