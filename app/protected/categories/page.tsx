import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import CategoriesTableClient from './CategoriesTableClient';

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  subcategory: string | null;
  is_essential: boolean;
  color: string;
  created_at: string;
};

export default async function CategoriesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect('/auth/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: categoriesData, error: catErr } = await supabase
    .from('categories')
    .select('id,user_id,name,subcategory,is_essential,color,created_at')
    .eq('user_id', user.id)
    .order('name', { ascending: true })
    .order('subcategory', { ascending: true });

  if (catErr) {
    console.error('Error cargando categories:', catErr);
  }

  const categories = (categoriesData ?? []) as CategoryRow[];

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            Administración de categorías por usuario (nombre, subcategoría, color y esencial).
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/protected/transactions"
            className="h-9 px-3 rounded-md border inline-flex items-center"
          >
            Volver a Transacciones
          </Link>
          <Link
            href="/protected/reports"
            className="h-9 px-3 rounded-md border inline-flex items-center"
          >
            Ir a Visualizaciones
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <CategoriesTableClient initialCategories={categories} />
      </div>
    </div>
  );
}
