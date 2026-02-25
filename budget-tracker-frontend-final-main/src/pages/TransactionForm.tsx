"use client"

import React, { useEffect, useState } from "react";
import { TransaksiProps } from "@/interfaces"
import { CategoryOption, TransactionFormData } from "@/interfaces/ITransaction";
import { fetchAllCategories } from "@/services/category";
import convertNumRupiah from "@/utils/convertNumRupiah";

const getDefaultForm = (): TransactionFormData => ({
    type: "expense",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
    categoryId: "",
});

const TransactionForm: React.FC<TransaksiProps> = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel,
    cancelLabel = "Batal",
    isSubmitting = false,
    variant = "default",
}) => {
    const [form, setForm] = useState<TransactionFormData>(getDefaultForm());

    const [categories, setCategories] = useState<CategoryOption[]>([]);

    const loadCategories = async () => {
        try {
            const res = await fetchAllCategories();
            setCategories(res?.data || [])
        } catch(error) {
            if(error instanceof Error) {
                console.error({ message: error.message, type: "danger"});
            } else{
                console.error({ message: "Terjadi Kesalahan", type: "danger"});
            }
        }
    }

    useEffect(() => {
        if(initialData) {
            setForm({
                ...initialData,
                categoryId: String(initialData.categoryId),
                amount: String(initialData.amount)
            });
            return;
        }

        setForm(getDefaultForm());
    }, [initialData]);

    useEffect(() => {
        loadCategories();
    }, []);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        
        if(name === "amount") {
            const clean = value.replace(/\D/g, "");
            const formatted = convertNumRupiah(clean);
            setForm(prev => ({ ...prev, amount: formatted}));
            return;
        }

        setForm(prev => ({ ...prev, [name]: value }))
    };

    const handleSubmit = async (
        e: React.FormEvent
    ) => {
        e.preventDefault();

        const cleanedAmount = form.amount.replace(/\D/g, "");
        
        const payload: TransactionFormData = {
            ...form,
            amount: cleanedAmount,
            categoryId: parseInt(String(form.categoryId)),
        }

        await onSubmit(payload);
    }

    const cardClassName =
        variant === "compact"
            ? "space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
            : "space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6";

    const resolvedSubmitLabel = submitLabel || (initialData ? "Simpan Perubahan" : "Simpan Transaksi");

    return (
        <form onSubmit={handleSubmit} className={variant === "compact" ? "w-full" : "max-w-2xl"}>
            <div className={cardClassName}>
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-800">Detail Transaksi</h3>
                    <p className="text-sm text-slate-500">Lengkapi data transaksi dengan benar sebelum disimpan.</p>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Tipe Transaksi</label>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, type: "income" }))}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                                form.type === "income"
                                    ? "bg-emerald-500 text-white shadow-sm"
                                    : "text-slate-600 hover:bg-white"
                            }`}
                        >
                            Pemasukan
                        </button>
                        <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, type: "expense" }))}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                                form.type === "expense"
                                    ? "bg-rose-500 text-white shadow-sm"
                                    : "text-slate-600 hover:bg-white"
                            }`}
                        >
                            Pengeluaran
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label htmlFor="amount" className="mb-2 block text-sm font-medium text-slate-700">Jumlah</label>
                        <input
                            id="amount"
                            type="text"
                            name="amount"
                            value={form.amount}
                            onChange={handleChange}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            placeholder="Contoh: Rp10.000"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="date" className="mb-2 block text-sm font-medium text-slate-700">Tanggal</label>
                        <input
                            id="date"
                            type="date"
                            name="date"
                            value={form.date}
                            onChange={handleChange}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="categoryId" className="mb-2 block text-sm font-medium text-slate-700">Kategori</label>
                        <select
                            id="categoryId"
                            name="categoryId"
                            value={form.categoryId}
                            onChange={handleChange}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            required
                        >
                            <option value="">-- Pilih Kategori --</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-2">
                        <label htmlFor="note" className="mb-2 block text-sm font-medium text-slate-700">Catatan</label>
                        <textarea
                            id="note"
                            name="note"
                            value={form.note}
                            onChange={handleChange}
                            rows={3}
                            className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            placeholder="Masukkan catatan transaksi..."
                            required
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isSubmitting ? "Menyimpan..." : resolvedSubmitLabel}
                    </button>
                </div>
            </div>
        </form>
    )
}

export default TransactionForm;
