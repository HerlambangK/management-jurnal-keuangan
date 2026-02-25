import { ChartPoint, SummaryData, Transaction } from "@/interfaces/IDashboard";
import {
  FinancialAIGenerateRequestPayload,
  FinancialPayload,
} from "@/interfaces/IFinancialPayload";

type TransactionItem = FinancialPayload["transactions"]["items"][number];
type ChartItem = FinancialPayload["chart"]["points"][number];
type DailyPoint = FinancialPayload["daily"]["points"][number];
type WeeklyPoint = FinancialPayload["weekly"]["points"][number];
type MonthlyPoint = FinancialPayload["monthly"]["points"][number];

type BuildFinancialPayloadParams = {
  summary: SummaryData | null;
  chartData: ChartPoint[];
  transactions: Transaction[];
  source?: string;
};

const MAX_MONTHLY_POINTS = 12;
const FALLBACK_SOURCE = "dashboard_page";

const parseAmount = (amount: string | number): number => {
  if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0;

  let cleaned = amount.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const parts = cleaned.split(",");
    cleaned =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/,/g, "")}.${parts[1]}`
        : cleaned.replace(/,/g, "");
  } else {
    const dotParts = cleaned.split(".");
    if (dotParts.length > 2) cleaned = dotParts.join("");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseAmount(value);
  return 0;
};

const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toDateKey = (value: string): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "-";

  const datePrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (datePrefix) return datePrefix[0];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toISOString().slice(0, 10);
};

const getCurrentYearMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const buildMonthRange = (referenceMonth: string) => {
  const [yearText, monthText] = referenceMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  const lastDay = new Date(safeYear, safeMonth, 0).getDate();

  const normalizedMonth = String(safeMonth).padStart(2, "0");
  return {
    startDate: `${safeYear}-${normalizedMonth}-01`,
    endDate: `${safeYear}-${normalizedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
};

const normalizeChartItems = (chartData: ChartPoint[]): ChartItem[] =>
  chartData
    .map((item) => {
      const date = toDateKey(item.date);
      const income = toSafeNumber(item.income);
      const expense = toSafeNumber(item.expense);
      return {
        date,
        income,
        expense,
        net: income - expense,
      };
    })
    .filter((item) => isDateKey(item.date))
    .sort((a, b) => a.date.localeCompare(b.date));

const normalizeTransactionItems = (transactions: Transaction[]): TransactionItem[] =>
  transactions
    .map((tx) => ({
      id: tx.id,
      date: toDateKey(tx.date),
      category: tx.category?.name || "-",
      type: tx.type,
      amount: parseAmount(tx.amount),
      note: tx.note || "",
    }))
    .filter((tx) => isDateKey(tx.date))
    .sort((a, b) => a.date.localeCompare(b.date));

const buildTotals = (points: Array<{ income: number; expense: number }>) => {
  const totalIncome = points.reduce((acc, point) => acc + point.income, 0);
  const totalExpense = points.reduce((acc, point) => acc + point.expense, 0);
  return {
    totalIncome,
    totalExpense,
    netFlow: totalIncome - totalExpense,
  };
};

const buildTransactionStats = (transactionItems: TransactionItem[]) => {
  const stats = transactionItems.reduce(
    (acc, tx) => {
      acc.totalAmount += tx.amount;
      if (tx.type === "income") acc.incomeCount += 1;
      if (tx.type === "expense") acc.expenseCount += 1;
      return acc;
    },
    {
      totalAmount: 0,
      incomeCount: 0,
      expenseCount: 0,
    }
  );

  return {
    total_count: transactionItems.length,
    income_count: stats.incomeCount,
    expense_count: stats.expenseCount,
    total_amount: stats.totalAmount,
    average_amount: transactionItems.length ? stats.totalAmount / transactionItems.length : 0,
    items: transactionItems,
  };
};

const resolveReferenceMonth = (
  chartItems: ChartItem[],
  transactionItems: TransactionItem[]
): string => {
  const fromChart = [...chartItems]
    .reverse()
    .find((item) => isDateKey(item.date))
    ?.date.slice(0, 7);
  if (fromChart) return fromChart;

  const fromTransactions = [...transactionItems]
    .reverse()
    .find((item) => isDateKey(item.date))
    ?.date.slice(0, 7);
  if (fromTransactions) return fromTransactions;

  return getCurrentYearMonth();
};

const buildDailyPoints = (
  chartItems: ChartItem[],
  monthlyTransactions: TransactionItem[],
  referenceMonth: string
): DailyPoint[] => {
  const txCountByDate = monthlyTransactions.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.date] = (acc[tx.date] || 0) + 1;
    return acc;
  }, {});

  const chartPointsInMonth = chartItems.filter((item) => item.date.startsWith(referenceMonth));
  if (chartPointsInMonth.length > 0) {
    return chartPointsInMonth.map((point) => ({
      ...point,
      transaction_count: txCountByDate[point.date] || 0,
    }));
  }

  const aggregateByDate = monthlyTransactions.reduce<
    Record<string, { income: number; expense: number; transaction_count: number }>
  >((acc, tx) => {
    const current = acc[tx.date] || { income: 0, expense: 0, transaction_count: 0 };
    if (tx.type === "income") current.income += tx.amount;
    if (tx.type === "expense") current.expense += tx.amount;
    current.transaction_count += 1;
    acc[tx.date] = current;
    return acc;
  }, {});

  return Object.entries(aggregateByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      income: value.income,
      expense: value.expense,
      net: value.income - value.expense,
      transaction_count: value.transaction_count,
    }));
};

const buildWeeklyPoints = (dailyPoints: DailyPoint[]): WeeklyPoint[] => {
  const weeklyMap = dailyPoints.reduce<Record<string, WeeklyPoint>>((acc, point) => {
    const dayOfMonth = Number(point.date.slice(8, 10));
    if (!Number.isFinite(dayOfMonth)) return acc;

    const monthLabel = point.date.slice(0, 7);
    const weekIndex = Math.floor((dayOfMonth - 1) / 7) + 1;
    const weekKey = `${monthLabel}-W${weekIndex}`;
    const current = acc[weekKey] || {
      week_label: `${monthLabel} W${weekIndex}`,
      start_date: point.date,
      end_date: point.date,
      income: 0,
      expense: 0,
      net: 0,
      transaction_count: 0,
    };

    current.start_date = point.date < current.start_date ? point.date : current.start_date;
    current.end_date = point.date > current.end_date ? point.date : current.end_date;
    current.income += point.income;
    current.expense += point.expense;
    current.net += point.net;
    current.transaction_count += point.transaction_count;
    acc[weekKey] = current;
    return acc;
  }, {});

  return Object.values(weeklyMap).sort((a, b) => a.start_date.localeCompare(b.start_date));
};

const buildMonthlyPoints = (transactionItems: TransactionItem[]): MonthlyPoint[] => {
  const monthlyMap = transactionItems.reduce<Record<string, MonthlyPoint>>((acc, tx) => {
    const monthKey = tx.date.slice(0, 7);
    const current = acc[monthKey] || {
      month: monthKey,
      income: 0,
      expense: 0,
      net: 0,
      transaction_count: 0,
    };

    if (tx.type === "income") current.income += tx.amount;
    if (tx.type === "expense") current.expense += tx.amount;
    current.net = current.income - current.expense;
    current.transaction_count += 1;
    acc[monthKey] = current;
    return acc;
  }, {});

  return Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-MAX_MONTHLY_POINTS);
};

export const buildFinancialPayload = ({
  summary,
  chartData,
  transactions,
  source = FALLBACK_SOURCE,
}: BuildFinancialPayloadParams): FinancialPayload => {
  const income = toSafeNumber(summary?.income);
  const expense = toSafeNumber(summary?.expense);
  const balance = toSafeNumber(summary?.balance);
  const saving = toSafeNumber(summary?.saving);

  const chartItems = normalizeChartItems(chartData);
  const allTransactionItems = normalizeTransactionItems(transactions);
  const referenceMonth = resolveReferenceMonth(chartItems, allTransactionItems);
  const period = buildMonthRange(referenceMonth);

  const monthlyTransactions = allTransactionItems.filter((tx) =>
    tx.date.startsWith(referenceMonth)
  );
  const chartPointsInMonth = chartItems.filter((item) =>
    item.date.startsWith(referenceMonth)
  );

  const dailyPoints = buildDailyPoints(chartPointsInMonth, monthlyTransactions, referenceMonth);
  const weeklyPoints = buildWeeklyPoints(dailyPoints);
  const monthlyPoints = buildMonthlyPoints(allTransactionItems);

  const chartTotals = buildTotals(chartPointsInMonth);
  const dailyTotals = buildTotals(dailyPoints);
  const weeklyTotals = buildTotals(weeklyPoints);
  const monthlyTotals = buildTotals(monthlyPoints);

  const transactionStats = buildTransactionStats(monthlyTransactions);
  const remainingMoney = income - expense;
  const expenseRatio = income > 0 ? (expense / income) * 100 : 0;
  const recommendedSaving = Math.max(Math.round(income * 0.2), 0);
  const savingGap = Math.max(recommendedSaving - remainingMoney, 0);

  return {
    generated_at: new Date().toISOString(),
    source,
    period: {
      reference_month: referenceMonth,
      start_date: period.startDate,
      end_date: period.endDate,
    },
    summary: {
      balance,
      income,
      expense,
      saving,
      remaining_money: remainingMoney,
      expense_ratio_percent: Number(expenseRatio.toFixed(2)),
    },
    chart: {
      points: chartPointsInMonth,
      total_points: chartPointsInMonth.length,
      total_income: chartTotals.totalIncome,
      total_expense: chartTotals.totalExpense,
      net_flow: chartTotals.netFlow,
      peak_income: chartPointsInMonth.reduce((acc, point) => Math.max(acc, point.income), 0),
      peak_expense: chartPointsInMonth.reduce((acc, point) => Math.max(acc, point.expense), 0),
    },
    transactions: transactionStats,
    insights: {
      recommended_saving: recommendedSaving,
      saving_gap: savingGap,
      saving_status: savingGap === 0 ? "good" : "warning",
    },
    daily: {
      points: dailyPoints,
      total_points: dailyPoints.length,
      total_income: dailyTotals.totalIncome,
      total_expense: dailyTotals.totalExpense,
      net_flow: dailyTotals.netFlow,
    },
    weekly: {
      points: weeklyPoints,
      total_points: weeklyPoints.length,
      total_income: weeklyTotals.totalIncome,
      total_expense: weeklyTotals.totalExpense,
      net_flow: weeklyTotals.netFlow,
    },
    monthly: {
      points: monthlyPoints,
      total_points: monthlyPoints.length,
      total_income: monthlyTotals.totalIncome,
      total_expense: monthlyTotals.totalExpense,
      net_flow: monthlyTotals.netFlow,
    },
  };
};

export const buildFinancialAIGenerateRequestPayload = (
  params: BuildFinancialPayloadParams
): FinancialAIGenerateRequestPayload => ({
  data_keuangan: buildFinancialPayload(params),
});

export default buildFinancialPayload;
