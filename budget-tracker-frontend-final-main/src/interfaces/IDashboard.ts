export interface SummaryData {
  balance: number;
  saving: number;
  income: number;
  expense: number;
  period_month?: string;
  period_start?: string;
  period_end?: string;
  is_fallback?: boolean;
}

export interface FinancialOverviewData {
  period_month: string;
  period_start: string;
  period_end: string;
  is_fallback?: boolean;
  monthly_income: number;
  monthly_balance: number;
  opening_balance: number;
  closing_balance: number;
  monthly_transaction_count: number;
  income_transaction_count: number;
  expense_transaction_count: number;
  income_trend: Array<{
    month: string;
    income: number;
  }>;
}

export interface Transaction {
  id: number;
  category: {
    name: string;
  };
  note?: string;
  date: string;
  type: "income" | "expense";
  amount: string;
}

export interface ChartPoint {
  date: string;
  income: number;
  expense: number;
}
