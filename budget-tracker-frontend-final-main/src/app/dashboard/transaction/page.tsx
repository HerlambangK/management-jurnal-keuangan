"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaChartLine,
  FaEdit,
  FaPlus,
  FaReceipt,
  FaSearch,
  FaSortDown,
  FaSortUp,
  FaTrash,
  FaWallet,
} from "react-icons/fa";
import { AiOutlineClose } from "react-icons/ai";
import { FinancialOverviewData, Transaction } from "@/interfaces/IDashboard";
import { ModalProps } from "@/interfaces/IModal";
import { TransactionFormData } from "@/interfaces/ITransaction";
import {
  createTransaction,
  deleteTransaction,
  editTransaction,
  fetchFinancialOverview,
  fetchTransaction,
  fetchTransactionById,
} from "@/services/transaction";
import formatRupiah from "@/utils/formatRupiah";
import Modal from "@/ui/Modal";
import MonthPicker from "@/ui/MonthPicker";
import TransactionForm from "@/pages/TransactionForm";

type SortField = "date" | "amount" | "category" | "type";
type SortDirection = "asc" | "desc";
type TypeFilter = "all" | "income" | "expense";
type TransactionFormMode = "create" | "edit";

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

const getCurrentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonthLabel = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "periode ini";
  const parsedDate = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "periode ini";

  return parsedDate.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
};

const formatShortMonthLabel = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const parsedDate = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return monthKey;

  return parsedDate.toLocaleDateString("id-ID", {
    month: "short",
  });
};

const formatCompactCurrency = (value: number): string => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}M`;
  if (absolute >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)}jt`;
  if (absolute >= 1_000) return `Rp ${(value / 1_000).toFixed(0)}rb`;
  return `Rp ${Math.round(value)}`;
};

export default function TransactionPage() {
  const [search, setSearch] = useState("");
  const [transaction, setTransaction] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [financialOverview, setFinancialOverview] = useState<FinancialOverviewData | null>(null);
  const [modal, setModal] = useState<ModalProps | null>(null);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [formMode, setFormMode] = useState<TransactionFormMode | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [formInitialData, setFormInitialData] = useState<TransactionFormData | undefined>(undefined);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const selectedMonthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);

  const loadTransaction = useCallback(async () => {
    setIsLoadingTable(true);
    try {
      const res = await fetchTransaction(page, limit, search, selectedMonth);
      setTransaction(res?.data || []);
      setTotalPages(Math.max(res?.pagination?.totalPage || res?.pagination?.totalPages || 1, 1));
    } catch (error) {
      if (error instanceof Error) {
        console.error({ message: error.message, type: "danger" });
      } else {
        console.error({ message: "Terjadi Kesalahan", type: "danger" });
      }
    } finally {
      setIsLoadingTable(false);
    }
  }, [page, limit, search, selectedMonth]);

  const loadFinancialOverview = useCallback(async () => {
    try {
      const res = await fetchFinancialOverview(selectedMonth);
      setFinancialOverview(res?.data || null);
    } catch (error) {
      if (error instanceof Error) {
        console.error({ message: error.message, type: "danger" });
      } else {
        console.error({ message: "Terjadi Kesalahan", type: "danger" });
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    void loadTransaction();
  }, [loadTransaction]);

  useEffect(() => {
    void loadFinancialOverview();
  }, [loadFinancialOverview]);

  useEffect(() => {
    if (!formMode) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [formMode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const closeFormPopup = (force = false) => {
    if (isFormSubmitting && !force) return;
    setFormMode(null);
    setSelectedTxId(null);
    setFormInitialData(undefined);
    setIsFormLoading(false);
  };

  const openCreatePopup = () => {
    setFormMode("create");
    setSelectedTxId(null);
    setFormInitialData(undefined);
    setIsFormLoading(false);
  };

  const openEditPopup = async (id: number) => {
    setFormMode("edit");
    setSelectedTxId(id);
    setFormInitialData(undefined);
    setIsFormLoading(true);

    try {
      const res = await fetchTransactionById(id);
      const tx = res?.data;
      if (!tx) throw new Error("Data transaksi tidak ditemukan.");

      setFormInitialData({
        type: tx.type,
        amount: String(tx.amount),
        date: String(tx.date).slice(0, 10),
        note: tx.note || "",
        categoryId: tx.category_id,
      });
    } catch (error) {
      closeFormPopup(true);
      if (error instanceof Error) {
        setModal({ type: "danger", title: "Gagal", message: error.message, okText: "Tutup", onOk: () => setModal(null) });
      } else {
        setModal({
          type: "danger",
          title: "Gagal",
          message: "Gagal memuat detail transaksi.",
          okText: "Tutup",
          onOk: () => setModal(null),
        });
      }
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleFormSubmit = async (form: TransactionFormData) => {
    setIsFormSubmitting(true);
    try {
      if (formMode === "edit" && selectedTxId) {
        await editTransaction(selectedTxId, {
          ...form,
          category_id: form.categoryId,
        });
        setModal({
          type: "success",
          title: "Berhasil",
          message: "Transaksi berhasil diperbarui.",
          okText: "Oke",
          onOk: () => setModal(null),
        });
      } else {
        await createTransaction({
          ...form,
          category_id: form.categoryId,
        });
        setModal({
          type: "success",
          title: "Berhasil",
          message: "Transaksi berhasil ditambahkan.",
          okText: "Oke",
          onOk: () => setModal(null),
        });
      }

      closeFormPopup(true);
      await loadTransaction();
      await loadFinancialOverview();
    } catch (error) {
      if (error instanceof Error) {
        setModal({ type: "danger", title: "Gagal", message: error.message, okText: "Tutup", onOk: () => setModal(null) });
      } else {
        setModal({
          type: "danger",
          title: "Gagal",
          message: "Transaksi gagal disimpan.",
          okText: "Tutup",
          onOk: () => setModal(null),
        });
      }
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setModal({
      type: "danger",
      title: "Hapus Transaksi?",
      message: "Apakah kamu yakin ingin menghapus transaksi ini? Tindakan ini tidak bisa dibatalkan.",
      okText: "Ya, Hapus",
      cancelText: "Batal",
      onOk: async () => {
        try {
          await deleteTransaction(id);
          setModal({
            type: "success",
            title: "Berhasil",
            message: "Transaksi berhasil dihapus.",
            okText: "Oke",
            onOk: () => setModal(null),
          });
          await loadTransaction();
          await loadFinancialOverview();
        } catch (error) {
          console.error(error);
          setModal({
            type: "danger",
            title: "Gagal",
            message: "Gagal menghapus transaksi.",
            okText: "Tutup",
            onOk: () => setModal(null),
          });
        }
      },
      onCancel: () => setModal(null),
    });
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDirection("desc");
  };

  const sortedTransactions = useMemo(() => {
    const items = [...transaction];

    items.sort((a, b) => {
      let value = 0;

      if (sortBy === "date") {
        value = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === "amount") {
        value = parseAmount(a.amount) - parseAmount(b.amount);
      } else if (sortBy === "category") {
        value = a.category.name.localeCompare(b.category.name, "id", {
          sensitivity: "base",
        });
      } else {
        value = a.type.localeCompare(b.type, "id", {
          sensitivity: "base",
        });
      }

      return sortDirection === "asc" ? value : -value;
    });

    return items;
  }, [transaction, sortBy, sortDirection]);

  const filteredTransactions = useMemo(() => {
    if (typeFilter === "all") return sortedTransactions;
    return sortedTransactions.filter((tx) => tx.type === typeFilter);
  }, [sortedTransactions, typeFilter]);

  const overview = useMemo(
    () =>
      transaction.reduce(
        (acc, tx) => {
          const amount = parseAmount(tx.amount);
          acc.totalCount += 1;

          if (tx.type === "income") {
            acc.incomeAmount += amount;
            acc.incomeCount += 1;
          } else {
            acc.expenseAmount += amount;
            acc.expenseCount += 1;
          }
          return acc;
        },
        {
          incomeAmount: 0,
          expenseAmount: 0,
          totalCount: 0,
          incomeCount: 0,
          expenseCount: 0,
        }
      ),
    [transaction]
  );

  const monthlyIncome = useMemo(() => Number(financialOverview?.monthly_income || 0), [financialOverview]);
  const accumulatedBalance = useMemo(() => Number(financialOverview?.closing_balance || 0), [financialOverview]);
  const monthlyNetBalance = useMemo(() => Number(financialOverview?.monthly_balance || 0), [financialOverview]);
  const openingBalance = useMemo(() => Number(financialOverview?.opening_balance || 0), [financialOverview]);

  const incomeTrend = useMemo(
    () =>
      Array.isArray(financialOverview?.income_trend)
        ? financialOverview.income_trend.map((point) => ({
            month: point.month,
            income: Number(point.income || 0),
          }))
        : [],
    [financialOverview]
  );

  const maxIncomeTrend = useMemo(
    () => incomeTrend.reduce((maxValue, point) => Math.max(maxValue, point.income), 0),
    [incomeTrend]
  );

  const monthlyTransactionCount = financialOverview?.monthly_transaction_count ?? transaction.length;
  const monthlyIncomeCount = financialOverview?.income_transaction_count ?? overview.incomeCount;
  const monthlyExpenseCount = financialOverview?.expense_transaction_count ?? overview.expenseCount;

  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);

  const HeaderSortButton = ({ label, field }: { label: string; field: SortField }) => (
    <button
      type="button"
      onClick={() => handleSort(field)}
      className="inline-flex items-center gap-1 transition hover:text-slate-700"
    >
      {label}
      {sortBy === field ? (
        sortDirection === "asc" ? <FaSortUp className="h-3 w-3" /> : <FaSortDown className="h-3 w-3" />
      ) : null}
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-4 text-white shadow-lg md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold md:text-3xl">Kelola Transaksi</h1>
            <p className="mt-1 text-xs text-indigo-50 md:text-base">
              Fokuskan analisis pada akumulasi saldo dan pemasukan bulanan agar keputusan keuangan lebih cepat.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-indigo-100">Bulan data</span>
              <MonthPicker
                value={selectedMonth}
                onChange={(monthKey) => {
                  setSelectedMonth(monthKey);
                  setPage(1);
                }}
                max={currentMonthKey}
                theme="glass"
              />
              <span className="rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-[11px] text-indigo-50">
                {selectedMonthLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreatePopup}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            <FaPlus className="h-3.5 w-3.5" />
            Buat Transaksi
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="h-full rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4 shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Akumulasi Saldo</p>
            <FaWallet className="h-4 w-4 text-indigo-600" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${accumulatedBalance >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
            {formatRupiah(accumulatedBalance)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Saldo berjalan sampai akhir {selectedMonthLabel}. Ini metrik utama untuk melihat sisa uang terkumpul.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
              <p className="text-slate-500">Saldo Awal Bulan</p>
              <p className="mt-1 font-semibold text-slate-700">{formatRupiah(openingBalance)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
              <p className="text-slate-500">Perubahan Bersih</p>
              <p className={`mt-1 font-semibold ${monthlyNetBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {monthlyNetBalance >= 0 ? "+ " : "- "}
                {formatRupiah(Math.abs(monthlyNetBalance))}
              </p>
            </div>
          </div>
        </div>

        <div className="h-full rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Pemasukan Bulanan</p>
            <FaArrowUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{formatRupiah(monthlyIncome)}</p>
          <p className="mt-2 text-xs text-slate-500">
            Hanya menampilkan total pemasukan pada periode {selectedMonthLabel} agar fokus analisis pendapatan.
          </p>
          <div className="mt-3 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs">
            <p className="text-slate-500">Jumlah transaksi pemasukan</p>
            <p className="mt-1 font-semibold text-emerald-600">
              {financialOverview?.income_transaction_count || 0} transaksi
            </p>
          </div>
        </div>

        <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Aktivitas Bulanan</p>
            <FaReceipt className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <p className="text-[11px] text-slate-500">Total Transaksi</p>
              <p className="mt-1 text-lg font-bold text-slate-700">{financialOverview?.monthly_transaction_count || 0}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-2 text-center">
              <p className="text-[11px] text-emerald-600">Transaksi Masuk</p>
              <p className="mt-1 text-lg font-bold text-emerald-600">{financialOverview?.income_transaction_count || 0}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Metrik transaksi dihitung untuk bulan {selectedMonthLabel}, tidak terpengaruh pagination tabel.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-12">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Tren Pemasukan 6 Bulan</p>
              <p className="mt-1 text-xs text-slate-500">Grafik hanya pemasukan bulanan untuk bantu evaluasi pertumbuhan income.</p>
            </div>
            <FaChartLine className="h-4 w-4 text-emerald-600" />
          </div>

          {incomeTrend.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Belum ada data pemasukan untuk ditampilkan.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {incomeTrend.map((point) => {
                const barHeight = maxIncomeTrend > 0 ? Math.max((point.income / maxIncomeTrend) * 100, 8) : 8;
                const monthTitle = formatMonthLabel(point.month);
                return (
                  <div key={point.month} className="flex flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end rounded-xl bg-slate-100 p-1.5">
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-emerald-500 to-teal-300 transition-all"
                        style={{ height: `${barHeight}%` }}
                        title={`${monthTitle}: ${formatRupiah(point.income)}`}
                      />
                    </div>
                    <p className="text-[11px] font-medium text-slate-600">{formatShortMonthLabel(point.month)}</p>
                    <p className="text-[11px] text-slate-500">{formatCompactCurrency(point.income)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari transaksi, catatan, atau kategori..."
              value={search}
              onChange={handleSearch}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="date">Tanggal</option>
              <option value="amount">Jumlah</option>
              <option value="category">Kategori</option>
              <option value="type">Tipe</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {sortDirection === "asc" ? (
                <>
                  <FaSortUp className="h-3.5 w-3.5" />
                  Asc
                </>
              ) : (
                <>
                  <FaSortDown className="h-3.5 w-3.5" />
                  Desc
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              typeFilter === "all"
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Semua ({monthlyTransactionCount})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("income")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              typeFilter === "income"
                ? "bg-emerald-600 text-white"
                : "border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Pemasukan ({monthlyIncomeCount})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("expense")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              typeFilter === "expense"
                ? "bg-rose-600 text-white"
                : "border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Pengeluaran ({monthlyExpenseCount})
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <FaReceipt className="h-3 w-3" />
          {isLoadingTable ? "Memuat data transaksi..." : `${filteredTransactions.length} transaksi ditampilkan`}
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {isLoadingTable && (
            <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Memuat transaksi...
            </div>
          )}

          {!isLoadingTable && filteredTransactions.length === 0 && (
            <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Tidak ada transaksi ditemukan.
            </div>
          )}

          {!isLoadingTable &&
            filteredTransactions.map((tx) => {
              const isExpense = tx.type === "expense";
              const tanggal = new Date(tx.date).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

              return (
                <div key={tx.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{tx.category.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{tanggal}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isExpense ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {isExpense ? <FaArrowDown className="h-3 w-3" /> : <FaArrowUp className="h-3 w-3" />}
                      {isExpense ? "Keluar" : "Masuk"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">{tx.note || "-"}</p>
                  <p className={`mt-3 text-sm font-semibold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
                    {isExpense ? "- " : "+ "}
                    {formatRupiah(tx.amount)}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditPopup(tx.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700"
                    >
                      <FaEdit className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tx.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                    >
                      <FaTrash className="h-3 w-3" />
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">
                    <HeaderSortButton label="Transaksi" field="category" />
                  </th>
                  <th className="px-4 py-3">
                    <HeaderSortButton label="Tanggal" field="date" />
                  </th>
                  <th className="px-4 py-3">
                    <HeaderSortButton label="Tipe" field="type" />
                  </th>
                  <th className="px-4 py-3">
                    <HeaderSortButton label="Jumlah" field="amount" />
                  </th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoadingTable && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Memuat transaksi...
                    </td>
                  </tr>
                )}

                {!isLoadingTable && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Tidak ada transaksi ditemukan.
                    </td>
                  </tr>
                )}

                {!isLoadingTable &&
                  filteredTransactions.map((tx, idx) => {
                    const tanggal = new Date(tx.date).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    const isExpense = tx.type === "expense";

                    return (
                      <tr key={tx.id} className="bg-white text-slate-700 transition hover:bg-slate-50/80">
                        <td className="px-4 py-4 text-xs text-slate-500">{(page - 1) * limit + idx + 1}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-800">{tx.category.name}</div>
                          <div className="max-w-[360px] truncate text-xs text-slate-500">{tx.note || "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">{tanggal}</td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                              isExpense ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            {isExpense ? <FaArrowDown className="h-3 w-3" /> : <FaArrowUp className="h-3 w-3" />}
                            {isExpense ? "Pengeluaran" : "Pemasukan"}
                          </span>
                        </td>
                        <td className={`px-4 py-4 text-sm font-semibold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
                          <span className="inline-flex items-center gap-1">
                            {isExpense ? <FaArrowDown className="h-3 w-3" /> : <FaArrowUp className="h-3 w-3" />}
                            {isExpense ? "- " : "+ "}
                            {formatRupiah(tx.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditPopup(tx.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100"
                              aria-label={`Edit transaksi ${tx.category.name}`}
                            >
                              <FaEdit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tx.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                              aria-label={`Hapus transaksi ${tx.category.name}`}
                            >
                              <FaTrash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              <FaArrowLeft className="h-3 w-3" />
              Prev
            </button>

            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  page === pageNumber
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}

            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            >
              Next
              <FaArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>

      {formMode && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-3 backdrop-blur-[2px] md:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeFormPopup();
            }
          }}
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  {formMode === "edit" ? "Edit Transaksi" : "Tambah Transaksi"}
                </h2>
                <p className="text-xs text-slate-500">
                  {formMode === "edit"
                    ? "Perbarui detail transaksi tanpa keluar dari halaman ini."
                    : "Isi data transaksi baru dengan cepat melalui popup."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeFormPopup()}
                disabled={isFormSubmitting}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Tutup popup transaksi"
              >
                <AiOutlineClose className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-4 md:p-5">
              {isFormLoading ? (
                <div className="space-y-3">
                  <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                </div>
              ) : (
                <TransactionForm
                  initialData={formInitialData}
                  onSubmit={handleFormSubmit}
                  onCancel={closeFormPopup}
                  submitLabel={formMode === "edit" ? "Simpan Perubahan" : "Simpan Transaksi"}
                  isSubmitting={isFormSubmitting}
                  variant="compact"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={modal.message}
          okText={modal.okText}
          cancelText={modal.cancelText}
          onOk={modal.onOk}
          onCancel={modal.onCancel}
        />
      )}
    </div>
  );
}
