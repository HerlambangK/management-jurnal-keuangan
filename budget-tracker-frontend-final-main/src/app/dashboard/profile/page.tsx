"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchLoginSessions, logout, profileSafe, updateProfile } from "@/services/auth";
import { LoginSessionItem } from "@/interfaces/IAuth";
import LoadingSpinnerScreen from "@/ui/LoadingSpinnerScreen";
import Modal from "@/ui/Modal";
import { ModalProps } from "@/interfaces/IModal";
import { ApiServiceError, toApiServiceError } from "@/utils/handleApiError";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PROFILE_CACHE_KEY = "auth_profile_cache_v1";

type ProfileForm = {
  name: string;
  email: string;
  number: string;
};

type ProfileMeta = {
  id: number;
  createdAt: string;
  updatedAt: string;
};

const stripPhonePrefix = (value: string | null | undefined): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+62")) return raw.slice(3);
  if (raw.startsWith("62")) return raw.slice(2);
  return raw;
};

const formatDate = (value: string | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatSessionTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toFriendlyError = (error: ApiServiceError): string => {
  if (error.isNetworkError) {
    return "Koneksi internet terputus. Coba lagi saat jaringan stabil.";
  }
  return error.message;
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    email: "",
    number: "",
  });
  const [meta, setMeta] = useState<ProfileMeta>({
    id: 0,
    createdAt: "",
    updatedAt: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null | undefined>(undefined);
  const [sessions, setSessions] = useState<LoginSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalProps | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  const applyProfileState = (
    profileData: {
      id: number;
      name: string;
      email: string;
      number: string | null;
      avatar_url?: string | null;
      created_at?: string;
      updated_at?: string;
      sessions?: LoginSessionItem[];
    },
    keepAvatarPreview = false
  ) => {
    setForm({
      name: profileData.name || "",
      email: profileData.email || "",
      number: stripPhonePrefix(profileData.number),
    });
    setMeta({
      id: profileData.id || 0,
      createdAt: profileData.created_at || "",
      updatedAt: profileData.updated_at || "",
    });

    if (!keepAvatarPreview) {
      setAvatarPreview(profileData.avatar_url || null);
    }

    if (Array.isArray(profileData.sessions)) {
      setSessions(profileData.sessions);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setNetworkWarning(null);

      const token = localStorage.getItem("token");
      if (!token) {
        router.replace("/");
        return;
      }

      const { data, error } = await profileSafe(token);
      if (error) {
        if (error.isUnauthorized) {
          logout();
          router.replace("/");
          return;
        }

        setNetworkWarning(toFriendlyError(error));
        const cachedProfile = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfile) {
          try {
            const parsed = JSON.parse(cachedProfile);
            if (parsed && typeof parsed === "object") {
              applyProfileState(parsed as Parameters<typeof applyProfileState>[0]);
            }
          } catch (_error) {
            // ignore invalid cache
          }
        }
        setLoading(false);
        return;
      }

      const profileData = data?.data;
      if (profileData) {
        applyProfileState(profileData);
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData));
      }

      try {
        const sessionRes = await fetchLoginSessions(15);
        setSessions(Array.isArray(sessionRes?.data) ? sessionRes.data : profileData?.sessions || []);
      } catch (_sessionError) {
        // Keep sessions from profile response if dedicated request fails
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nextValue = name === "number" ? value.replace(/[^0-9]/g, "") : value;
    setForm((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handlePickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setModal({
        type: "danger",
        title: "Format Tidak Didukung",
        message: "Pilih file gambar (PNG/JPG/WEBP).",
        okText: "Tutup",
      });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setModal({
        type: "danger",
        title: "Ukuran Terlalu Besar",
        message: "Ukuran gambar maksimal 2MB.",
        okText: "Tutup",
      });
      e.target.value = "";
      return;
    }

    try {
      const asDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Gagal membaca file gambar"));
        reader.readAsDataURL(file);
      });

      setAvatarPreview(asDataUrl);
      setAvatarBase64(asDataUrl);
    } catch (_error) {
      setModal({
        type: "danger",
        title: "Gagal Membaca File",
        message: "File gambar tidak dapat diproses.",
        okText: "Tutup",
      });
    }

    e.target.value = "";
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setAvatarBase64(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        number: form.number.trim().length > 0 ? `+62${form.number.trim()}` : null,
        ...(avatarBase64 !== undefined ? { avatar_base64: avatarBase64 } : {}),
      };

      const updated = await updateProfile(payload);
      applyProfileState(updated.data);
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated.data));
      setAvatarBase64(undefined);
      setNetworkWarning(null);
      setModal({
        message: "Profil berhasil diperbarui.",
        type: "success",
        title: "Berhasil",
        okText: "Oke",
      });
    } catch (error) {
      const knownError = toApiServiceError(error, "Terjadi kesalahan saat memperbarui profil");
      if (knownError.isUnauthorized) {
        logout();
        router.replace("/");
        return;
      }
      setModal({
        message: toFriendlyError(knownError),
        type: "danger",
        title: "Gagal",
        okText: "Tutup",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinnerScreen />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white shadow-lg">
        <h2 className="text-2xl font-bold">Profil Pengguna</h2>
        <p className="mt-1 text-sm text-indigo-50">
          Kelola informasi akun, foto profil, dan pantau riwayat login perangkat kamu.
        </p>
      </div>

      {networkWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {networkWarning}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Foto profil"
                    className="h-full w-full object-cover"
                    onError={() => setAvatarPreview(null)}
                  />
                ) : (
                  <span className="text-3xl font-semibold text-slate-500">
                    {(form.name || "U").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Foto Profil</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePickAvatar}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Upload Gambar
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Hapus Foto
                  </button>
                </div>
                <p className="text-xs text-slate-500">Format JPG/PNG/WEBP, maksimal 2MB.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
                Nama
              </label>
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
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
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
              <label htmlFor="number" className="mb-2 block text-sm font-medium text-slate-700">
                Nomor Telepon
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-500">
                  +62
                </div>
                <input
                  id="number"
                  type="text"
                  value={form.number}
                  onChange={handleChange}
                  name="number"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-12 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
        </div>

        <div className="space-y-5 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">Detail Akun</h3>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>ID User</dt>
                <dd className="font-medium text-slate-800">{meta.id || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Email</dt>
                <dd className="font-medium text-slate-800">{form.email || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Nomor</dt>
                <dd className="font-medium text-slate-800">
                  {form.number ? `+62${form.number}` : "-"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Dibuat</dt>
                <dd className="font-medium text-slate-800">{formatDate(meta.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Diupdate</dt>
                <dd className="font-medium text-slate-800">{formatDate(meta.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">Riwayat Login</h3>
            {sessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Belum ada data sesi login.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-800">{session.device || "Perangkat tidak diketahui"}</p>
                    <p className="mt-1 text-xs text-slate-600">IP: {session.ip_address || "-"}</p>
                    <p className="text-xs text-slate-600">Lokasi: {session.location || "-"}</p>
                    <p className="text-xs text-slate-500">{formatSessionTime(session.logged_in_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

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
  );
}
