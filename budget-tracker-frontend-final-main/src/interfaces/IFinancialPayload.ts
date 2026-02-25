export interface FinancialPayloadTransactionItem {
  id: number;
  date: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  note: string;
}

export interface FinancialPayloadChartItem {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export interface FinancialPayloadDailyItem {
  date: string;
  income: number;
  expense: number;
  net: number;
  transaction_count: number;
}

export interface FinancialPayloadWeeklyItem {
  week_label: string;
  start_date: string;
  end_date: string;
  income: number;
  expense: number;
  net: number;
  transaction_count: number;
}

export interface FinancialPayloadMonthlyItem {
  month: string;
  income: number;
  expense: number;
  net: number;
  transaction_count: number;
}

export interface FinancialPayload {
  generated_at: string;
  source: string;
  period: {
    reference_month: string;
    start_date: string;
    end_date: string;
  };
  summary: {
    balance: number;
    income: number;
    expense: number;
    saving: number;
    remaining_money: number;
    expense_ratio_percent: number;
  };
  chart: {
    points: FinancialPayloadChartItem[];
    total_points: number;
    total_income: number;
    total_expense: number;
    net_flow: number;
    peak_income: number;
    peak_expense: number;
  };
  transactions: {
    total_count: number;
    income_count: number;
    expense_count: number;
    total_amount: number;
    average_amount: number;
    items: FinancialPayloadTransactionItem[];
  };
  insights: {
    recommended_saving: number;
    saving_gap: number;
    saving_status: "good" | "warning";
  };
  daily: {
    points: FinancialPayloadDailyItem[];
    total_points: number;
    total_income: number;
    total_expense: number;
    net_flow: number;
  };
  weekly: {
    points: FinancialPayloadWeeklyItem[];
    total_points: number;
    total_income: number;
    total_expense: number;
    net_flow: number;
  };
  monthly: {
    points: FinancialPayloadMonthlyItem[];
    total_points: number;
    total_income: number;
    total_expense: number;
    net_flow: number;
  };
}

export interface FinancialAIGenerateRequestPayload {
  data_keuangan: FinancialPayload;
}
