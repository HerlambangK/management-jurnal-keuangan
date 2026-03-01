"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaArrowDown,
  FaArrowUp,
  FaChartLine,
  FaPiggyBank,
  FaReceipt,
  FaWallet,
} from "react-icons/fa";
import { logout, profileSafe } from "@/services/auth";
import {
  fetchTransaction,
  fetchMonthlyChart,
  fetchMonthlySummary,
} from "@/services/transaction";
import formatRupiah from "@/utils/formatRupiah";
import { ChartPoint, SummaryData, Transaction } from "@/interfaces/IDashboard";
import {
  buildFinancialAIGenerateRequestPayload,
  buildFinancialPayload,
} from "@/utils/buildFinancialPayload";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MonthPicker from "@/ui/MonthPicker";

const FINANCIAL_PAYLOAD_STORAGE_KEY = "dashboard_financial_payload_v1";

const getCurrentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const parseAmount = (amount: string | number): number => {
  if (typeof amount === "number") return amount;

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
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = `${parts[0].replace(/,/g, "")}.${parts[1]}`;
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    const dotParts = cleaned.split(".");
    if (dotParts.length > 2) {
      cleaned = dotParts.join("");
    }
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseAmount(value);
  return 0;
};

type CashFlowChartPoint = ChartPoint & {
  dayLabel: string;
  dateLabel: string;
  netFlow: number;
  dominantFlow: "income" | "expense" | "balanced";
};

type BrushRange = {
  startIndex: number;
  endIndex: number;
};

const toDayLabel = (value: string): string => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return `${parsedDate.getDate()}`;
};

const toFullDateLabel = (value: string): string => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return parsedDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatCompactAxis = (value: number): string => {
  const abs = Math.abs(value);
  if (abs === 0) return "0";

  const sign = value < 0 ? "-" : "";
  const compact = (divider: number, suffix: string) => {
    const scaled = abs / divider;
    const text = (scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(/\.0$/, "");
    return `${sign}${text}${suffix}`;
  };

  if (abs >= 1_000_000_000) return compact(1_000_000_000, "M");
  if (abs >= 1_000_000) return compact(1_000_000, "jt");
  if (abs >= 1_000) return compact(1_000, "rb");
  return `${sign}${Math.round(abs)}`;
};

const formatPeriodMonthLabel = (periodMonth?: string): string => {
  if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) return "Periode saat ini";
  const parsedDate = new Date(`${periodMonth}-01T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Periode saat ini";

  return parsedDate.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
};

const CashFlowTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CashFlowChartPoint }>;
}) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const dominantLabel =
    point.dominantFlow === "income"
      ? { label: "Hari ini didominasi uang masuk", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : point.dominantFlow === "expense"
        ? { label: "Hari ini didominasi uang keluar", className: "border-orange-200 bg-orange-50 text-orange-700" }
        : { label: "Hari ini seimbang", className: "border-slate-200 bg-slate-50 text-slate-700" };

  return (
    <div className="min-w-[230px] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{point.dateLabel}</p>

      <div className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
            Uang Masuk
          </span>
          <span className="font-semibold text-emerald-700">{formatRupiah(point.income)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.16)]" />
            Uang Keluar
          </span>
          <span className="font-semibold text-orange-700">{formatRupiah(point.expense)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <span className="text-[11px] text-slate-500">Arus Bersih</span>
        <span className={`text-xs font-semibold ${point.netFlow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {point.netFlow >= 0 ? "+ " : "- "}
          {formatRupiah(Math.abs(point.netFlow))}
        </span>
      </div>

      <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${dominantLabel.className}`}>
        {dominantLabel.label}
      </span>
    </div>
  );
};

const MIN_VISIBLE_POINTS = 4;
const DEFAULT_VISIBLE_POINTS = 14;

const clampBrushRange = (range: BrushRange, totalPoints: number): BrushRange => {
  if (totalPoints <= 0) return { startIndex: 0, endIndex: 0 };

  const rawStart = Number.isFinite(range.startIndex) ? Math.round(range.startIndex) : 0;
  const rawEnd = Number.isFinite(range.endIndex) ? Math.round(range.endIndex) : totalPoints - 1;
  const minIndex = 0;
  const maxIndex = totalPoints - 1;

  const start = Math.min(Math.max(rawStart, minIndex), maxIndex);
  const end = Math.min(Math.max(rawEnd, start), maxIndex);

  return { startIndex: start, endIndex: end };
};

export default function DashboardPage() {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [monthlyTransactions, setMonthlyTransactions] = useState<Transaction[]>([]);
  const [userName, setUserName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<BrushRange>({ startIndex: 0, endIndex: 0 });
  const [selectedMonth, setSelectedMonth] = useState("");

  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const recentTransactions = useMemo(
    () => monthlyTransactions.slice(0, 5),
    [monthlyTransactions]
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const token = localStorage.getItem("token") || "";

        const [chartRes, summaryRes, profileResult] = await Promise.all([
          fetchMonthlyChart(selectedMonth),
          fetchMonthlySummary(selectedMonth),
          token ? profileSafe(token) : Promise.resolve({ data: null, error: null }),
        ]);

        const summaryData = summaryRes?.data || null;
        const fallbackMonth = typeof summaryData?.period_month === "string" ? summaryData.period_month : "";
        const monthForTransactions = selectedMonth || fallbackMonth;
        const monthlyTransactionsRes = await fetchTransaction(1, 5000, "", monthForTransactions);

        setChartData(Array.isArray(chartRes?.data) ? chartRes.data : []);
        setSummary(summaryData);
        setMonthlyTransactions(Array.isArray(monthlyTransactionsRes?.data) ? monthlyTransactionsRes.data : []);
        setUserName(profileResult?.data?.data?.name || "User");

        if (profileResult?.error?.isUnauthorized) {
          logout();
          window.location.href = "/";
          return;
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("Terjadi kesalahan saat memuat dashboard.");
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [selectedMonth]);

  const dateNow = useMemo(
    () =>
      new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const income = toSafeNumber(summary?.income);
  const expense = toSafeNumber(summary?.expense);
  const saving = toSafeNumber(summary?.saving);
  const remainingMoney = income - expense;
  const expenseRatio = income > 0 ? (expense / income) * 100 : 0;

  const averageRecentTransaction = useMemo(() => {
    if (monthlyTransactions.length === 0) return 0;
    const total = monthlyTransactions.reduce((acc, tx) => acc + parseAmount(tx.amount), 0);
    return total / monthlyTransactions.length;
  }, [monthlyTransactions]);

  const financialPayload = useMemo(
    () =>
      buildFinancialPayload({
        summary,
        chartData,
        transactions: monthlyTransactions,
        source: "dashboard_page",
      }),
    [summary, chartData, monthlyTransactions]
  );

  const chartOverview = useMemo(() => {
    return {
      totalIncome: financialPayload.chart.total_income,
      totalExpense: financialPayload.chart.total_expense,
      peakIncome: financialPayload.chart.peak_income,
      peakExpense: financialPayload.chart.peak_expense,
    };
  }, [financialPayload]);

  const cashflowChartData = useMemo<CashFlowChartPoint[]>(() => {
    return [...chartData]
      .map((item) => {
        const incomeValue = toSafeNumber(item.income);
        const expenseValue = toSafeNumber(item.expense);
        const netFlow = incomeValue - expenseValue;
        const dominantFlow: CashFlowChartPoint["dominantFlow"] =
          netFlow === 0 ? "balanced" : netFlow > 0 ? "income" : "expense";

        return {
          ...item,
          dayLabel: toDayLabel(item.date),
          dateLabel: toFullDateLabel(item.date),
          netFlow,
          dominantFlow,
          income: incomeValue,
          expense: expenseValue,
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (Number.isNaN(dateA) || Number.isNaN(dateB)) return 0;
        return dateA - dateB;
      });
  }, [chartData]);

  const chartAxisLimit = useMemo(() => {
    const maxValue = cashflowChartData.reduce((highest, item) => {
      return Math.max(highest, item.income, item.expense);
    }, 0);

    if (maxValue <= 0) return 100_000;

    const paddedValue = maxValue * 1.2;
    const roundingBase =
      maxValue >= 10_000_000 ? 1_000_000 : maxValue >= 1_000_000 ? 100_000 : maxValue >= 100_000 ? 10_000 : 1_000;

    return Math.ceil(paddedValue / roundingBase) * roundingBase;
  }, [cashflowChartData]);

  const dominantFlowLabel = useMemo(() => {
    if (chartOverview.totalIncome === chartOverview.totalExpense) return "Arus cenderung seimbang";
    return chartOverview.totalIncome > chartOverview.totalExpense ? "Arus masuk lebih dominan" : "Arus keluar lebih dominan";
  }, [chartOverview.totalExpense, chartOverview.totalIncome]);

  const summaryPeriodLabel = useMemo(
    () => formatPeriodMonthLabel(summary?.period_month),
    [summary?.period_month]
  );

  const totalChartPoints = cashflowChartData.length;

  useEffect(() => {
    if (totalChartPoints <= 0) {
      setChartRange({ startIndex: 0, endIndex: 0 });
      return;
    }

    const visiblePoints = Math.min(DEFAULT_VISIBLE_POINTS, totalChartPoints);
    const startIndex = Math.max(0, totalChartPoints - visiblePoints);
    const endIndex = totalChartPoints - 1;
    setChartRange({ startIndex, endIndex });
  }, [totalChartPoints]);

  const normalizedRange = useMemo(
    () => clampBrushRange(chartRange, totalChartPoints),
    [chartRange, totalChartPoints]
  );

  const visiblePointsCount =
    totalChartPoints > 0 ? normalizedRange.endIndex - normalizedRange.startIndex + 1 : 0;

  const chartRangeData = useMemo(() => {
    if (totalChartPoints === 0 || visiblePointsCount <= 0) return [];
    return cashflowChartData.slice(normalizedRange.startIndex, normalizedRange.endIndex + 1);
  }, [cashflowChartData, normalizedRange.endIndex, normalizedRange.startIndex, totalChartPoints, visiblePointsCount]);

  const rangeSummary = useMemo(() => {
    if (chartRangeData.length === 0) {
      return {
        income: 0,
        expense: 0,
        netFlow: 0,
        ratio: 0,
      };
    }

    const incomeTotal = chartRangeData.reduce((sum, point) => sum + point.income, 0);
    const expenseTotal = chartRangeData.reduce((sum, point) => sum + point.expense, 0);
    const netFlow = incomeTotal - expenseTotal;
    const ratio = incomeTotal > 0 ? (expenseTotal / incomeTotal) * 100 : 0;

    return {
      income: incomeTotal,
      expense: expenseTotal,
      netFlow,
      ratio,
    };
  }, [chartRangeData]);

  const chartRangeLabel = useMemo(() => {
    if (chartRangeData.length === 0) return "-";
    const first = chartRangeData[0];
    const last = chartRangeData[chartRangeData.length - 1];
    return `${first.dateLabel} - ${last.dateLabel}`;
  }, [chartRangeData]);

  const canZoomIn = visiblePointsCount > MIN_VISIBLE_POINTS;
  const canZoomOut = visiblePointsCount > 0 && visiblePointsCount < totalChartPoints;
  const panStep = Math.max(1, Math.round(visiblePointsCount * 0.3));
  const canPanLeft = normalizedRange.startIndex > 0;
  const canPanRight = normalizedRange.endIndex < totalChartPoints - 1;

  const moveRange = (nextStart: number, windowSize: number) => {
    if (totalChartPoints <= 0) return;
    const size = Math.max(1, Math.min(windowSize, totalChartPoints));
    let start = Math.max(0, nextStart);
    let end = start + size - 1;

    if (end > totalChartPoints - 1) {
      end = totalChartPoints - 1;
      start = Math.max(0, end - size + 1);
    }

    setChartRange({ startIndex: start, endIndex: end });
  };

  const applyWindowSize = (nextWindowSize: number) => {
    if (totalChartPoints <= 0 || visiblePointsCount <= 0) return;
    const clampedWindow = Math.max(MIN_VISIBLE_POINTS, Math.min(nextWindowSize, totalChartPoints));
    const center = (normalizedRange.startIndex + normalizedRange.endIndex) / 2;
    const nextStart = Math.round(center - (clampedWindow - 1) / 2);
    moveRange(nextStart, clampedWindow);
  };

  const zoomIn = () => {
    if (!canZoomIn) return;
    applyWindowSize(Math.floor(visiblePointsCount * 0.78));
  };

  const zoomOut = () => {
    if (!canZoomOut) return;
    applyWindowSize(Math.ceil(visiblePointsCount * 1.28));
  };

  const panLeft = () => {
    if (!canPanLeft || visiblePointsCount <= 0) return;
    moveRange(normalizedRange.startIndex - panStep, visiblePointsCount);
  };

  const panRight = () => {
    if (!canPanRight || visiblePointsCount <= 0) return;
    moveRange(normalizedRange.startIndex + panStep, visiblePointsCount);
  };

  const resetChartView = () => {
    if (totalChartPoints <= 0) return;
    const visible = Math.min(DEFAULT_VISIBLE_POINTS, totalChartPoints);
    moveRange(totalChartPoints - visible, visible);
  };

  const applyRangePreset = (value: string) => {
    if (totalChartPoints <= 0) return;
    if (value === "all") {
      moveRange(0, totalChartPoints);
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const visible = Math.min(parsed, totalChartPoints);
    moveRange(totalChartPoints - visible, visible);
  };

  const activeRangePreset = useMemo(() => {
    if (visiblePointsCount >= totalChartPoints && totalChartPoints > 0) return "all";
    if ([7, 14, 30, 60, 90].includes(visiblePointsCount)) return String(visiblePointsCount);
    return "custom";
  }, [totalChartPoints, visiblePointsCount]);

  const handleBrushChange = (next: { startIndex?: number; endIndex?: number }) => {
    if (totalChartPoints <= 0) return;
    const hasStart = typeof next.startIndex === "number";
    const hasEnd = typeof next.endIndex === "number";
    if (!hasStart || !hasEnd) return;

    const clamped = clampBrushRange(
      { startIndex: next.startIndex as number, endIndex: next.endIndex as number },
      totalChartPoints
    );
    setChartRange(clamped);
  };

  const handleChartWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (totalChartPoints <= 0) return;
    event.preventDefault();

    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  const financialAIPayload = useMemo(
    () =>
      buildFinancialAIGenerateRequestPayload({
        summary,
        chartData,
        transactions: monthlyTransactions,
        source: "dashboard_page",
      }),
    [summary, chartData, monthlyTransactions]
  );

  useEffect(() => {
    try {
      localStorage.setItem(FINANCIAL_PAYLOAD_STORAGE_KEY, JSON.stringify(financialAIPayload));
    } catch {
      // ignore localStorage write failure
    }
  }, [financialAIPayload]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-500 p-5 text-white shadow-lg md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-indigo-100">Dashboard Keuangan</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Halo, {userName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-indigo-50 md:text-base">
              Pantau kondisi keuangan harian kamu dari satu halaman yang ringkas dan mudah dipahami.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-indigo-100 md:text-sm">{dateNow}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-indigo-100">Filter bulan</span>
              <MonthPicker
                value={selectedMonth}
                onChange={setSelectedMonth}
                max={currentMonthKey}
                allowEmpty
                emptyLabel="Otomatis"
                theme="glass"
              />
            </div>
            <p className="text-[11px] text-indigo-100/90">
              {selectedMonth
                ? `Menampilkan data ${formatPeriodMonthLabel(selectedMonth)}`
                : "Mode otomatis: pakai bulan aktif, atau bulan terakhir yang punya transaksi."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/transaction"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 md:text-sm"
              >
                <FaReceipt className="h-3.5 w-3.5" />
                Lihat Transaksi
              </Link>
              <Link
                href="/dashboard/summary"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25 md:text-sm"
              >
                <FaChartLine className="h-3.5 w-3.5" />
                AI Summary
              </Link>
            </div>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Sisa Uang</p>
            <FaWallet className="h-4 w-4 text-indigo-600" />
          </div>
          <p className={`mt-2 text-xl font-bold ${remainingMoney >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
            {loading ? "..." : formatRupiah(remainingMoney)}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Uang Masuk</p>
            <FaArrowUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-600">{loading ? "..." : formatRupiah(income)}</p>
        </article>

        <article className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Uang Keluar</p>
            <FaArrowDown className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-rose-600">{loading ? "..." : formatRupiah(expense)}</p>
        </article>

        <article className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Tabungan</p>
            <FaPiggyBank className="h-4 w-4 text-cyan-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-cyan-600">{loading ? "..." : formatRupiah(saving)}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Rasio Pengeluaran</p>
            <FaChartLine className="h-4 w-4 text-slate-600" />
          </div>
          <p
            className={`mt-2 text-xl font-bold ${
              expenseRatio <= 70 ? "text-emerald-600" : expenseRatio <= 90 ? "text-amber-600" : "text-rose-600"
            }`}
          >
            {loading ? "..." : `${expenseRatio.toFixed(1)}%`}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 xl:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Arus Uang Harian</h2>
              <p className="text-xs text-slate-500">Dua kurva halus untuk melihat ritme pemasukan dan pengeluaran dengan cepat.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                  Uang Masuk
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.16)]" />
                  Uang Keluar
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <p className="text-xs text-slate-500">Periode data: {summaryPeriodLabel}</p>
              <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
                {dominantFlowLabel}
              </span>
              {summary?.is_fallback ? (
                <p className="text-[11px] text-amber-600">Bulan ini belum ada transaksi, data memakai bulan terakhir yang tersedia.</p>
              ) : null}
            </div>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Total Uang Masuk (Grafik)</p>
              <p className="text-sm font-semibold text-emerald-600">{formatRupiah(chartOverview.totalIncome)}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Total Uang Keluar (Grafik)</p>
              <p className="text-sm font-semibold text-orange-600">{formatRupiah(chartOverview.totalExpense)}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Puncak Uang Masuk</p>
              <p className="text-sm font-semibold text-indigo-600">{formatRupiah(chartOverview.peakIncome)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Puncak Uang Keluar</p>
              <p className="text-sm font-semibold text-amber-600">{formatRupiah(chartOverview.peakExpense)}</p>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  value={activeRangePreset}
                  onChange={(event) => applyRangePreset(event.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  aria-label="Pilih rentang grafik"
                >
                  {totalChartPoints >= 7 && <option value="7">7 hari terakhir</option>}
                  {totalChartPoints >= 14 && <option value="14">14 hari terakhir</option>}
                  {totalChartPoints >= 30 && <option value="30">30 hari terakhir</option>}
                  {totalChartPoints >= 60 && <option value="60">60 hari terakhir</option>}
                  {totalChartPoints >= 90 && <option value="90">90 hari terakhir</option>}
                  <option value="all">Semua data</option>
                  <option value="custom" disabled>
                    Rentang kustom
                  </option>
                </select>
              </div>

              <button
                type="button"
                onClick={panLeft}
                disabled={!canPanLeft}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                title="Geser ke kiri"
                aria-label="Geser chart ke kiri"
              >
                {"<"}
              </button>
              <button
                type="button"
                onClick={panRight}
                disabled={!canPanRight}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                title="Geser ke kanan"
                aria-label="Geser chart ke kanan"
              >
                {">"}
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={!canZoomIn}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                title="Zoom in"
              >
                Zoom in
              </button>
              <button
                type="button"
                onClick={zoomOut}
                disabled={!canZoomOut}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                title="Zoom out"
              >
                Zoom out
              </button>
              <button
                type="button"
                onClick={resetChartView}
                className="inline-flex h-9 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                title="Reset tampilan chart"
              >
                Reset
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium text-slate-500">Periode aktif</p>
              <p className="text-xs font-semibold text-slate-700">
                {chartRangeLabel} ({visiblePointsCount} titik)
              </p>
            </div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Masuk (periode aktif)</p>
              <p className="text-sm font-semibold text-emerald-700">{formatRupiah(rangeSummary.income)}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Keluar (periode aktif)</p>
              <p className="text-sm font-semibold text-orange-700">{formatRupiah(rangeSummary.expense)}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Arus Bersih (periode aktif)</p>
              <p className={`text-sm font-semibold ${rangeSummary.netFlow >= 0 ? "text-indigo-700" : "text-orange-700"}`}>
                {rangeSummary.netFlow >= 0 ? "+ " : "- "}
                {formatRupiah(Math.abs(rangeSummary.netFlow))}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Rasio Keluar/Masuk (aktif)</p>
              <p
                className={`text-sm font-semibold ${
                  rangeSummary.ratio <= 70 ? "text-emerald-700" : rangeSummary.ratio <= 90 ? "text-amber-700" : "text-orange-700"
                }`}
              >
                {rangeSummary.ratio.toFixed(1)}%
              </p>
            </div>
          </div>

          <div
            className="relative h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3"
            onWheel={handleChartWheel}
          >
            <div className="pointer-events-none absolute -left-20 top-10 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 bottom-8 h-44 w-44 rounded-full bg-orange-200/35 blur-3xl" />

            {cashflowChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashflowChartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeAreaModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="expenseAreaModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="incomeStrokeModern" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                    <linearGradient id="expenseStrokeModern" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ea580c" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="4 6" stroke="#dbe5f1" vertical={false} />

                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={8}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                    domain={[0, chartAxisLimit]}
                    tickFormatter={(value) => formatCompactAxis(toSafeNumber(value))}
                  />
                  <Tooltip
                    cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                    content={<CashFlowTooltip />}
                  />

                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="none"
                    fill="url(#incomeAreaModern)"
                    isAnimationActive
                    animationDuration={700}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="none"
                    fill="url(#expenseAreaModern)"
                    isAnimationActive
                    animationDuration={700}
                  />
                  <Line
                    type="monotoneX"
                    dataKey="income"
                    name="Uang Masuk"
                    stroke="url(#incomeStrokeModern)"
                    strokeWidth={2.7}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: "#10b981" }}
                    isAnimationActive
                    animationDuration={900}
                  />
                  <Line
                    type="monotoneX"
                    dataKey="expense"
                    name="Uang Keluar"
                    stroke="url(#expenseStrokeModern)"
                    strokeWidth={2.7}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: "#f97316" }}
                    isAnimationActive
                    animationDuration={900}
                  />
                  <Brush
                    dataKey="dayLabel"
                    height={24}
                    stroke="#94a3b8"
                    fill="#f8fafc"
                    travellerWidth={10}
                    startIndex={normalizedRange.startIndex}
                    endIndex={normalizedRange.endIndex}
                    onChange={handleBrushChange}
                    tickFormatter={(value) => String(value)}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                Belum ada data grafik untuk ditampilkan.
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Arus bersih periode data:{" "}
            <span className={chartOverview.totalIncome - chartOverview.totalExpense >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-orange-700"}>
              {chartOverview.totalIncome - chartOverview.totalExpense >= 0 ? "+ " : "- "}
              {formatRupiah(Math.abs(chartOverview.totalIncome - chartOverview.totalExpense))}
            </span>
          </p>
          <p className="text-[11px] text-slate-500">Tips: gunakan scroll mouse/touchpad untuk zoom, dan drag mini-slider di bawah chart untuk navigasi detail.</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Transaksi Bulan Terpilih</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
              {monthlyTransactions.length} transaksi
            </span>
          </div>

          <div className="space-y-2">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx) => {
                const isExpense = tx.type === "expense";
                return (
                  <div key={tx.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{tx.category?.name || "-"}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(tx.date).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <p className={`text-sm font-bold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
                        {isExpense ? "- " : "+ "}
                        {formatRupiah(tx.amount)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
                Belum ada transaksi pada bulan ini.
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">Rata-rata transaksi bulan ini</p>
            <p className="mt-1 text-lg font-bold text-slate-700">{formatRupiah(averageRecentTransaction)}</p>
          </div>

          <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
            <p className="text-[11px] text-slate-500">Payload Keuangan</p>
            <p className="mt-1 text-xs text-slate-700">
              {financialPayload.transactions.total_count} transaksi, {financialPayload.chart.total_points} titik chart,
              update terakhir {new Date(financialPayload.generated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
