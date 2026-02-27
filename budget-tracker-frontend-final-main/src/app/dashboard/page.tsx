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
  fetchMonthlyChart,
  fetchMonthlySummary,
  fetchTodayTransaction,
} from "@/services/transaction";
import formatRupiah from "@/utils/formatRupiah";
import { ChartPoint, SummaryData, Transaction } from "@/interfaces/IDashboard";
import {
  buildFinancialAIGenerateRequestPayload,
  buildFinancialPayload,
} from "@/utils/buildFinancialPayload";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const FINANCIAL_PAYLOAD_STORAGE_KEY = "dashboard_financial_payload_v1";

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

export default function DashboardPage() {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [userName, setUserName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const token = localStorage.getItem("token") || "";

        const [chartRes, summaryRes, recentRes, profileResult] = await Promise.all([
          fetchMonthlyChart(),
          fetchMonthlySummary(),
          fetchTodayTransaction(),
          token ? profileSafe(token) : Promise.resolve({ data: null, error: null }),
        ]);

        setChartData(Array.isArray(chartRes?.data) ? chartRes.data : []);
        setSummary(summaryRes?.data || null);
        setRecentTransactions(Array.isArray(recentRes?.data) ? recentRes.data : []);
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
  }, []);

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
  const balance = toSafeNumber(summary?.balance);
  const remainingMoney = income - expense;
  const expenseRatio = income > 0 ? (expense / income) * 100 : 0;

  const averageRecentTransaction = useMemo(() => {
    if (recentTransactions.length === 0) return 0;
    const total = recentTransactions.reduce((acc, tx) => acc + parseAmount(tx.amount), 0);
    return total / recentTransactions.length;
  }, [recentTransactions]);

  const financialPayload = useMemo(
    () =>
      buildFinancialPayload({
        summary,
        chartData,
        transactions: recentTransactions,
        source: "dashboard_page",
      }),
    [summary, chartData, recentTransactions]
  );

  const chartOverview = useMemo(() => {
    return {
      totalIncome: financialPayload.chart.total_income,
      totalExpense: financialPayload.chart.total_expense,
      peakIncome: financialPayload.chart.peak_income,
      peakExpense: financialPayload.chart.peak_expense,
    };
  }, [financialPayload]);

  const financialAIPayload = useMemo(
    () =>
      buildFinancialAIGenerateRequestPayload({
        summary,
        chartData,
        transactions: recentTransactions,
        source: "dashboard_page",
      }),
    [summary, chartData, recentTransactions]
  );

  useEffect(() => {
    try {
      localStorage.setItem(FINANCIAL_PAYLOAD_STORAGE_KEY, JSON.stringify(financialAIPayload));
    } catch {
      // ignore localStorage write failure
    }
  }, [financialAIPayload]);

  return (
    <div className="space-y-6 p-3 md:p-6">
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
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Arus Uang Bulanan</h2>
              <p className="text-xs text-slate-500">Perbandingan uang masuk dan uang keluar per tanggal.</p>
            </div>
            <p className="text-xs text-slate-500">Saldo bulan ini: {formatRupiah(balance)}</p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Total Uang Masuk (Grafik)</p>
              <p className="text-sm font-semibold text-emerald-600">{formatRupiah(chartOverview.totalIncome)}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Total Uang Keluar (Grafik)</p>
              <p className="text-sm font-semibold text-rose-600">{formatRupiah(chartOverview.totalExpense)}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Puncak Uang Masuk</p>
              <p className="text-sm font-semibold text-indigo-600">{formatRupiah(chartOverview.peakIncome)}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
              <p className="text-[11px] text-slate-500">Puncak Uang Keluar</p>
              <p className="text-sm font-semibold text-sky-600">{formatRupiah(chartOverview.peakExpense)}</p>
            </div>
          </div>

          <div className="h-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="incomeStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                    <linearGradient id="expenseStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#e11d48" />
                      <stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="4 6" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(date) => {
                      const parsedDate = new Date(date);
                      if (Number.isNaN(parsedDate.getTime())) return String(date);
                      return `${parsedDate.getDate()}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  />
                  <Tooltip
                    cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)",
                    }}
                    formatter={(value) => formatRupiah(toSafeNumber(value))}
                    labelFormatter={(label) => {
                      const parsedDate = new Date(label);
                      if (Number.isNaN(parsedDate.getTime())) return String(label);
                      return parsedDate.toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="none"
                    fill="url(#incomeArea)"
                    isAnimationActive
                    animationDuration={700}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="none"
                    fill="url(#expenseArea)"
                    isAnimationActive
                    animationDuration={700}
                  />
                  <Line
                    type="monotoneX"
                    dataKey="income"
                    name="Uang Masuk"
                    stroke="url(#incomeStroke)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#065f46" }}
                    isAnimationActive
                    animationDuration={900}
                  />
                  <Line
                    type="monotoneX"
                    dataKey="expense"
                    name="Uang Keluar"
                    stroke="url(#expenseStroke)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#9f1239" }}
                    isAnimationActive
                    animationDuration={900}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                Belum ada data grafik untuk ditampilkan.
              </div>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Transaksi Terbaru</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
              {recentTransactions.length} transaksi
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
                Belum ada transaksi terbaru.
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">Rata-rata transaksi terbaru</p>
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
