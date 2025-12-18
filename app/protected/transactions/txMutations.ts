'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateTransactionCategory(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) throw new Error('No autenticado');

  const txId = String(formData.get('tx_id') ?? '').trim();
  const categoryIdRaw = String(formData.get('category_id') ?? '').trim();
  const categoryId = categoryIdRaw === '' ? null : categoryIdRaw;

  if (!txId) throw new Error('Falta tx_id');

  const { error } = await supabase
    .from('transactions')
    .update({ category_id: categoryId })
    .eq('id', txId)
    .eq('user_id', user.id);

  if (error) {
    console.error(error);
    throw new Error('No se pudo actualizar la categoría');
  }

  revalidatePath('/protected/transactions');
}

export async function updateTransactionMerchant(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) throw new Error('No autenticado');

  const txId = String(formData.get('tx_id') ?? '').trim();
  const merchantRaw = String(formData.get('merchant_name') ?? '').trim();
  const merchant = merchantRaw === '' ? null : merchantRaw;

  if (!txId) throw new Error('Falta tx_id');

  const { error } = await supabase
    .from('transactions')
    .update({ merchant_name: merchant })
    .eq('id', txId)
    .eq('user_id', user.id);

  if (error) {
    console.error(error);
    throw new Error('No se pudo actualizar el merchant');
  }

  revalidatePath('/protected/transactions');
}
