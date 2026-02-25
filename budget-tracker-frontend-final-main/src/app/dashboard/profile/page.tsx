"use client"

import React, { useEffect, useState } from "react";
import { profile as fetchProfile } from "@/services/auth";
import { updateUser } from "@/services/user";
import LoadingSpinnerScreen from "@/ui/LoadingSpinnerScreen";
import Modal from "@/ui/Modal";
import { ModalProps } from "@/interfaces/IModal";

export default function Profilepage() {
    const [form, setForm] = useState({
        id: 0,
        name: "",
        email: "",
        number: ""
    });

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modal, setModal] = useState<ModalProps | null> (null);

    const loadProfile = async () => {
        try {
            const token = localStorage.getItem("token");
            if(!token) return;
            const res = await fetchProfile(token);

            const rawNumber = res.data.number || "";
            const cleanNumber = rawNumber.startsWith("+62") ? rawNumber.replace("+62", "") : rawNumber;

            setForm({
                ...res.data,
                number: cleanNumber
            })
        } catch (error) {
            if(error instanceof Error) {
                setModal({ message: error.message, type: "danger", title: "Gagal", okText: "Tutup"})
            } else {
                setModal({ message: "Terjadi Kesalahan", type: "danger", title: "Gagal", okText: "Tutup"})
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadProfile();
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        const sanitizedValue = name === "number" ? value.replace(/[^0-9]/g, "") : value;
        setForm((prev) => ({...prev, [name]: sanitizedValue}));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const updated = await updateUser(form.id, {
                name: form.name,
                email: form.email,
                number: `+62${form.number}`
            });
            setForm({
                ...updated.data,
                number: updated.data.number.replace("+62", ""),
            });
            setModal({ message: "Profil Berhasil Diperbarui", type: "success", title: "Berhasil", okText: "Oke"})
        } catch (error) {
            if(error instanceof Error) {
                setModal({ message: error.message, type: "danger", title: "Gagal", okText: "Tutup"})
            } else {
                setModal({ message: "Terjadi Kesalahan", type: "danger", title: "Gagal", okText: "Tutup"})
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white shadow-lg">
                <h2 className="text-2xl font-bold">Profil Pengguna</h2>
                <p className="mt-1 text-sm text-indigo-50">
                    Kelola informasi akun kamu agar data transaksi tetap sinkron.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Nama</label>
                    <input
                        id="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        name="name"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        name="email"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="number" className="mb-2 block text-sm font-medium text-slate-700">Nomor Telepon</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-500">+62</div>
                        <input
                            id="number"
                            type="text"
                            value={form.number}
                            onChange={handleChange}
                            name="number"
                            className="w-full rounded-xl border border-slate-200 py-2.5 pl-12 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            required
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                </div>
            </form>

            {modal && (
                <Modal 
                    type={modal.type}
                    title={modal.title}
                    message={modal.message}
                    okText={modal.okText}
                    onOk={() => setModal(null)}
                />
            )}
        </div>
    )   
}
