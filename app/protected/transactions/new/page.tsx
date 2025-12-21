import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account, MerchantRule } from "@/types/db";
import NewTransactionClient from "./NewTransactionClient";

type CategorySummary = {
  id: string;
  name: string;
  subcategory: string | null;
  color: string;
};

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const userId = user.id;

  const sp = await searchParams;
  const saved = sp.saved === "1";

  // 1) Cuentas del usuario
  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, user_id, name, type, institution, currency, created_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (accountsError) console.error("accountsError:", accountsError);

  const accounts = (accountsData ?? []) as Account[];

  // 2) Categorías del usuario (incluye color)
  const { data: categoriesData, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name, subcategory, color")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (categoriesError) console.error("categoriesError:", categoriesError);

  const categories = (categoriesData ?? []) as CategorySummary[];

  // 3) Reglas de comercio del usuario
  const { data: rulesData, error: rulesError } = await supabase
    .from("merchant_rules")
    .select("id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at")
    .eq("user_id", userId)
    .order("priority", { ascending: false });

  if (rulesError) console.error("rulesError:", rulesError);

  const rules = (rulesData ?? []) as MerchantRule[];

  // 4) Mapas para labels y colores
  const categoryLabelMap: Record<string, string> = {};
  const categoryColorMap: Record<string, string> = {};

  for (const cat of categories) {
    const label = cat.subcategory ? `${cat.name} / ${cat.subcategory}` : cat.name;
    categoryLabelMap[cat.id] = label;
    categoryColorMap[cat.id] = cat.color || "#64748b";
  }

  return (
    <NewTransactionClient
      accounts={accounts}
      categories={categories}
      rules={rules}
      categoryLabelMap={categoryLabelMap}
      categoryColorMap={categoryColorMap}
      saved={saved}
    />
  );
}
