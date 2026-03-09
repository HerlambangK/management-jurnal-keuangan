"use client"
import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { AiOutlineEyeInvisible, AiOutlineEye } from "react-icons/ai";
import { useRouter } from "next/navigation";
import { login, register } from "@/services/auth";
import LoadingSpinnerButton from "@/ui/LoadingSpinnerButton";
import Modal from "@/ui/Modal";
import { resolveClientLocation } from "@/utils/clientLocation";

const AuthPage = () => {
    const [type, setType] = useState<"login" | "register">("login");
    const [showPassword, setShowPassword] = useState(false);
    const termsCheckBoxRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: "",
        number: "",
        email: "",
        password: "",
    })

    const isLogin = type === "login";
    const inputClassName =
        "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:py-3 sm:text-sm";
    const authHighlights = [
        "Pantau pemasukan dan pengeluaran harian dalam satu dashboard.",
        "Dapatkan insight bulanan agar keputusan finansial lebih tepat.",
        "Akses data budget dari perangkat mana pun dengan aman."
    ];

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErrors({});
        setLoading(true);
        
        try {
            let response;

            if(isLogin) {
                const clientLocation = await resolveClientLocation({
                    timeoutMs: 3200,
                    enableHighAccuracy: true,
                });
                if (!clientLocation) {
                    throw new Error(
                        "Akses lokasi wajib diaktifkan untuk login. Izinkan lokasi browser lalu coba lagi."
                    );
                }
                response = await login({
                    email: formData.email,
                    password: formData.password,
                    client_location: clientLocation,
                });
            } else {
                if(!termsCheckBoxRef.current?.checked) {
                    setErrors({ terms: "Kamu Harus Mensetujui Terms & Privacy "});
                    return
                }

                const clientLocation = await resolveClientLocation({
                    timeoutMs: 3200,
                    enableHighAccuracy: true,
                });
                if (!clientLocation) {
                    throw new Error(
                        "Akses lokasi wajib diaktifkan untuk registrasi. Izinkan lokasi browser lalu coba lagi."
                    );
                }
                response = await register({
                    ...formData,
                    number: `+62${formData.number}`,
                    client_location: clientLocation,
                });
            }

            
            const token = response.data.token;
            localStorage.setItem("token", token);
            router.push("/dashboard");
        } catch (error) {
            if(error instanceof Error) {
                setErrors({ general: error.message})
            }
        } finally {
            setLoading(false)
        }
    }
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 px-0 py-0 sm:px-6 sm:py-10 lg:px-8">
      <div className="pointer-events-none absolute -left-16 top-10 h-52 w-52 rounded-full bg-cyan-400/30 blur-3xl sm:top-14 sm:h-64 sm:w-64" />
      <div className="pointer-events-none absolute -right-14 bottom-10 h-56 w-56 rounded-full bg-indigo-400/30 blur-3xl sm:bottom-16 sm:h-72 sm:w-72" />
      <div
        className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl overflow-hidden rounded-none border-y border-white/10 bg-white/95 shadow-none backdrop-blur-xl [animation:authCardIn_.7s_cubic-bezier(0.22,1,0.36,1)] sm:min-h-0 sm:rounded-[32px] sm:border sm:border-white/20 sm:shadow-[0_35px_90px_rgba(15,23,42,0.4)] md:grid-cols-[1.08fr_0.92fr]"
      >
        {/* bagian kiri card */}
        <div className="relative flex flex-col justify-center px-5 pb-7 pt-8 sm:p-10 lg:p-12">
            <div className="mb-6 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50 p-4 md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Budget Tracker</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Kelola target finansial kamu langsung dari satu akun.</p>
            </div>
            {/* Ini bagian title dan sub title auth */}
          <p className="mb-3 hidden rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 sm:inline-flex">
            Budget Tracker
          </p>
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {isLogin ? "Sign In" : "Sign Up"}
          </h2>
          <p className="mb-6 mt-2 text-sm leading-6 text-slate-600 sm:mb-7">
            {isLogin
                ? "Welcome back! Masuk dan lanjutkan perjalanan keuanganmu."
                : "Buat akun baru untuk mulai mengelola budget lebih terarah."}
          </p>
          <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:hidden">
            <button
                type="button"
                onClick={() => setType("login")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
            >
                Masuk
            </button>
            <button
                type="button"
                onClick={() => setType("register")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    !isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
            >
                Daftar
            </button>
          </div>

            {/* form input untuk register / login */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Ini muncul ketika dia kondisi nya adalah register */}
            {!isLogin && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700">Full Name</label>
                        <input 
                            id="name"
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value})}
                            placeholder="John Doe"
                            className={inputClassName}
                        />
                    </div>
                    <div>
                        <label htmlFor="number" className="block text-sm font-medium text-slate-700">Phone Number</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center justify-center text-sm font-medium text-slate-500">
                                +62
                            </div>
                            <input 
                                id="number"
                                type="text"
                                value={formData.number}
                                onChange={(e) => setFormData({ ...formData, number: e.target.value})}
                                placeholder="8xxxxxxx"
                                className={`${inputClassName} pl-14`}
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* Ini muncul ketika dia kondisi nya itu login atau register */}
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
                <input 
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value})}
                    placeholder="johndoe@gmail.com"
                    className={inputClassName}
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                    <input 
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value})}
                        placeholder="********"
                        className={`${inputClassName} pr-12`}
                    />
                    <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    >
                        {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
                    </button>
                </div>
            </div>

            {errors.general && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{errors.general}</div>
            )}

            {!isLogin && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start">
                        <input 
                            ref={termsCheckBoxRef}
                            id="terms"
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="terms" className="ml-3 block text-sm leading-6 text-slate-700">
                            I agree to the{" "}
                            <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={() => (setShowModal(!showModal))}>Term & Privacy Policy</button>
                        </label>
                    </div>
                </div>
            )}
            {errors.terms && <p className="text-xs text-rose-600">{errors.terms}</p>}

            {/* submit form */}
            <button
                type="submit"
                disabled={loading}
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold text-white transition sm:h-auto sm:py-3 sm:text-sm ${loading ? "cursor-not-allowed bg-indigo-300" : "bg-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.25)] hover:-translate-y-0.5 hover:bg-indigo-600"}`}
            >
                {loading ? (
                    <>
                        <LoadingSpinnerButton />
                        Processing...
                    </>
                ): (
                    isLogin ? "Let's Explore" : "Get Started"
                )}
            </button>
            <p className="text-center text-xs leading-5 text-slate-500 sm:hidden">
                Login cepat dan aman langsung dari perangkat mobile kamu.
            </p>


            {/* button untuk mengubah kondisi register dan login */}
            <p className="mt-1 hidden text-center text-sm text-slate-600 sm:block">
                {/* untuk mengubah kondisi auth nya (login/register) */}
                {isLogin ? (
                    <>
                        Don&apos;t have an account? {" "} 
                        <button 
                            type="button"
                            className="font-semibold text-indigo-600 hover:underline"
                            onClick={() => {
                                setType("register")
                            }}
                        >
                            Sign Up
                        </button>
                    </>
                ) : (
                    <>
                        Already have an account? {" "} 
                        <button 
                            type="button"
                            className="font-semibold text-indigo-600 hover:underline"
                            onClick={() => {
                                setType("login")
                            }}
                        >
                            Sign In
                        </button>
                    </>
                )}
            </p>
          </form>
        </div>


            {/* bagian kanan card */}
        <div className="relative hidden min-h-[760px] md:block">
            <Image 
                src="/images/auth-img.png"
                alt="Auth Image"
                fill
                className="object-cover"
                priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/45 via-slate-900/60 to-slate-900/75" />
            <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
                <div className="w-full max-w-sm rounded-2xl border border-white/30 bg-white/10 p-5 backdrop-blur-md [animation:authFloating_4s_ease-in-out_infinite]">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Smart Financial Habit</p>
                    <p className="mt-3 text-sm leading-6 text-slate-100">
                        Dari transaksi harian sampai target tahunan, semua bisa kamu monitor secara real-time.
                    </p>
                </div>
                <div>
                    <h3 className="max-w-md text-3xl font-semibold leading-tight">
                        Bangun kebiasaan finansial yang lebih sehat, mulai hari ini.
                    </h3>
                    <ul className="mt-6 space-y-3 text-sm text-slate-100">
                        {authHighlights.map((highlight) => (
                            <li key={highlight} className="flex items-start gap-3 leading-6">
                                <span className="mt-2 h-2 w-2 rounded-full bg-cyan-300" />
                                <span>{highlight}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
      </div>
      {showModal && (
        <Modal
            type="information"
            title="Terms & Privacy Policy"
            message="By using this application, you agree to our Terms and Privacy Policy. We may collect usage data to improve your experience. We do not share your data with third parties without your consent. For full details, visit our legal page." 
            okText="Saya Setuju"
            cancelText="Kembali"
            onOk={() => {
                setShowModal(false);
                if(termsCheckBoxRef.current) termsCheckBoxRef.current.checked = true;
            }}
            onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default AuthPage;
