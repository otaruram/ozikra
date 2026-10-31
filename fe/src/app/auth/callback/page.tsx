"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import {
  provisionAndConfirmGoogleOfficer,
  resolveGoogleOAuthUser,
} from "@/lib/supabase-browser";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { Icon } from "@/components/icons";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { confirmOfficerSession, refreshSessionFromStorage } = useSession();
  const [status, setStatus] = useState(
    "Memproses otentikasi tunggal Google OAuth...",
  );
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function handleAuth() {
      try {
        const googleUser = await resolveGoogleOAuthUser();

        if (!googleUser) {
          const existing = refreshSessionFromStorage();
          if (existing) {
            router.replace("/dashboard");
            return;
          }
          throw new Error(
            "Sesi Google OAuth tidak ditemukan atau telah kedaluwarsa.",
          );
        }

        setStatus(
          `Identitas ${googleUser.email} terverifikasi. Menyiapkan Konsol Komando...`,
        );

        const officer = await provisionAndConfirmGoogleOfficer(googleUser);
        confirmOfficerSession(officer);

        setStatus("Autentikasi berhasil. Membuka Command Center...");
        router.replace("/dashboard");
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus(
          `Kendala autentikasi: ${err?.message || "Sesi tidak ditemukan"}`,
        );
        setTimeout(() => router.replace("/"), 2200);
      }
    }

    handleAuth();
  }, [router, confirmOfficerSession, refreshSessionFromStorage]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-paper">
      <div className="relative flex max-w-md flex-col items-center gap-4 border border-line-strong bg-surface p-8 shadow-2xl">
        <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-14 bg-brass" />
        <OzikLogo size={28} showText={false} />
        <div className="flex h-10 w-10 items-center justify-center border border-accent/50 bg-accent/10 text-accent animate-spin">
          <Icon.Pulse size={18} />
        </div>
        <div className="font-display text-lg font-medium text-paper text-center">
          Verifikasi Identitas Dinas · Pussiberad
        </div>
        <div className="font-mono text-xs text-muted text-center">
          {status}
        </div>
      </div>
    </div>
  );
}
