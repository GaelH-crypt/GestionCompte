// ─── Auth ──────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
}

// ─── Accounts ──────────────────────────────────────────────────────────────

export type AccountType = 'checking' | 'savings' | 'cash' | 'other'

export interface Account {
  id: number
  name: string
  account_type: AccountType
  initial_balance: string
  current_balance: number
  color: string
  icon: string
  is_active: boolean
  created_at: string
}

// ─── Categories ────────────────────────────────────────────────────────────

export interface Category {
  id: number
  name: string
  color: string
  icon: string
  parent: number | null
  subcategories: Category[]
  created_at: string
}

export interface CategoryRule {
  id: number
  pattern: string
  match_type: 'contains' | 'starts_with' | 'exact'
  category: number
  category_name: string
  order: number
  created_at: string
}

// ─── Transactions ──────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: number
  account: number
  account_name: string
  transaction_type: TransactionType
  amount: string
  category: number | null
  category_name: string | null
  description: string
  date: string
  is_recurring: boolean
  note: string
  tags: string[]
  transfer_to_account: number | null
  created_at: string
  updated_at: string
}

// ─── Recurring ─────────────────────────────────────────────────────────────

export type Frequency = 'weekly' | 'monthly' | 'yearly'

export interface RecurringTransaction {
  id: number
  name: string
  amount: string
  transaction_type: 'income' | 'expense'
  frequency: Frequency
  next_occurrence: string
  category: number | null
  category_name: string | null
  account: number
  account_name: string
  credit: number | null
  credit_name: string | null
  is_active: boolean
  note: string
  created_at: string
}

export interface RecurringSuggestion {
  name: string
  amount: string
  transaction_type: 'income' | 'expense'
  frequency: Frequency
  next_occurrence: string
  occurrence_count: number
  last_date: string
  account: number
}

// ─── Credits ───────────────────────────────────────────────────────────────

export type CreditType = 'mortgage' | 'auto' | 'consumer' | 'other'

export interface Credit {
  id: number
  name: string
  credit_type: CreditType
  initial_capital: string
  remaining_capital: string
  interest_rate: string
  monthly_payment: string
  insurance_monthly: string
  duration_months: number
  start_date: string
  end_date: string | null
  early_repayment_possible: boolean
  notes: string
  is_active: boolean
  total_cost: number
  total_interest: number
  remaining_months: number
  estimated_end_date: string
  total_monthly_charge: number
  created_at: string
}

export interface ScheduleRow {
  month: number
  interest: number
  principal: number
  remaining_capital: number
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface AccountBalance {
  id: number
  name: string
  type: string
  balance: number
  color: string
  icon: string
}

export interface UpcomingDeadline {
  name: string
  amount: string
  next_occurrence: string
  transaction_type: string
}

export interface ExpenseByCategory {
  name: string
  color: string
  amount: number
}

export interface DashboardSummary {
  total_balance: number
  accounts: AccountBalance[]
  month_income: number
  month_expenses: number
  remaining_to_live: number
  total_monthly_credits: number
  total_recurring_expenses: number
  expenses_by_category: ExpenseByCategory[]
  upcoming_deadlines: UpcomingDeadline[]
}

export interface BalanceHistoryItem {
  month: string
  income: number
  expenses: number
  net: number
}

// ─── Projections ───────────────────────────────────────────────────────────

export interface ProjectionPoint {
  month: string
  date: string
  income: number
  expenses: number
  credits: number
  net: number
  balance: number
  baseline_balance?: number
  delta?: number
}

export interface SimulationExpenseItem {
  id: string
  label: string
  amount: number
}

export interface SimulationParams {
  months: number
  income?: number
  expenses?: number
  credits?: number
  extra_expenses?: Pick<SimulationExpenseItem, 'label' | 'amount'>[]
}

// ─── API ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ─── Import XLSX ───────────────────────────────────────────────────────────

export interface ImportedAccount {
  name: string
  rib: string
  balance: number
}

export interface ImportedTransaction {
  date: string
  description: string
  amount: number
  transaction_type: TransactionType
  suggested_category: string | null
  category_id: number | null
  is_recurring?: boolean
}

export interface AccountMapping {
  rib: string
  create: boolean
  id?: number
  name: string
  account_type: AccountType
}

export interface PreviewResponse {
  accounts: ImportedAccount[]
  existing_accounts: { id: number; name: string; account_type: AccountType }[]
  transactions: Record<string, ImportedTransaction[]>
  duplicate_counts: Record<string, number>
}

export interface SheetMeta {
  name: string
  columns: string[]
  sample_rows: string[][]
}

export interface ColumnHints {
  sheet_name: string
  date_col: number
  description_col: number
  amount_col?: number
  debit_col?: number
  credit_col?: number
}

export interface ConfirmPayload {
  mapping: Record<string, AccountMapping>
  transactions: Record<string, ImportedTransaction[]>
}

export interface ConfirmResponse {
  created_accounts: number
  created_transactions: number
  skipped_ribs?: string[]
}

// ─── Bank Sync (GoCardless) ─────────────────────────────────────────────────

export interface BankInstitution {
  id: string
  name: string
  bic: string
  transaction_total_days: string
  logo: string
  countries: string[]
}

export type RequisitionStatus = 'CR' | 'LN' | 'EX' | 'RJ' | 'UA' | 'GA' | 'SA'

export interface BankAccountLinked {
  id: number
  account_id: string
  iban: string
  name: string
  currency: string
  last_synced_at: string | null
  linked_account: number | null
  linked_account_name: string | null
  requisition: number
  requisition_institution: string
  recent_sync_logs: SyncLogItem[]
}

export interface BankRequisitionItem {
  id: number
  requisition_id: string
  institution_id: string
  institution_name: string
  institution_logo: string
  status: RequisitionStatus
  redirect_url: string
  reference: string
  created_at: string
  bank_accounts: BankAccountLinked[]
}

export interface SyncLogItem {
  id: number
  synced_at: string
  transactions_added: number
  status: 'success' | 'error'
  error_message: string
}

export interface CreateRequisitionResponse {
  id: number
  redirect_url: string
}
