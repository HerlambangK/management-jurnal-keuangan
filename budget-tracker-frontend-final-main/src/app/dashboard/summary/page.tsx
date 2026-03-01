"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaChartLine, FaClock, FaRegFileAlt, FaRegLightbulb, FaRobot, FaSync } from "react-icons/fa";
import {
    fetchAllMonthlySummaries,
    fetchMonthlySummaryForecast,
    generateMonthlySummary,
    normalizeGeneratedSummaryPayload,
    normalizeStoredSummaryRecordToLLMResponse,
} from "@/services/monthlySummary";
import Modal from "@/ui/Modal";
import { ModalProps } from "@/interfaces/IModal";
import { LLMResponse } from "@/interfaces/ILLM";
import { FinancialAIGenerateRequestPayload } from "@/interfaces/IFinancialPayload";
import { Transaction } from "@/interfaces/IDashboard";
import { MonthlySummaryForecast, SummaryItem } from "@/interfaces/ISummary";
import { fetchMonthlyChart, fetchMonthlySummary, fetchTransaction } from "@/services/transaction";
import { buildFinancialAIGenerateRequestPayload } from "@/utils/buildFinancialPayload";
import formatRupiah from "@/utils/formatRupiah";
import MonthPicker from "@/ui/MonthPicker";

const FINANCIAL_PAYLOAD_STORAGE_KEY = "dashboard_financial_payload_v1";

const getHtmlMarkup = (value: string) => ({ __html: value });

const getCurrentMonthKey = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const formatMonthLabel = (monthKey: string): string => {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return "periode ini";
    const parsed = new Date(`${monthKey}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "periode ini";
    return parsed.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
    });
}

const doesSummaryMatchMonth = (summary: SummaryItem, monthKey: string): boolean => {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return true;
    const parsed = new Date(`${monthKey}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return true;

    const expectedMonthLabel = parsed.toLocaleString("id-ID", { month: "long" }).toLowerCase();
    const expectedYear = String(parsed.getFullYear());
    const summaryMonth = String(summary.month || "").trim().toLowerCase();
    const summaryYear = String(summary.year || "").trim();

    return summaryMonth === expectedMonthLabel && summaryYear === expectedYear;
}

const toTimestamp = (value: unknown): number => {
    if (typeof value !== "string") return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

const pickLatestSummaryRecord = (records: SummaryItem[]): SummaryItem | null => {
    if (!Array.isArray(records) || records.length === 0) return null;
    return [...records].sort((a, b) => {
        const aTime = Math.max(toTimestamp(a.updated_at), toTimestamp(a.created_at));
        const bTime = Math.max(toTimestamp(b.updated_at), toTimestamp(b.created_at));
        return bTime - aTime;
    })[0] || null;
}

const isValidFinancialPayload = (value: unknown): value is FinancialAIGenerateRequestPayload => {
    if (typeof value !== "object" || value === null) return false;
    const parsed = value as FinancialAIGenerateRequestPayload;

    if (typeof parsed.data_keuangan !== "object" || parsed.data_keuangan === null) {
        return false;
    }

    const payload = parsed.data_keuangan as unknown as Record<string, unknown>;
    const period =
        typeof payload.period === "object" && payload.period !== null
            ? (payload.period as Record<string, unknown>)
            : null;

    return (
        typeof period?.reference_month === "string" &&
        typeof period?.start_date === "string" &&
        typeof period?.end_date === "string" &&
        typeof payload.summary === "object" &&
        payload.summary !== null &&
        typeof payload.transactions === "object" &&
        payload.transactions !== null &&
        typeof payload.daily === "object" &&
        payload.daily !== null &&
        typeof payload.weekly === "object" &&
        payload.weekly !== null &&
        typeof payload.monthly === "object" &&
        payload.monthly !== null
    );
}

export default function SummaryPage() {
    const [loading, setLoading] = useState<boolean>(false);
    const [forecastLoading, setForecastLoading] = useState<boolean>(true);
    const [response, setResponse] = useState<LLMResponse | null>(null);
    const [forecast, setForecast] = useState<MonthlySummaryForecast | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [errorModal, setErrorModal] = useState<ModalProps | null>(null);
    const [confirmModal, setConfirmModal] = useState<ModalProps | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());

    const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
    const selectedMonthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);

    const formattedSavedAt = useMemo(
        () =>
            lastSavedAt
                ? new Date(lastSavedAt).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                  })
                : null,
        [lastSavedAt]
    );

    const loadLatestSummaryFromBackend = useCallback(async () => {
        try {
            const result = await fetchAllMonthlySummaries();
            const items = Array.isArray(result?.data) ? (result.data as SummaryItem[]) : [];
            const filteredByMonth = items.filter((item) => doesSummaryMatchMonth(item, selectedMonth));
            const latest = pickLatestSummaryRecord(filteredByMonth);

            if (!latest) {
                setResponse(null);
                setLastSavedAt(null);
                return;
            }

            const normalized = normalizeStoredSummaryRecordToLLMResponse(latest);
            setResponse(normalized);
            setLastSavedAt(
                typeof latest.updated_at === "string"
                    ? latest.updated_at
                    : typeof latest.created_at === "string"
                    ? latest.created_at
                    : null
            );
        } catch {
            // Keep current UI state if backend fetch temporarily fails.
        }
    }, [selectedMonth]);

    const loadForecastFromBackend = useCallback(async () => {
        setForecastLoading(true);
        try {
            const result = await fetchMonthlySummaryForecast();
            if (result?.success && result.data) {
                setForecast(result.data as MonthlySummaryForecast);
            } else {
                setForecast(null);
            }
        } catch {
            setForecast(null);
        } finally {
            setForecastLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLatestSummaryFromBackend();
        void loadForecastFromBackend();
    }, [loadForecastFromBackend, loadLatestSummaryFromBackend]);

    const buildLiveFinancialPayload = async (): Promise<FinancialAIGenerateRequestPayload> => {
        const [summaryRes, chartRes] = await Promise.all([
            fetchMonthlySummary(selectedMonth),
            fetchMonthlyChart(selectedMonth),
        ]);

        const payloadPeriodMonth =
            typeof summaryRes?.data?.period_month === "string" && summaryRes.data.period_month
                ? summaryRes.data.period_month
                : selectedMonth;
        const transactionRes = await fetchTransaction(1, 5000, "", payloadPeriodMonth);
        const allTransactions: Transaction[] = Array.isArray(transactionRes?.data)
            ? (transactionRes.data as Transaction[])
            : [];

        const payload = buildFinancialAIGenerateRequestPayload({
            summary: summaryRes?.data || null,
            chartData: Array.isArray(chartRes?.data) ? chartRes.data : [],
            transactions: allTransactions,
            source: "summary_page_generate",
        });

        localStorage.setItem(`${FINANCIAL_PAYLOAD_STORAGE_KEY}_${payloadPeriodMonth}`, JSON.stringify(payload));
        return payload;
    }

    const getFinancialPayloadForGenerate = async (): Promise<FinancialAIGenerateRequestPayload> => {
        try {
            return await buildLiveFinancialPayload();
        } catch {
            const cached = localStorage.getItem(`${FINANCIAL_PAYLOAD_STORAGE_KEY}_${selectedMonth}`);
            if (cached) {
                const parsed: unknown = JSON.parse(cached);
                if (isValidFinancialPayload(parsed)) return parsed;
            }
            throw new Error("Gagal menyiapkan payload data_keuangan untuk bulan terpilih. Coba refresh lalu generate lagi.");
        }
    }

    const generateSummary = async () => {
        setLoading(true);
        try {
            const financialPayload = await getFinancialPayloadForGenerate();
            const result = await generateMonthlySummary(financialPayload, selectedMonth);

            if(result.success && result.data) {
                const generatedResponse = normalizeGeneratedSummaryPayload(result.data);
                setResponse(generatedResponse);
                await Promise.all([
                    loadLatestSummaryFromBackend(),
                    loadForecastFromBackend(),
                ]);
            } else {
                throw new Error(result.message || "Gagal menghasilkan Ringkasan")
            }
        } catch (error) {
            if(error instanceof Error) {
                setErrorModal({message: error.message, type: "danger"})
            } else {
                setErrorModal({message: "Terjadi Kesalahan", type: "danger"})
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGenerateClick = () => {
        if (loading) return;

        if (response) {
            setConfirmModal({
                type: "warning",
                title: "Generate Ulang Summary?",
                message: "Summary sebelumnya sudah ada. Data tersimpan akan ditimpa dengan hasil terbaru.",
                okText: "Ya, Generate Ulang",
                cancelText: "Batal",
                onCancel: () => setConfirmModal(null),
                onOk: async () => {
                    setConfirmModal(null);
                    await generateSummary();
                },
            });
            return;
        }

        void generateSummary();
    }

    const recommendations =
        response?.recommendations?.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0
        ) || [];

    return (
        <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 text-white shadow-lg">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
                <div className="absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-cyan-300/20 blur-2xl" />
                <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-7">
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">AI Financial Summary</h2>
                        <p className="max-w-2xl text-sm text-indigo-50 md:text-base">
                            Dapatkan ringkasan, rekomendasi, analisis tren, dan forecast finansial bulan berikutnya.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium text-indigo-100">Bulan analisis</span>
                            <MonthPicker
                                value={selectedMonth}
                                onChange={setSelectedMonth}
                                max={currentMonthKey}
                                theme="glass"
                            />
                            <span className="rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-[11px] text-indigo-50">
                                {selectedMonthLabel}
                            </span>
                        </div>
                        {formattedSavedAt && (
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs">
                                <FaClock className="h-3 w-3" />
                                Tersimpan terakhir: {formattedSavedAt}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerateClick}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-70 md:px-5"
                    >
                        {loading ? <FaSync className="h-4 w-4 animate-spin" /> : <FaRobot className="h-4 w-4" />}
                        {loading ? "Menganalisis..." : "Generate Summary"}
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sky-700">
                    <FaChartLine className="h-4 w-4" />
                    <h3 className="text-base font-semibold">Forecast Bulan Berikutnya</h3>
                </div>

                {forecastLoading ? (
                    <p className="text-sm text-slate-500">Sedang menghitung perkiraan bulan depan...</p>
                ) : forecast ? (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Prediksi untuk <strong>{forecast.nextMonthLabel}</strong> berdasarkan{" "}
                            <strong>{forecast.sampleSize}</strong> data summary bulanan
                            (keyakinan: <strong>{forecast.confidence}%</strong> - {forecast.confidenceLabel}).
                        </p>

                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                                <p className="text-xs text-slate-500">Prediksi Pemasukan</p>
                                <p className="mt-1 text-sm font-semibold text-emerald-700">
                                    {formatRupiah(forecast.predictedIncome)}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Range: {formatRupiah(forecast.incomeRange[0])} -{" "}
                                    {formatRupiah(forecast.incomeRange[1])}
                                </p>
                            </div>

                            <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
                                <p className="text-xs text-slate-500">Prediksi Pengeluaran</p>
                                <p className="mt-1 text-sm font-semibold text-rose-700">
                                    {formatRupiah(forecast.predictedExpense)}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Range: {formatRupiah(forecast.expenseRange[0])} -{" "}
                                    {formatRupiah(forecast.expenseRange[1])}
                                </p>
                            </div>

                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                                <p className="text-xs text-slate-500">Prediksi Saldo</p>
                                <p
                                    className={`mt-1 text-sm font-semibold ${
                                        forecast.predictedBalance >= 0
                                            ? "text-indigo-700"
                                            : "text-rose-700"
                                    }`}
                                >
                                    {formatRupiah(forecast.predictedBalance)}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Range: {formatRupiah(forecast.balanceRange[0])} -{" "}
                                    {formatRupiah(forecast.balanceRange[1])}
                                </p>
                            </div>
                        </div>

                        {forecast.insight && (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                {forecast.insight}
                            </p>
                        )}

                        {forecast.actionItems.length > 0 && (
                            <ul className="space-y-2">
                                {forecast.actionItems.map((item, idx) => (
                                    <li
                                        key={`${item}-${idx}`}
                                        className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-slate-700"
                                    >
                                        <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-semibold text-white">
                                            {idx + 1}
                                        </span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">
                        Data summary bulanan belum cukup untuk membuat forecast. Generate summary di beberapa bulan
                        berbeda terlebih dulu.
                    </p>
                )}
            </section>

            {response ? (
                <section className="grid gap-4 lg:grid-cols-12">
                    <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm lg:col-span-7">
                        <div className="mb-3 flex items-center gap-2 text-indigo-700">
                            <FaRegFileAlt className="h-4 w-4" />
                            <h3 className="text-base font-semibold">Ringkasan</h3>
                        </div>
                        <div
                            className="text-sm leading-7 text-slate-700 [&_a]:text-indigo-600 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold"
                            dangerouslySetInnerHTML={getHtmlMarkup(response.summary)}
                        />
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm lg:col-span-5">
                        <div className="mb-3 flex items-center gap-2 text-emerald-700">
                            <FaRegLightbulb className="h-4 w-4" />
                            <h3 className="text-base font-semibold">Rekomendasi</h3>
                        </div>
                        {recommendations.length > 0 ? (
                            <ul className="space-y-2">
                                {recommendations.map((rec, idx) => (
                                    <li
                                        key={`${rec}-${idx}`}
                                        className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-slate-700"
                                    >
                                        <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
                                            {idx + 1}
                                        </span>
                                        <span
                                            className="[&_a]:text-emerald-700 [&_a]:underline [&_strong]:font-semibold"
                                            dangerouslySetInnerHTML={getHtmlMarkup(rec)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-slate-500">Belum ada rekomendasi.</p>
                        )}
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm lg:col-span-12">
                        <div className="mb-3 flex items-center gap-2 text-amber-700">
                            <FaChartLine className="h-4 w-4" />
                            <h3 className="text-base font-semibold">Analisis Tren</h3>
                        </div>
                        <div
                            className="text-sm leading-7 text-slate-700 [&_a]:text-amber-700 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold"
                            dangerouslySetInnerHTML={getHtmlMarkup(response.trend_analysis)}
                        />
                        <p className="mt-4 text-xs text-slate-400">Dianalisis otomatis berdasarkan data keuangan kamu.</p>
                    </div>
                </section>
            ) : (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        <FaRobot className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-600">
                        Klik tombol <b>&quot;Generate Summary&quot;</b> untuk menganalisis bulan {selectedMonthLabel}.
                    </p>
                </div>
            )}

            {errorModal && (
                <Modal
                    type="danger"
                    title="Gagal Memproses"
                    message={errorModal.message}
                    okText="Tutup"
                    onOk={() => setErrorModal(null)}
                />
            )}

            {confirmModal && (
                <Modal
                    type={confirmModal.type}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    okText={confirmModal.okText}
                    cancelText={confirmModal.cancelText}
                    onOk={confirmModal.onOk}
                    onCancel={confirmModal.onCancel}
                />
            )}
        </div>
    );
}
