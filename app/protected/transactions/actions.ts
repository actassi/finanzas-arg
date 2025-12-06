'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { applyMerchantRules } from '@/lib/classification';
import type { MerchantRule } from '@/types/db';

/**
 * Alta de una sola transacción (pantalla "Nueva transacción")
 */
export async function createTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const accountId = formData.get('account_id')?.toString().trim() || null;
  const date = formData.get('date')?.toString().trim() || null;
  const descriptionRaw =
    formData.get('description_raw')?.toString().trim() || '';
  const merchantName =
    formData.get('merchant_name')?.toString().trim() || null;
  const categoryId =
    formData.get('category_id')?.toString().trim() || null;
  const type = formData.get('type')?.toString().trim() || 'expense';

  const amountStr = formData.get('amount')?.toString().trim() || '0';
  const amount = Number(amountStr.replace(',', '.'));

  if (!accountId || !date || !descriptionRaw || !amount) {
    return;
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: accountId,
    date, // YYYY-MM-DD
    description_raw: descriptionRaw,
    merchant_name: merchantName,
    category_id: categoryId || null,
    amount,
    type,
  });

  if (error) {
    console.error('Error creando transacción:', error);
  }

  revalidatePath('/protected/transactions/new');
  redirect('/protected/transactions/new?saved=1');
}

/**
 * Importación de CSV de movimientos
 *
 * Espera un form con:
 * - file: archivo CSV
 * - account_id: cuenta destino
 * - type: tipo de transacción por defecto (expense, income, etc.)
 */
export async function importTransactionsFromCsv(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const accountId = formData.get('account_id')?.toString().trim() || null;
  const type = formData.get('type')?.toString().trim() || 'expense';
  const file = formData.get('file') as File | null;

  if (!accountId || !file) {
    console.error('Faltan account_id o archivo');
    redirect('/protected/transactions/import?imported=0');
  }

  // 1) Leemos el archivo completo como texto
  const text = await file.text();

  // 2) Traemos las reglas del usuario para clasificar
  const { data: rulesData, error: rulesError } = await supabase
    .from('merchant_rules')
    .select(
      'id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at'
    )
    .eq('user_id', user.id)
    .order('priority', { ascending: true });

  if (rulesError) {
    console.error('Error leyendo reglas para importación:', rulesError);
  }

  const rules = (rulesData ?? []) as MerchantRule[];

  // 3) Parseamos el CSV
  type ParsedRow = {
    date: string;
    description: string;
    amount: number;
  };

  const rows: ParsedRow[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    console.error('CSV sin contenido suficiente');
    redirect('/protected/transactions/import?imported=0');
  }

  // Detectamos delimitador (muy simple)
  const detectDelimiter = (line: string) => {
    const semi = (line.match(/;/g) || []).length;
    const comma = (line.match(/,/g) || []).length;
    return semi > comma ? ';' : ',';
  };

  const headerLine = lines[0];
  const delimiter = detectDelimiter(headerLine);

  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  const findIndex = (...candidates: string[]) =>
    headers.findIndex((h) =>
      candidates.some((c) => h.includes(c.toLowerCase()))
    );

  const dateIdx = findIndex('fecha', 'date', 'fecha operación', 'fecha op');
  const descIdx = findIndex('descripción', 'descripcion', 'detalle', 'description');
  const amountIdx = findIndex('importe', 'monto', 'amount', 'importe original');

  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    console.error('No se pudieron detectar columnas fecha/descr/monto en el CSV');
    redirect('/protected/transactions/import?imported=0');
  }

  const parseArgDateToIso = (value: string): string | null => {
    const v = value.trim();
    if (!v) return null;

    // Formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

    // Formato DD/MM/AAAA o DD-MM-AAAA (muy típico banco AR)
    const m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
      let [_, dd, mm, yy] = m;
      if (yy.length === 2) {
        yy = yy >= '70' ? `19${yy}` : `20${yy}`;
      }
      const day = dd.padStart(2, '0');
      const month = mm.padStart(2, '0');
      return `${yy}-${month}-${day}`;
    }

    // Intento final con Date.parse
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }

    return null;
  };

  const parseAmount = (raw: string): number => {
    let s = raw.trim();
    if (!s) return 0;

    // Sacamos separadores de miles típicos y dejamos punto decimal
    // Ej: "4.681,16" -> "4681.16"
    s = s.replace(/\./g, '').replace(',', '.');

    // Eliminamos símbolos de moneda si los hubiera
    s = s.replace(/[^\d\.-]/g, '');

    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    if (cols.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;

    const rawDate = cols[dateIdx] ?? '';
    const rawDesc = cols[descIdx] ?? '';
    const rawAmount = cols[amountIdx] ?? '';

    const isoDate = parseArgDateToIso(String(rawDate));
    const amount = parseAmount(String(rawAmount));

    if (!isoDate || !rawDesc || !amount) {
      // Podríamos llevar conteo de filas ignoradas
      continue;
    }

    rows.push({
      date: isoDate,
      description: String(rawDesc),
      amount,
    });
  }

  if (rows.length === 0) {
    console.error('No se obtuvieron filas válidas del CSV');
    redirect('/protected/transactions/import?imported=0');
  }

  // 4) Clasificamos e insertamos
  const inserts = rows.map((row) => {
    const klass = applyMerchantRules(row.description, rules);

    return {
      user_id: user.id,
      account_id: accountId,
      date: row.date,
      description_raw: row.description,
      merchant_name: klass.merchantName,
      category_id: klass.categoryId || null,
      amount: row.amount,
      type,
    };
  });

  const { error: insertError } = await supabase
    .from('transactions')
    .insert(inserts);

  if (insertError) {
    console.error('Error insertando transacciones importadas:', insertError);
    redirect('/protected/transactions/import?imported=0');
  }

  const importedCount = inserts.length;

  revalidatePath('/protected/transactions/import');
  redirect(`/protected/transactions/import?imported=${importedCount}`);
}
