import Sidebar from "@/ui/Sidebar";

export default function DashboardLayout({ children }: {children: React.ReactNode}) {
    return (
        <div className="relative min-h-screen overflow-x-clip bg-slate-100">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-28 top-16 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
                <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-sky-200/35 blur-3xl" />
                <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-200/25 blur-3xl" />
            </div>
            <Sidebar />

            <main className="relative min-h-screen min-w-0 pb-24 pt-20 transition-[margin] duration-300 md:ml-[var(--dashboard-sidebar-width)] md:pb-10 md:pt-6">
                <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 md:px-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
