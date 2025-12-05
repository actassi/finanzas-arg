import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { MerchantRule } from '@/types/db';
import RulesClient from './RulesClient';

type CategorySummary = {
  id: string;
  name: string;
  subcategory: string | null;
};

export default async function RulesPage() {
  const supabase = await createClient();

  // 1) Usuario logueado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login'); // ajustá si tu ruta es otra
  }

  // 2) Reglas del usuario
  const { data: rulesData, error: rulesError } = await supabase
    .from('merchant_rules')
    .select(
      'id, user_id, pattern, match_type, merchant_name, category_id, priority, created_at'
    )
    .eq('user_id', user.id)
    .order('priority', { ascending: true });

  if (rulesError) {
    console.error(rulesError);
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div>Error cargando reglas</div>
      </main>
    );
  }

  const rules = (rulesData ?? []) as MerchantRule[];

  // 3) Categorías del usuario
  const { data: categoriesData, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name, subcategory')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (categoriesError) {
    console.error(categoriesError);
  }

  const categories = (categoriesData ?? []) as CategorySummary[];

  // 4) Mapa id -> "Nombre / Subcategoría"
  const categoryMap: Record<string, string> = {};
  categories.forEach((cat) => {
    const label = cat.subcategory
      ? `${cat.name} / ${cat.subcategory}`
      : cat.name;
    categoryMap[cat.id] = label;
  });

  return (
    <RulesClient
      rules={rules}
      categories={categories}
      categoryMap={categoryMap}
    />
  );
}
