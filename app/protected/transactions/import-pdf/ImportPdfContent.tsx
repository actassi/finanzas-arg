import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/db";
import ImportPdfClient from "./ImportPdfClient";

export default async function ImportPdfContent(props: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await props.searchParams; // <-- FIX
  const imported = sp?.imported ? Number(sp.imported) || 0 : 0;

  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type, institution, currency")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (accountsError) console.error(accountsError);

  return (
    <ImportPdfClient
      accounts={(accountsData ?? []) as Account[]}
      imported={imported}
    />
  );
}
