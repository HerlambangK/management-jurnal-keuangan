"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiActivity,
  FiBarChart2,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiPieChart,
  FiPlus,
  FiUser,
  FiX,
} from "react-icons/fi";
import { ProfileData } from "@/interfaces/IAuth";
import { logout, profileSafe } from "@/services/auth";
import { fetchMonthlySummary, fetchTodayTransaction } from "@/services/transaction";
import { toApiServiceError } from "@/utils/handleApiError";
import formatRupiah from "@/utils/formatRupiah";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: IconType;
  accent: string;
};

type FinancialSummary = {
  income: number;
  expense: number;
  balance: number;
  saving: number;
};

type FinancialActivity = {
  id: number;
  note: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  categoryName: string;
};

const PROFILE_CACHE_KEY = "auth_profile_cache_v1";
const DESKTOP_SIDEBAR_COLLAPSED_KEY = "dashboard_sidebar_collapsed_v1";

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Ringkasan uang masuk dan keluar",
    icon: FiGrid,
    accent: "from-cyan-500 to-blue-500",
  },
  {
    href: "/dashboard/transaction",
    label: "Transaksi",
    description: "Catat transaksi harian secara cepat",
    icon: FiActivity,
    accent: "from-emerald-500 to-teal-500",
  },
  {
    href: "/dashboard/summary",
    label: "AI Summary",
    description: "Analisis tren dan forecast bulanan",
    icon: FiPieChart,
    accent: "from-amber-500 to-orange-500",
  },
  {
    href: "/dashboard/profile",
    label: "Profil",
    description: "Kelola akun dan perangkat login",
    icon: FiUser,
    accent: "from-indigo-500 to-sky-500",
  },
];

const defaultFinancialSummary: FinancialSummary = {
  income: 0,
  expense: 0,
  balance: 0,
  saving: 0,
};

const isActivePath = (pathname: string, href: string) => {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

const toSafeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseFinancialSummary = (raw: unknown): FinancialSummary => {
  if (typeof raw !== "object" || raw === null) return defaultFinancialSummary;
  const summary = raw as Record<string, unknown>;

  return {
    income: toSafeNumber(summary.income),
    expense: toSafeNumber(summary.expense),
    balance: toSafeNumber(summary.balance),
    saving: toSafeNumber(summary.saving),
  };
};

const parseFinancialActivities = (raw: unknown): FinancialActivity[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): FinancialActivity | null => {
      if (typeof item !== "object" || item === null) return null;

      const value = item as Record<string, unknown>;
      const type = value.type === "income" ? "income" : value.type === "expense" ? "expense" : null;
      const id = toSafeNumber(value.id);

      if (!type || !id) return null;

      const category =
        typeof value.category === "object" && value.category !== null
          ? (value.category as Record<string, unknown>)
          : null;

      return {
        id,
        type,
        amount: toSafeNumber(value.amount),
        note: typeof value.note === "string" ? value.note : "",
        date: typeof value.date === "string" ? value.date : "",
        categoryName: typeof category?.name === "string" ? category.name : "Tanpa kategori",
      };
    })
    .filter((item): item is FinancialActivity => item !== null)
    .slice(0, 3);
};

const formatActivityDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const shortName = (value: string | undefined): string => {
  if (!value) return "User";
  const trimmed = value.trim();
  if (!trimmed) return "User";
  return trimmed.split(" ")[0] || "User";
};

type CollapsedTooltipProps = {
  label: string;
  children: React.ReactNode;
};

const CollapsedTooltip = ({ label, children }: CollapsedTooltipProps) => (
  <span className="group/tooltip relative inline-flex">
    {children}
    <span className="pointer-events-none absolute left-[calc(100%+0.6rem)] top-1/2 z-30 inline-flex -translate-y-1/2 translate-x-1 items-center rounded-lg border border-slate-700/80 bg-slate-900/95 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/tooltip:translate-x-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:translate-x-0 group-focus-within/tooltip:opacity-100">
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-slate-700/80 bg-slate-900/95" />
      <span className="relative whitespace-nowrap">{label}</span>
    </span>
  </span>
);

const Sidebar = () => {
  const pathname = usePathname() || "";
  const router = useRouter();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState("U");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>(defaultFinancialSummary);
  const [financialActivities, setFinancialActivities] = useState<FinancialActivity[]>([]);
  const [isPulseLoading, setIsPulseLoading] = useState(true);

  const applyUserState = useCallback((rawUser: Partial<ProfileData>) => {
    const safeName = typeof rawUser.name === "string" && rawUser.name.trim() ? rawUser.name.trim() : "User";
    const safeEmail = typeof rawUser.email === "string" && rawUser.email.trim() ? rawUser.email.trim() : "-";
    const safeNumber = typeof rawUser.number === "string" ? rawUser.number : null;
    const safeAvatar = typeof rawUser.avatar_url === "string" ? rawUser.avatar_url : null;
    const safeId = typeof rawUser.id === "number" ? rawUser.id : 0;

    setProfileData({
      id: safeId,
      name: safeName,
      email: safeEmail,
      number: safeNumber,
      avatar_url: safeAvatar,
    });
    setInitial(safeName.charAt(0).toUpperCase());
    setAvatarUrl(safeAvatar || null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.replace("/");
        return;
      }

      const cachedProfile = localStorage.getItem(PROFILE_CACHE_KEY);
      if (cachedProfile) {
        try {
          const parsed = JSON.parse(cachedProfile);
          if (isMounted && typeof parsed === "object" && parsed !== null) {
            applyUserState(parsed as Partial<ProfileData>);
          }
        } catch (_error) {
          // ignore invalid cache
        }
      }

      const { data, error } = await profileSafe(token);
      if (!isMounted) return;

      if (error) {
        if (error.isUnauthorized) {
          logout();
          router.replace("/");
        }
        return;
      }

      const user = data?.data;
      if (!user) return;

      applyUserState(user);
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [applyUserState, router]);

  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY);
      if (savedPreference === "1") {
        setIsDesktopCollapsed(true);
      }
    } catch (_error) {
      // ignore localStorage read failure
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const width = isDesktopCollapsed ? "5.75rem" : "21.5rem";
    root.style.setProperty("--dashboard-sidebar-width", width);

    try {
      localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, isDesktopCollapsed ? "1" : "0");
    } catch (_error) {
      // ignore localStorage write failure
    }
  }, [isDesktopCollapsed]);

  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty("--dashboard-sidebar-width", "21.5rem");
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadFinancialPulse = async () => {
      setIsPulseLoading(true);
      const [summaryRes, activityRes] = await Promise.allSettled([fetchMonthlySummary(), fetchTodayTransaction()]);
      if (!isMounted) return;

      if (summaryRes.status === "fulfilled") {
        setFinancialSummary(parseFinancialSummary(summaryRes.value?.data));
      } else {
        const knownError = toApiServiceError(summaryRes.reason, "Gagal mengambil ringkasan keuangan");
        if (knownError.isUnauthorized) {
          logout();
          router.replace("/");
          return;
        }
      }

      if (activityRes.status === "fulfilled") {
        setFinancialActivities(parseFinancialActivities(activityRes.value?.data));
      } else {
        const knownError = toApiServiceError(activityRes.reason, "Gagal mengambil aktivitas keuangan");
        if (knownError.isUnauthorized) {
          logout();
          router.replace("/");
          return;
        }
      }

      setIsPulseLoading(false);
    };

    void loadFinancialPulse();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isMobileOpen]);

  const activeLabel = useMemo(
    () => navItems.find((item) => isActivePath(pathname, item.href))?.label || "Dashboard",
    [pathname]
  );

  const spendingRatio = useMemo(() => {
    if (financialSummary.income <= 0) {
      return financialSummary.expense > 0 ? 100 : 0;
    }
    return Math.min((financialSummary.expense / financialSummary.income) * 100, 100);
  }, [financialSummary.expense, financialSummary.income]);

  const spendingTone = spendingRatio > 90 ? "bg-rose-500" : spendingRatio > 70 ? "bg-amber-500" : "bg-emerald-500";

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  const renderAvatar = (sizeClass: string) => {
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt="Avatar"
          className={`${sizeClass} rounded-2xl border border-white/40 object-cover`}
          onError={() => setAvatarUrl(null)}
        />
      );
    }

    return (
      <span
        className={`grid ${sizeClass} place-content-center rounded-2xl border border-white/40 bg-white/25 text-sm font-semibold text-white`}
      >
        {initial}
      </span>
    );
  };

  const renderMenuList = () => (
    <nav className="space-y-1.5">
      {navItems.map(({ href, label, description, icon: Icon, accent }) => {
        const isActive = isActivePath(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            onClick={() => setIsMobileOpen(false)}
            className={`group relative flex items-start gap-3 overflow-hidden rounded-2xl border px-3 py-3 transition ${
              isActive
                ? "border-sky-200 bg-white shadow-sm"
                : "border-transparent bg-slate-50/70 hover:border-slate-200 hover:bg-white"
            }`}
          >
            {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-sky-500" />}
            <span
              className={`mt-0.5 grid h-8 w-8 place-content-center rounded-xl bg-gradient-to-br text-white ${
                isActive ? accent : "from-slate-400 to-slate-500"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${isActive ? "text-slate-900" : "text-slate-700"}`}>
                {label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  const renderFinancialPulse = () => (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Financial Pulse</p>
        <FiBarChart2 className="h-3.5 w-3.5 text-slate-500" />
      </div>

      {isPulseLoading ? (
        <div className="mt-3 space-y-2">
          <div className="h-7 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-7 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-7 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-2.5 py-2">
              <p className="text-slate-500">Masuk</p>
              <p className="font-semibold text-emerald-700">{formatRupiah(financialSummary.income)}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-2.5 py-2">
              <p className="text-slate-500">Keluar</p>
              <p className="font-semibold text-rose-700">{formatRupiah(financialSummary.expense)}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-2.5 py-2">
              <p className="text-slate-500">Saldo</p>
              <p className="font-semibold text-indigo-700">{formatRupiah(financialSummary.balance)}</p>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/80 px-2.5 py-2">
              <p className="text-slate-500">Tabungan</p>
              <p className="font-semibold text-cyan-700">{formatRupiah(financialSummary.saving)}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Rasio pengeluaran</span>
              <span>{spendingRatio.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200">
              <div
                className={`h-1.5 rounded-full transition-all ${spendingTone}`}
                style={{ width: `${Math.max(spendingRatio, 4)}%` }}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {financialActivities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-500">
                Belum ada transaksi hari ini.
              </p>
            ) : (
              financialActivities.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[11px] font-medium text-slate-700">{item.note || item.categoryName}</p>
                    <p className={`text-[11px] font-semibold ${item.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                      {item.type === "income" ? "+" : "-"}
                      {formatRupiah(item.amount)}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500">{formatActivityDate(item.date)}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );

  const renderCollapsedDesktopSidebar = () => (
    <div className="flex flex-col items-center rounded-[1.5rem] border border-white/70 bg-white/90 px-1.5 py-2.5 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
      <CollapsedTooltip label="Perbesar sidebar">
        <button
          type="button"
          onClick={() => setIsDesktopCollapsed(false)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          aria-label="Perbesar sidebar"
        >
          <FiChevronsRight className="h-3.5 w-3.5" />
        </button>
      </CollapsedTooltip>

      <CollapsedTooltip label="Dashboard">
        <Link
          href="/dashboard"
          className="mt-2.5 grid h-11 w-11 place-content-center rounded-2xl bg-gradient-to-br from-slate-900 via-sky-900 to-cyan-700 text-base font-semibold text-white"
        >
          BT
        </Link>
      </CollapsedTooltip>

      <nav className="mt-3 flex w-full flex-col items-center gap-2">
        {navItems.map(({ href, label, icon: Icon, accent }) => {
          const isActive = isActivePath(pathname, href);
          return (
            <CollapsedTooltip key={href} label={label}>
              <Link
                href={href}
                className={`group inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                  isActive
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-content-center rounded-lg bg-gradient-to-br text-white ${
                    isActive ? accent : "from-slate-400 to-slate-500"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </Link>
            </CollapsedTooltip>
          );
        })}
      </nav>

      <div className="mt-3 flex w-full flex-col items-center gap-2 border-t border-slate-200 pt-2.5">
        <CollapsedTooltip label="Profil">
          <Link
            href="/dashboard/profile"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:bg-slate-100"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" onError={() => setAvatarUrl(null)} />
            ) : (
              <span className="text-xs font-semibold text-slate-600">{initial}</span>
            )}
          </Link>
        </CollapsedTooltip>

        <CollapsedTooltip label="Keluar">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
            aria-label="Keluar"
          >
            <FiLogOut className="h-3.5 w-3.5 translate-x-px" />
          </button>
        </CollapsedTooltip>
      </div>
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col rounded-[1.7rem] border border-white/70 bg-white/90 p-3 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-sky-900 to-cyan-700 p-4 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-cyan-300/30 blur-2xl" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDesktopCollapsed(true)}
            className="absolute right-0 top-0 hidden h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-white transition hover:bg-white/25 md:inline-flex"
            aria-label="Minimalkan sidebar"
            title="Minimalkan sidebar"
          >
            <FiChevronsLeft className="h-4 w-4" />
          </button>

          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/90">Finance Workspace</p>
          <h1 className="mt-1 text-lg font-semibold">Budget Tracker</h1>
          <p className="mt-1 text-xs text-cyan-100/90">Halo, {shortName(profileData?.name)}</p>

          <div className="mt-3 flex items-center justify-between text-[11px] text-cyan-100/90">
            <span>{todayLabel}</span>
            <span className="rounded-full border border-white/30 bg-white/15 px-2 py-0.5">{activeLabel}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/dashboard/transaction"
              onClick={() => setIsMobileOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white/15 px-2 py-2 text-[11px] font-medium text-white transition hover:bg-white/25"
            >
              <FiPlus className="h-3.5 w-3.5" />
              Transaksi
            </Link>
            <Link
              href="/dashboard/summary"
              onClick={() => setIsMobileOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white px-2 py-2 text-[11px] font-semibold text-sky-800 transition hover:bg-cyan-50"
            >
              <FiPieChart className="h-3.5 w-3.5" />
              Insight AI
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-0.5">
        {renderMenuList()}
        {renderFinancialPulse()}
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5">
          {renderAvatar("h-11 w-11")}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{profileData?.name || "User"}</p>
            <p className="truncate text-xs text-slate-500">{profileData?.email || "-"}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link
            href="/dashboard/profile"
            onClick={() => setIsMobileOpen(false)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FiUser className="h-3.5 w-3.5" />
            Profil
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <FiLogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
            aria-label="Buka navigasi"
          >
            <FiMenu className="h-4 w-4" />
          </button>

          <Link href="/dashboard" className="min-w-0 flex-1 text-center">
            <p className="truncate text-[11px] uppercase tracking-[0.12em] text-slate-500">Budget Tracker</p>
            <p className="truncate text-sm font-semibold text-slate-800">{activeLabel}</p>
          </Link>

          <Link
            href="/dashboard/profile"
            className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            aria-label="Buka profil"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <span className="text-xs font-semibold text-slate-600">{initial}</span>
            )}
          </Link>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] transition duration-200 md:hidden ${
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(88vw,21rem)] p-2 transition-transform duration-300 md:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-white"
            aria-label="Tutup navigasi"
          >
            <FiX className="h-4 w-4" />
          </button>
          {sidebarContent}
        </div>
      </aside>

      <aside
        className={`fixed left-4 z-40 hidden transition-[width,top,bottom] duration-300 md:block ${
          isDesktopCollapsed ? "top-4 w-[4.75rem]" : "inset-y-4 w-[19.5rem]"
        }`}
      >
        {isDesktopCollapsed ? renderCollapsedDesktopSidebar() : sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
