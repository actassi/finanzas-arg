"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sanitizeDbError } from "@/lib/errors";

export type AccountActionState = {
  ok: boolean;
  error: string | null;
  message: string | null;
};

const initialState: AccountActionState = {
  ok: false,
  error: null,
  message: null,
};

function cleanText(v: unknown): string {
  return String(v ?? "").trim();
}

function textOrNull(v: unknown): string | null {
  const s = cleanText(v);
  return s ? s : null;
}

function intOrNull(v: unknown): number | null {
  const s = cleanText(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function numOrNull(v: unknown): number | null {
  const s = cleanText(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateDayOrNull(n: number | null, field: string) {
  if (n == null) return;
  if (n < 1 || n > 31) throw new Error(`${field} debe estar entre 1 y 31.`);
}

export async function createAccount(
  _prev: AccountActionState = initialState,
  formData: FormData
): Promise<AccountActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { ok: false, error: "No se pudo validar la sesión.", message: null };
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a iniciar sesión.", message: null };

  const name = cleanText(formData.get("name"));
  const type = cleanText(formData.get("type"));
  const currency = cleanText(formData.get("currency"));

  const institution = textOrNull(formData.get("institution"));
  const credit_limit = numOrNull(formData.get("credit_limit"));
  const cut_off_day = intOrNull(formData.get("cut_off_day"));
  const due_day = intOrNull(formData.get("due_day"));
  const interest_rate = numOrNull(formData.get("interest_rate"));

  if (!name) return { ok: false, error: "Falta el nombre de la cuenta.", message: null };
  if (!type) return { ok: false, error: "Falta el tipo de cuenta.", message: null };
  if (!currency) return { ok: false, error: "Falta la moneda.", message: null };

  try {
    validateDayOrNull(cut_off_day, "Cierre (día)");
    validateDayOrNull(due_day, "Venc. (día)");
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Validación inválida.", message: null };
  }

  const { error: insErr } = await supabase.from("accounts").insert({
    user_id: user.id,
    name,
    type,
    currency,
    institution,
    credit_limit,
    cut_off_day,
    due_day,
    interest_rate,
  });

  if (insErr) return { ok: false, error: sanitizeDbError(insErr, "create account"), message: null };

  revalidatePath("/protected/accounts");
  revalidatePath("/protected/transactions");
  revalidatePath("/protected/reports");

  return { ok: true, error: null, message: "Cuenta creada correctamente." };
}

/**
 * Edición inline (MVP)
 */
export async function updateAccountInline(input: {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  institution?: string | null;
  credit_limit?: number | null;
  cut_off_day?: number | null;
  due_day?: number | null;
  interest_rate?: number | null;
}): Promise<AccountActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { ok: false, error: "No se pudo validar la sesión.", message: null };
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a iniciar sesión.", message: null };

  const accountId = cleanText(input.accountId);
  if (!accountId) return { ok: false, error: "Falta accountId.", message: null };

  // Validación de ownership
  const { data: acc, error: accErr } = await supabase
    .from("accounts")
    .select("id,user_id")
    .eq("id", accountId)
    .single();

  if (accErr || !acc) return { ok: false, error: "No se encontró la cuenta.", message: null };
  if ((acc as any).user_id !== user.id) return { ok: false, error: "No autorizado.", message: null };

  const name = cleanText(input.name);
  const type = cleanText(input.type);
  const currency = cleanText(input.currency);

  if (!name) return { ok: false, error: "El nombre no puede quedar vacío.", message: null };
  if (!type) return { ok: false, error: "El tipo no puede quedar vacío.", message: null };
  if (!currency) return { ok: false, error: "La moneda no puede quedar vacía.", message: null };

  try {
    validateDayOrNull(input.cut_off_day ?? null, "Cierre (día)");
    validateDayOrNull(input.due_day ?? null, "Venc. (día)");
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Validación inválida.", message: null };
  }

  const patch = {
    name,
    type,
    currency,
    institution: input.institution ?? null,
    credit_limit: input.credit_limit ?? null,
    cut_off_day: input.cut_off_day ?? null,
    due_day: input.due_day ?? null,
    interest_rate: input.interest_rate ?? null,
  };

  const { error: updErr } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (updErr) return { ok: false, error: sanitizeDbError(updErr, "update account"), message: null };

  revalidatePath("/protected/accounts");
  revalidatePath("/protected/transactions");
  revalidatePath("/protected/reports");

  return { ok: true, error: null, message: "Cuenta actualizada." };
}

/**
 * Borrado permitido SOLO si no tiene transacciones asociadas
 */
export async function deleteAccountIfEmpty(accountIdRaw: string): Promise<AccountActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { ok: false, error: "No se pudo validar la sesión.", message: null };
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a iniciar sesión.", message: null };

  const accountId = cleanText(accountIdRaw);
  if (!accountId) return { ok: false, error: "Falta accountId.", message: null };

  // Ownership + existencia
  const { data: acc, error: accErr } = await supabase
    .from("accounts")
    .select("id,user_id")
    .eq("id", accountId)
    .single();

  if (accErr || !acc) return { ok: false, error: "No se encontró la cuenta.", message: null };
  if ((acc as any).user_id !== user.id) return { ok: false, error: "No autorizado.", message: null };

  // Chequeo de movimientos
  const { count, error: cErr } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("account_id", accountId);

  if (cErr) return { ok: false, error: sanitizeDbError(cErr, "count transactions"), message: null };

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "No se puede borrar: la cuenta tiene transacciones asociadas.",
      message: null,
    };
  }

  const { error: delErr } = await supabase.from("accounts").delete().eq("id", accountId).eq("user_id", user.id);
  if (delErr) return { ok: false, error: sanitizeDbError(delErr, "delete account"), message: null };

  revalidatePath("/protected/accounts");
  revalidatePath("/protected/transactions");
  revalidatePath("/protected/reports");

  return { ok: true, error: null, message: "Cuenta borrada." };
}
