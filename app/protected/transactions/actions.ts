// app/(protected)/transactions/actions.ts
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

function cleanTextOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function isoDateOrNull(v: unknown, fieldName: string): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // input type="date" -> YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Fecha inválida en ${fieldName}. Debe ser YYYY-MM-DD.`);
  }
  return s;
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Convierte YYYY-MM-DD a YYYY-MM-01 (date) para budget_month.
 */
function monthStartISO(isoDate: string): string {
  // isoDate validado previamente con isoDateOrNull o proviene de parser (YYYY-MM-DD)
  return `${isoDate.slice(0, 7)}-01`;
}

/**
 * El budget_month “fuente de verdad”:
 * - Para resumen TC: idealmente por due_date del batch.
 * - Fallback si no hay due_date (para no romper importaciones antiguas/sin metadata).
 */
function resolveBudgetMonthForBatch(input: {
  dueDate: string | null;
  statementPeriodEnd: string | null;
  cutOffDate: string | null;
  firstTxDateFallback: string; // YYYY-MM-DD (por ejemplo rows[0].date)
}): string {
  const base =
    input.dueDate ??
    input.statementPeriodEnd ??
    input.cutOffDate ??
    input.firstTxDateFallback;

  return monthStartISO(base);
}


export async function importTransactionsFromPdf(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(userError);
    throw new Error("No se pudo validar la sesión.");
  }
  if (!user) redirect("/auth/login");

  const accountId = String(formData.get("account_id") ?? "").trim();
  const fallbackType = String(formData.get("type") ?? "expense").trim() as TransactionType;

  const file = formData.get("file");
  if (!accountId) throw new Error("Falta account_id.");
  if (!(file instanceof File)) throw new Error("Falta el archivo PDF.");
  if (file.type && file.type !== "application/pdf") throw new Error("El archivo no es un PDF.");

  // Metadata opcional del statement
  const provider = cleanTextOrNull(formData.get("provider")) ?? "VISA";
  const institution = cleanTextOrNull(formData.get("institution")) ?? null;
  const note = cleanTextOrNull(formData.get("note")) ?? null;

  // ✅ Regla de negocio: para PDF, due_date debe existir para que budget_month sea “mes presupuestario”
  const dueDate = isoDateOrNull(formData.get("due_date"), "due_date");
  if (!dueDate) {
    throw new Error(
      "Falta due_date (vencimiento del resumen). Es necesario para asignar el mes presupuestario (budget_month) por vencimiento."
    );
  }

  const cutOffDate = isoDateOrNull(formData.get("cut_off_date"), "cut_off_date");
  const periodStart = isoDateOrNull(formData.get("statement_period_start"), "statement_period_start");
  const periodEnd = isoDateOrNull(formData.get("statement_period_end"), "statement_period_end");

  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);
  const fileHash = sha256Hex(buffer);

  const rows = await parseStatementPdf(buffer);

  if (!rows.length) {
    redirect("/protected/transactions/import-pdf?imported=0");
  }

  // Cargar reglas una sola vez
  const { data: rulesData, error: rulesErr } = await supabase
    .from("merchant_rules")
    .select("id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at")
    .eq("user_id", user.id)
    .order("priority", { ascending: false });

  if (rulesErr) {
    console.error("Error cargando merchant_rules:", rulesErr);
  }

  const rules = (rulesData ?? []) as MerchantRule[];

  // 1) Crear batch en DB (fuente de verdad para import_batch_id)
  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      account_id: accountId,
      source: "pdf",
      provider,
      institution,
      file_name: file.name,
      file_sha256: fileHash,
      due_date: dueDate,
      cut_off_date: cutOffDate,
      statement_period_start: periodStart,
      statement_period_end: periodEnd,
      note,
    })
    .select("id")
    .single();

  if (batchErr) {
    const code = (batchErr as any)?.code;
    if (code === "23505") {
      console.warn("PDF duplicado detectado (sha256). Abortando import:", file.name);
      redirect("/protected/transactions/import-pdf?imported=0&duplicate=1");
    }

    console.error("Error creando import_batch:", batchErr);
    throw new Error("Error creando el batch de importación.");
  }

  const importBatchId = batch.id;

  // 2) Armar inserts con import_batch_id real
  // ✅ NO enviar budget_month: es GENERATED ALWAYS en la DB.
  // ✅ Enviar due_date para que budget_month se derive por vencimiento.
  const inserts = rows.map((r) => {
    const type = normalizeType(r.description, fallbackType);

    const { merchant_name, category_id } =
      type === "payment"
        ? { merchant_name: null, category_id: null, matched_rule_id: null }
        : applyMerchantRules(r.description, rules);

    const finalMerchantName = merchant_name ?? r.description;

    return {
      user_id: user.id,
      account_id: accountId,

      date: r.date,        // fecha del consumo/movimiento
      due_date: dueDate,   // ✅ clave para budget_month (vencimiento del resumen)

      description_raw: r.description,
      merchant_name: type === "payment" ? null : finalMerchantName,
      category_id: type === "payment" ? null : category_id,

      amount: signedAmount(r.amount), // siempre positivo
      type,
      import_batch_id: importBatchId,

      receipt: r.receipt,
      installment_number: r.installmentNumber,
      installments_total: r.installmentsTotal,
    };
  });

  const { error: insErr, data: inserted } = await supabase
    .from("transactions")
    .insert(inserts)
    .select("id");

  if (insErr) {
    console.error("Supabase insert error:", insErr);

    // Cleanup best-effort
    try {
      await supabase.from("import_batches").delete().eq("id", importBatchId).eq("user_id", user.id);
    } catch (e) {
      console.warn("No se pudo limpiar import_batches tras fallo de insert:", e);
    }

    const parts = [
      insErr.message,
      (insErr as any).details,
      (insErr as any).hint,
      (insErr as any).code ? `code=${(insErr as any).code}` : null,
    ].filter(Boolean);

    throw new Error(`Error insertando transacciones en la base: ${parts.join(" | ")}`);
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/transactions/import-pdf");
  revalidatePath("/protected/reports");

  const importedCount = inserted?.length ?? inserts.length;
  redirect(`/protected/transactions/import-pdf?imported=${importedCount}`);
}

export async function updateTransactionInline(input: {
  txId: string;
  merchantName?: string | null;
  categoryId?: string | null;
  applyToSimilar?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error('No se pudo validar la sesión.');
  if (!user) redirect('/auth/login');

  // Traigo la tx base para saber cómo agrupar "similares"
  const { data: base, error: baseErr } = await supabase
    .from('transactions')
    .select('id,user_id,account_id,merchant_name,description_raw')
    .eq('id', input.txId)
    .single();

  if (baseErr || !base) throw new Error('No se encontró la transacción.');
  if (base.user_id !== user.id) throw new Error('No autorizado.');

  const merchantName = cleanTextOrNull(input.merchantName);
  const categoryId = cleanTextOrNull(input.categoryId);

  const patch: Record<string, any> = {
    merchant_name: merchantName,
    category_id: categoryId,
  };

  if (input.applyToSimilar) {
    let q = supabase
      .from('transactions')
      .update(patch)
      .eq('user_id', user.id)
      .eq('account_id', base.account_id);

    if (base.merchant_name) {
      q = q.eq('merchant_name', base.merchant_name);
    } else {
      q = q.is('merchant_name', null).eq('description_raw', base.description_raw);
    }

    const { error: updErr } = await q;
    if (updErr) {
      console.error('updateTransactionInline (similar) error:', updErr);
      throw new Error('Error actualizando transacciones similares.');
    }
  } else {
    const { error: updErr } = await supabase
      .from('transactions')
      .update(patch)
      .eq('user_id', user.id)
      .eq('id', input.txId);

    if (updErr) {
      console.error('updateTransactionInline (single) error:', updErr);
      throw new Error('Error actualizando la transacción.');
    }
  }

  // LINK GLOBAL: Merchant → Categoría en merchant_rules
  if (merchantName && categoryId) {
    const { error: ruleErr } = await supabase
      .from('merchant_rules')
      .upsert(
        {
          user_id: user.id,
          pattern: merchantName,
          match_type: 'equals',
          merchant_name: merchantName,
          category_id: categoryId,
          priority: 1000,
        },
        { onConflict: 'user_id,match_type,pattern' }
      );

    if (ruleErr) {
      console.error('merchant_rules upsert error:', ruleErr);
      throw new Error(
        'Se guardó la transacción, pero falló el link Merchant→Categoría (merchant_rules).'
      );
    }
  }
  revalidatePath('/protected/transactions');
  revalidatePath('/protected/transactions/import-pdf');
  revalidatePath('/protected/reports');
}

// export async function createTransaction(formData: FormData) {
//   const supabase = await createClient();

//   const {
//     data: { user },
//     error: userError,
//   } = await supabase.auth.getUser();

//   if (userError) {
//     console.error(userError);
//     throw new Error("No se pudo validar la sesión.");
//   }
//   if (!user) redirect("/auth/login");

//   const accountId = String(formData.get("account_id") ?? "").trim();
//   const date = isoDateOrNull(formData.get("date"), "date");
//   const dueDate = isoDateOrNull(formData.get("due_date"), "due_date"); // opcional
//   const descriptionRaw = String(formData.get("description_raw") ?? "").trim();
//   const amountRaw = String(formData.get("amount") ?? "").trim();
//   const type = String(formData.get("type") ?? "expense").trim() as TransactionType;

//   const merchantNameInput = cleanTextOrNull(formData.get("merchant_name"));
//   const categoryIdInput = cleanTextOrNull(formData.get("category_id"));
//   const saveRule = String(formData.get("save_rule") ?? "") === "1";

//   if (!accountId) throw new Error("Falta account_id.");
//   if (!date) throw new Error("Falta date.");
//   if (!descriptionRaw) throw new Error("Falta description_raw.");
//   if (!amountRaw) throw new Error("Falta amount.");

//   const amountNum = Number(amountRaw);
//   if (!Number.isFinite(amountNum) || amountNum === 0) {
//     throw new Error("Monto inválido (debe ser numérico y distinto de 0).");
//   }

//   const isPayment = type === "payment";
//   const finalMerchantName = isPayment ? null : (merchantNameInput ?? descriptionRaw);
//   const finalCategoryId = isPayment ? null : categoryIdInput;

//   const { error: insErr } = await supabase.from("transactions").insert({
//     user_id: user.id,
//     account_id: accountId,
//     date,
//     due_date: dueDate, // si no viene, queda NULL
//     description_raw: descriptionRaw,
//     merchant_name: finalMerchantName,
//     category_id: finalCategoryId,
//     amount: signedAmount(amountNum),
//     type,
//     import_batch_id: null,
//   });

//   if (insErr) {
//     console.error("createTransaction insert error:", insErr);

//     // Esto te va a decir EXACTAMENTE por qué falla (RLS, columna inexistente, etc.)
//     const parts = [
//       insErr.message,
//       (insErr as any).details,
//       (insErr as any).hint,
//       (insErr as any).code ? `code=${(insErr as any).code}` : null,
//     ].filter(Boolean);

//     throw new Error(`Error insertando la transacción: ${parts.join(" | ")}`);
//   }

//   if (saveRule && !isPayment && finalMerchantName && finalCategoryId) {
//     const { error: ruleErr } = await supabase
//       .from("merchant_rules")
//       .upsert(
//         {
//           user_id: user.id,
//           pattern: finalMerchantName,
//           match_type: "equals",
//           merchant_name: finalMerchantName,
//           category_id: finalCategoryId,
//           priority: 1000,
//         },
//         { onConflict: "user_id,match_type,pattern" }
//       );

//     // No abortamos: la transacción ya quedó guardada
//     if (ruleErr) console.error("createTransaction merchant_rules upsert error:", ruleErr);
//   }

//   revalidatePath("/protected/transactions");
//   revalidatePath("/protected/reports");
//   revalidatePath("/protected/transactions/new");

//   redirect("/protected/transactions/new?saved=1");
// }

export async function createTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(userError);
    throw new Error("No se pudo validar la sesión.");
  }
  if (!user) redirect("/auth/login");

  const accountId = String(formData.get("account_id") ?? "").trim();

  // Fecha operación (requerida)
  const date = isoDateOrNull(formData.get("date"), "date");

  // Vencimiento (opcional) — blindado contra ''
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const dueDate = dueDateRaw ? isoDateOrNull(dueDateRaw, "due_date") : null;

  const descriptionRaw = String(formData.get("description_raw") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const type = String(formData.get("type") ?? "expense").trim() as TransactionType;

  // Blindar contra '' (uuid vacío) y textos vacíos
  const merchantNameInput = cleanTextOrNull(formData.get("merchant_name"));
  const categoryIdInput = cleanTextOrNull(formData.get("category_id"));

  const saveRule = String(formData.get("save_rule") ?? "") === "1";

  if (!accountId) throw new Error("Falta account_id.");
  if (!date) throw new Error("Falta date.");
  if (!descriptionRaw) throw new Error("Falta description_raw.");
  if (!amountRaw) throw new Error("Falta amount.");

  const amountNum = Number(amountRaw);
  if (!Number.isFinite(amountNum) || amountNum === 0) {
    throw new Error("Monto inválido (debe ser numérico y distinto de 0).");
  }

  const isPayment = type === "payment";

  // Si es payment, no clasificamos
  const finalMerchantName = isPayment ? null : (merchantNameInput ?? descriptionRaw);
  const finalCategoryId = isPayment ? null : categoryIdInput;

  const { error: insErr } = await supabase.from("transactions").insert({
    user_id: user.id,
    account_id: accountId,
    date,
    due_date: dueDate, // ✅ opcional (NULL si no viene)
    description_raw: descriptionRaw,
    merchant_name: finalMerchantName,
    category_id: finalCategoryId,
    amount: signedAmount(amountNum), // siempre positivo
    type,
    import_batch_id: null,
    // budget_month: NO (GENERATED)
  });

  if (insErr) {
    console.error("createTransaction insert error:", insErr);

    const parts = [
      insErr.message,
      (insErr as any).details,
      (insErr as any).hint,
      (insErr as any).code ? `code=${(insErr as any).code}` : null,
    ].filter(Boolean);

    throw new Error(`Error insertando la transacción: ${parts.join(" | ")}`);
  }

  // Guardado de regla (si lo usás desde UI)
  if (saveRule && !isPayment && finalMerchantName && finalCategoryId) {
    const { error: ruleErr } = await supabase
      .from("merchant_rules")
      .upsert(
        {
          user_id: user.id,
          pattern: finalMerchantName,
          match_type: "equals",
          merchant_name: finalMerchantName,
          category_id: finalCategoryId,
          priority: 1000,
        },
        { onConflict: "user_id,match_type,pattern" }
      );

    // No abortamos: la transacción ya quedó guardada
    if (ruleErr) console.error("createTransaction merchant_rules upsert error:", ruleErr);
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/reports");
  revalidatePath("/protected/transactions/new");

  redirect("/protected/transactions/new?saved=1");
}

