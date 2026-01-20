'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sanitizeDbErrorWithDuplicate } from '@/lib/errors';

function cleanTextOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function cleanText(v: unknown): string {
  return String(v ?? '').trim();
}

export async function createCategory(input: {
  name: string;
  subcategory?: string | null;
  is_essential?: boolean;
  color?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error('No se pudo validar la sesión.');
  if (!user) redirect('/auth/login');

  const name = cleanText(input.name);
  if (!name) throw new Error('El nombre es obligatorio.');

  const subcategory = cleanTextOrNull(input.subcategory);
  const color = cleanText(input.color || '#0ea5e9') || '#0ea5e9';
  const is_essential = !!input.is_essential;

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    name,
    subcategory,
    is_essential,
    color,
  });

  if (error) {
    throw new Error(
      sanitizeDbErrorWithDuplicate(
        error,
        'Ya existe una categoría con ese nombre y subcategoría.',
        'create category'
      )
    );
  }

  revalidatePath('/protected/categories');
  revalidatePath('/protected/transactions');
  revalidatePath('/protected/reports');
}

export async function updateCategory(input: {
  id: string;
  name: string;
  subcategory?: string | null;
  is_essential?: boolean;
  color?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error('No se pudo validar la sesión.');
  if (!user) redirect('/auth/login');

  const id = cleanText(input.id);
  if (!id) throw new Error('Falta id.');

  const name = cleanText(input.name);
  if (!name) throw new Error('El nombre es obligatorio.');

  const subcategory = cleanTextOrNull(input.subcategory);
  const color = cleanText(input.color || '#0ea5e9') || '#0ea5e9';
  const is_essential = !!input.is_essential;

  const { error } = await supabase
    .from('categories')
    .update({
      name,
      subcategory,
      is_essential,
      color,
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(
      sanitizeDbErrorWithDuplicate(
        error,
        'Ya existe una categoría con ese nombre y subcategoría.',
        'update category'
      )
    );
  }

  revalidatePath('/protected/categories');
  revalidatePath('/protected/transactions');
  revalidatePath('/protected/reports');
}

export async function deleteCategory(input: { id: string }) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error('No se pudo validar la sesión.');
  if (!user) redirect('/auth/login');

  const id = cleanText(input.id);
  if (!id) throw new Error('Falta id.');

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(
      sanitizeDbErrorWithDuplicate(
        error,
        'No se puede eliminar: hay datos relacionados.',
        'delete category'
      )
    );
  }

  revalidatePath('/protected/categories');
  revalidatePath('/protected/transactions');
  revalidatePath('/protected/reports');
}
