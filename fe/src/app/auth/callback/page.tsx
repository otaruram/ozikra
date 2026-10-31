"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import {
  provisionAndConfirmGoogleOfficer,
  resolveGoogleOAuthUser,
} from "@/lib/supabase-browser";
import { Icon } from "@/components/icons";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { confirmOfficerSession, refreshSessionFromStorage } = useSession();
  const [status, setStatus] = useState("Memproses otentikasi Google OAuth...");
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function handleAuth() {
      try {
        const googleUser = await resolveGoogleOAuthUser();

        if (!googleUser) {
          // Check if a valid session was already hydrated in localStorage
          const existing = refreshSessionFromStorage();
          if (existing) {
            router.replace("/dashboard");
            return;
          }
          throw new Error("Sesi Google OAuth tidak ditemukan atau telah kedaluwarsa.");
        }

        setStatus(
          `Identitas ${googleUser.email} terverifikasi. Menyiapkan Command Console...`
        );

        const officer = await provisionAndConfirmGoogleOfficer(googleUser);
        confirmOfficerSession(officer);

        setStatus("Autentikasi berhasil. Membuka Command Console...");
        router.replace("/dashboard");
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus(`Kendala autentikasi: ${err?.message || "Sesi tidak ditemukan"}`);
        setTimeout(() => router.replace("/"), 2200);
      }
    }

    handleAuth();
  }, [router, confirmOfficerSession, refreshSessionFromStorage]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-paper">
      <div className="flex flex-col items-center gap-4 border border-line-strong bg-surface p-8 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 animate-spin">
          <Icon.Pulse size={24} />
        </div>
        <div className="font-mono text-sm uppercase tracking-widest text-paper text-center">
          OZIKRA · GOOGLE SSO VERIFICATION
        </div>
        <div className="font-mono text-xs text-muted text-center max-w-sm">
          {status}
        </div>
      </div>
    </div>
  );
}
