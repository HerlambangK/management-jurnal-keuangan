"use client"

import TransactionForm from "@/pages/TransactionForm";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Modal from "@/ui/Modal";
import LoadingSpinnerScreen from "@/ui/LoadingSpinnerScreen";
import { ModalProps } from "@/interfaces/IModal";
import { TransactionFormData } from "@/interfaces/ITransaction";
import { createTransaction } from "@/services/transaction";

export default function CreateTransactionPage() {
    const router = useRouter();
    const [isSubmitting, setISubmitting] = useState(false);
    const [modal, setModal] = useState<ModalProps | null>(null);

    const handleSubmit = async (form: TransactionFormData) => {
        setISubmitting(true);
        try {
            await createTransaction({
                ...form,
                category_id: form.categoryId    
            });
            setModal({
                type: "success",
                title: "Berhasil",
                message: "Transaksi Berhasil Ditambahkan",
                okText: "Lihat Daftar"
            });
        } catch (error) {
            if(error instanceof Error){
                setModal({ message: error.message, type: "danger", title: "Gagal", okText: "Tutup"});
            } else {
                setModal({ message: "Terjadi Kesalahan", type: "danger", title: "Gagal", okText: "Tutup"});
            }
        } finally {
            setISubmitting(false);
        }
    }
    
    return (
        <div className="space-y-5 p-4 md:p-6">
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white shadow-lg">
                <h1 className="text-2xl font-bold">Buat Transaksi Baru</h1>
                <p className="mt-1 text-sm text-indigo-50">
                    Isi detail transaksi dengan lengkap untuk pencatatan yang lebih akurat.
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
                            router.push('/dashboard/transaction')
                        }
                    }}
                />
            )}
            <TransactionForm onSubmit={handleSubmit}/>
        </div>
    )
}
