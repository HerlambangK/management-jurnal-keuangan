import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-800">Halaman Tidak Ditemukan</h1>
        <p className="mt-2 text-sm text-slate-600">
          Rute yang kamu akses tidak tersedia. Silakan kembali ke halaman utama aplikasi.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </main>
  );
}
