import Sidebar from "@/ui/Sidebar";

export default function DashboardLayout({ children }: {children: React.ReactNode}) {
    return (
        <div className="min-h-screen bg-gray-100">
            <Sidebar />

            <main className="relative min-h-screen min-w-0 overflow-x-clip pb-20 pt-14 md:ml-16 md:pb-4 md:pt-0">
                {children}
            </main>
        </div>
    )
}
