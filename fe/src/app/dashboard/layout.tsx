"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { ClearanceModal } from "@/components/shell/clearance-modal";
import { useSession } from "@/lib/session-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, isReady, clearanceApproved, refreshSessionFromStorage } =
    useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isReady || session) return;
    const restored = refreshSessionFromStorage();
    if (!restored) {
      router.replace("/");
    }
  }, [isReady, session, refreshSessionFromStorage, router]);

  if (!isReady || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="flex flex-col items-center gap-3 border border-line bg-surface px-8 py-7">
          <OzikLogo size={32} showText={false} className="animate-pulse" />
          <span className="font-mono text-xs text-muted">
            Memverifikasi kredensial sesi<span className="animate-blink">_</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen max-w-[100vw] overflow-x-hidden bg-ink">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/75 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="relative flex-1 overflow-x-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-dots mask-fade-b opacity-55" />
          <div className="relative mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-5 px-3.5 py-5 sm:px-5 md:gap-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>

      <ClearanceModal isOpen={!clearanceApproved} onSuccess={() => {}} />
    </div>
  );
}
