"use client";

import TransactionForm from "@/pages/TransactionForm";
import { fetchTransactionById, editTransaction } from "@/services/transaction";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Modal from "@/ui/Modal";
import LoadingSpinnerScreen from "@/ui/LoadingSpinnerScreen";
import { ModalProps } from "@/interfaces/IModal";
import { TransactionFormData } from "@/interfaces/ITransaction";


export default function EditTransactionPage() {
    const params = useParams();
    const rawId = params?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const router = useRouter();
    const isInvalidId = !id || typeof id !== "string";

    const [initialData, setInitialData] = useState<TransactionFormData>();
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modal, setModal] = useState<ModalProps | null>(null);

    useEffect(() => {
        if (isInvalidId) {
            setLoading(false);
            return;
        }

        const loadTransaction = async () => {
            setLoading(true);
            try {
                const res = await fetchTransactionById(Number(id));
                const tx = res.data;

                setInitialData({
                    type: tx.type,
                    amount: tx.amount.toString(),
                    date: tx.date.slice(0, 10),
                    note: tx.note,
                    categoryId: tx.category_id
                });
            } catch (error) {
                if(error instanceof Error){
                    setModal({ message: error.message, type: "danger", title: "Gagal", okText: "Tutup"});
                } else {
                    setModal({ message: "Terjadi Kesalahan", type: "danger", title: "Gagal", okText: "Tutup"});
                }
            } finally {
                setLoading(false);
            }
        };

        void loadTransaction();
    }, [id, isInvalidId]);

    const handleSubmit = async (form: TransactionFormData) => {
        if (isInvalidId) {
            setModal({ message: "ID transaksi tidak valid", type: "danger", title: "Gagal", okText: "Tutup"});
            return;
        }

        setIsSubmitting(true);
        try {
            await editTransaction(Number(id), {
                ...form,
            });

            setModal({
                type: "success",
                title: "Berhasil",
                message: "Transaksi Berhasil Diperbarui",
                okText: "Lihat Daftar"
            })
        } catch(error) {
            if(error instanceof Error){
                setModal({ message: error.message, type: "danger", title: "Gagal", okText: "Tutup"});
            } else {
                setModal({ message: "Terjadi Kesalahan", type: "danger", title: "Gagal", okText: "Tutup"});
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    if (loading) return <LoadingSpinnerScreen />;
    if (isInvalidId) return <>Invalid Transaction ID</>;

    return (
        <div className="space-y-5 p-4 md:p-6">
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white shadow-lg">
                <h1 className="text-2xl font-bold">Edit Transaksi</h1>
                <p className="mt-1 text-sm text-indigo-50">
                    Perbarui data transaksi agar laporan keuangan tetap akurat.
                </p>
            </div>
            {isSubmitting && <LoadingSpinnerScreen />}
            {modal && (
                <Modal
                type={modal.type}
                title={modal.title}
                message={modal.message}
                okText={modal.okText}
                onOk={() => {
                    setModal(null);
                    if(modal.type === "success"){
                        router.push("/dashboard/transaction")
                    }
                }}
                />
            )}
            {initialData && (
                <TransactionForm initialData={initialData} onSubmit={handleSubmit} />
            )}
        </div>
    )
}
