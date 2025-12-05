'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createOrUpdateRule(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const id = formData.get('id')?.toString().trim() || null;
  const pattern = formData.get('pattern')?.toString().trim() || '';
  const matchType = formData.get('match_type')?.toString().trim() || 'contains';
  const merchantName =
    formData.get('merchant_name')?.toString().trim() || null;
  const categoryId =
    formData.get('category_id')?.toString().trim() || null;
  const priorityStr = formData.get('priority')?.toString().trim() || '100';
  const priority = Number(priorityStr) || 100;

  if (!pattern) {
    // En un futuro podríamos devolver un error más friendly,
    // por ahora simplemente no hacemos nada
    return;
  }

  if (id) {
    // UPDATE
    const { error } = await supabase
      .from('merchant_rules')
      .update({
        pattern,
        match_type: matchType,
        merchant_name: merchantName,
        category_id: categoryId || null,
        priority,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error actualizando regla:', error);
    }
  } else {
    // INSERT
    const { error } = await supabase.from('merchant_rules').insert({
      user_id: user.id,
      pattern,
      match_type: matchType,
      merchant_name: merchantName,
      category_id: categoryId || null,
      priority,
    });

    if (error) {
      console.error('Error creando regla:', error);
    }
  }

  revalidatePath('/protected/rules');
}

export async function deleteRule(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const id = formData.get('id')?.toString().trim();

  if (!id) return;

  const { error } = await supabase
    .from('merchant_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error eliminando regla:', error);
  }

  revalidatePath('/protected/rules');
}
