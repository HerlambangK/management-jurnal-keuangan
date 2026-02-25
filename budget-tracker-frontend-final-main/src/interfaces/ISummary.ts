export interface SummaryItem {
  id?: number;
  user_id: number;
  month?: string;
  year?: string;
  total_income?: string;
  total_expense?: string;
  balance?: string;
  created_at: string;
  updated_at?: string;
  ai_summary: string;
  ai_recomendation: string;
}

export interface MonthlySummaryForecast {
  nextMonthLabel: string;
  predictedIncome: number;
  predictedExpense: number;
  predictedBalance: number;
  incomeRange: [number, number];
  expenseRange: [number, number];
  balanceRange: [number, number];
  confidence: number;
  confidenceLabel: "tinggi" | "menengah" | "rendah";
  sampleSize: number;
  insight: string;
  actionItems: string[];
  source: string;
  model: string | null;
}
