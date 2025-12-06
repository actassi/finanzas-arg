import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Account } from '@/types/db';
import ImportTransactionsClient from './ImportTransactionsClient';

export default async function ImportTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userId = user.id;
  const sp = await searchParams;
  const imported = sp.imported ? Number(sp.imported) || 0 : 0;

  const { data: accountsData, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, type, institution, currency')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (accountsError) {
    console.error(accountsError);
  }

  const accounts = (accountsData ?? []) as Account[];

  return (
    <ImportTransactionsClient accounts={accounts} imported={imported} />
  );
}
