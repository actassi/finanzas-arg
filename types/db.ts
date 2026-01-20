export type AccountType =
  | 'checking'
  | 'savings'
  | 'wallet'
  | 'credit_card'
  | 'loan'
  | 'cash';

export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'payment'
  | 'fee'
  | 'other';

export type MatchType = 'contains' | 'starts_with' | 'ends_with' | 'equals';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  credit_limit: number | null;
  cut_off_day: number | null;
  due_day: number | null;
  interest_rate: number | null;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  subcategory: string | null;
  is_essential: boolean;
  color: string;
  created_at: string;
}

export interface MerchantRule {
  id: string;
  user_id: string;
  pattern: string;
  match_type: MatchType;
  merchant_name: string | null;
  category_id: string | null;
  priority: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description_raw: string;
  merchant_name: string | null;
  category_id: string | null;
  amount: number;
  type: TransactionType;
  import_batch_id: string | null;
  created_at: string;
  receipt?: string | null;
  installment_number?: number | null;
  installments_total?: number | null;
}

export type TransactionRow = Transaction;

export interface Debt {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  principal: number;
  interest_rate: number | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface Installment {
  id: string;
  debt_id: string;
  due_date: string;
  amount_capital: number;
  amount_interest: number;
  is_paid: boolean;
  paid_date: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  year: number;
  month: number;
  category_id: string;
  amount_limit: number;
  created_at: string;
}
