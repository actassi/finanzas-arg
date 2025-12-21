import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

function safeNext(raw: string | null) {
  const fallback = "/protected/transactions/new";

  if (!raw || !raw.trim()) return fallback;

  const next = raw.trim();

  // Tratar como "no especificado"
  if (next === "/" || next === "/protected" || next === "/protected/") return fallback;

  // Permitimos solo paths internos (evita open-redirect)
  if (next.startsWith("/") && !next.startsWith("//")) return next;

  return fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // 👇 clave: si viene /protected, lo convertimos a /protected/transactions/new
  const next = safeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) redirect(next);

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/auth/error?error=${encodeURIComponent("No token hash or type")}`);
}
