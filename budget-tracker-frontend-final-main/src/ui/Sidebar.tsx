"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AiOutlineAppstore,
  AiOutlineLogout,
  AiOutlineSolution,
  AiOutlineSwap,
  AiOutlineUser,
} from "react-icons/ai";
import { logout, profile } from "@/services/auth";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { href: "/dashboard", icon: <AiOutlineAppstore className="size-5 opacity-85" />, label: "Dashboard" },
  { href: "/dashboard/transaction", icon: <AiOutlineSwap className="size-5 opacity-85" />, label: "Transaksi" },
  { href: "/dashboard/summary", icon: <AiOutlineSolution className="size-5 opacity-85" />, label: "Summary" },
  { href: "/dashboard/profile", icon: <AiOutlineUser className="size-5 opacity-85" />, label: "Profil" },
];

const isActivePath = (pathname: string, href: string) => {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

const Sidebar = () => {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [initial, setInitial] = useState("U");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }

        const res = await profile(token);
        const name = res.data?.name || "";
        if (name.length > 0) setInitial(name[0].toUpperCase());
      } catch (error) {
        console.error(error);
        logout();
        router.push("/");
      }
    };

    void fetchProfile();
  }, [router]);

  const activeLabel = useMemo(
    () => navItems.find((item) => isActivePath(pathname, item.href))?.label || "Dashboard",
    [pathname]
  );

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500">Budget Tracker</p>
            <p className="text-sm font-semibold text-slate-800">{activeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-content-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
              {initial}
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600"
              aria-label="Logout"
            >
              <AiOutlineLogout className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <nav className="grid grid-cols-4 gap-1">
          {navItems.map(({ href, icon, label }) => {
            const isActive = isActivePath(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {icon}
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-16 flex-col justify-between border-r border-slate-100 bg-white md:flex">
        <div>
          <div className="inline-flex size-16 items-center justify-center">
            <span className="grid size-10 place-content-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
              {initial}
            </span>
          </div>

          <div className="border-t border-slate-100 px-2 pt-4">
            <ul className="space-y-1">
              {navItems.map(({ href, icon, label }) => {
                const isActive = isActivePath(pathname, href);

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`group relative flex justify-center rounded-md px-2 py-2 ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      }`}
                    >
                      {icon}
                      <span className="pointer-events-none invisible absolute start-full top-1/2 z-[60] ms-4 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white group-hover:visible">
                        {label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white p-2">
          <button
            onClick={handleLogout}
            className="group relative flex w-full justify-center rounded-lg px-2 py-2 text-rose-500 transition hover:bg-slate-50 hover:text-rose-600"
          >
            <AiOutlineLogout className="size-5 opacity-85" />
            <span className="pointer-events-none invisible absolute start-full top-1/2 z-[60] ms-4 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white group-hover:visible">
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
