import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Account, MerchantRule } from '@/types/db';
import NewTransactionClient from './NewTransactionClient';

type CategorySummary = {
  id: string;
  name: string;
  subcategory: string | null;
};

export default async function NewTransactionPage({
  searchParams,
}: {
  // 👇 en Next 16 viene como Promise
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userId = user.id;

  // 👇 desenvolvemos el Promise de searchParams
  const sp = await searchParams;
  const saved = sp.saved === '1';

  // 1) Cuentas del usuario
  const { data: accountsData, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, type, institution, currency')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (accountsError) {
    console.error(accountsError);
  }

  const accounts = (accountsData ?? []) as Account[];

  // 2) Categorías del usuario
  const { data: categoriesData, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name, subcategory')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (categoriesError) {
    console.error(categoriesError);
  }

  const categories = (categoriesData ?? []) as CategorySummary[];

  // 3) Reglas de comercio del usuario
  const { data: rulesData, error: rulesError } = await supabase
    .from('merchant_rules')
    .select(
      'id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at'
    )
    .eq('user_id', userId)
    .order('priority', { ascending: true });

  if (rulesError) {
    console.error(rulesError);
  }

  const rules = (rulesData ?? []) as MerchantRule[];

  // 4) Mapa id -> "Nombre / Subcategoría"
  const categoryMap: Record<string, string> = {};
  categories.forEach((cat) => {
    const label = cat.subcategory
      ? `${cat.name} / ${cat.subcategory}`
      : cat.name;
    categoryMap[cat.id] = label;
  });

  return (
    <NewTransactionClient
      accounts={accounts}
      categories={categories}
      rules={rules}
      categoryMap={categoryMap}
      saved={saved}
    />
  );
}
