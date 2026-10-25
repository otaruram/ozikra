"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useSession } from "@/lib/session-context";
import { Icon } from "@/components/icons";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { checkAndSignInGoogle, confirmOfficerSession } = useSession();
  const [status, setStatus] = useState("Memproses otentikasi Google OAuth...");

  useEffect(() => {
    async function handleAuth() {
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseAnonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setStatus("Konfigurasi Supabase tidak ditemukan. Mengalihkan ke beranda...");
        setTimeout(() => router.push("/"), 1500);
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          // If hash fragment contains tokens, Supabase handles it automatically on getSession()
          const { data: authData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !authData.user) {
            throw new Error(error?.message || userErr?.message || "Gagal mendapatkan sesi Google.");
          }
          await processUser(authData.user.email!, authData.user.user_metadata?.full_name);
          return;
        }

        if (session.user) {
          await processUser(session.user.email!, session.user.user_metadata?.full_name);
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus(`Kendala autentikasi: ${err?.message || "Sesi tidak ditemukan"}`);
        setTimeout(() => router.push("/"), 2500);
      }
    }

    async function processUser(email: string, name?: string) {
      setStatus(`Memeriksa akun ${email} di basis data PostgreSQL militer...`);
      const cleanEmail = email.toLowerCase().trim();

      try {
        const res = await fetch(`/api/auth/officer?email=${encodeURIComponent(cleanEmail)}`);
        const data = await res.json();

        if (data.exists && data.officer) {
          if (data.officer.status === "APPROVED") {
            // User sudah terdaftar dan approved -> LANGSUNG KE DASHBOARD!
            confirmOfficerSession(data.officer);
            setStatus("Autentikasi dinas berhasil. Mengalihkan ke Command Console...");
            router.push("/dashboard");
          } else {
            // Menunggu verifikasi nomor pasukan / sprint
            setStatus("Akun Google terverifikasi. Mengalihkan ke verifikasi Nomor Pasukan / Sprint...");
            router.push(`/?auth=verify_sprint&email=${encodeURIComponent(cleanEmail)}`);
          }
        } else {
          // USER BARU: Belum terdaftar -> Wajib isi form onboarding
          setStatus("Akun Google baru teridentifikasi. Mengarahkan ke formulir pendaftaran personel...");
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("ozikra_pending_google_email", cleanEmail);
            if (name) window.sessionStorage.setItem("ozikra_pending_google_name", name);
          }
          router.push(`/onboarding?email=${encodeURIComponent(cleanEmail)}&name=${encodeURIComponent(name || "")}`);
        }
      } catch (err: any) {
        console.error("Callback error verifying officer in DB:", err);
        setStatus("Gagal memeriksa ke database, mengarahkan ke form pendaftaran...");
        router.push(`/onboarding?email=${encodeURIComponent(cleanEmail)}&name=${encodeURIComponent(name || "")}`);
      }
    }

    handleAuth();
  }, [router, checkAndSignInGoogle]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-paper">
      <div className="flex flex-col items-center gap-4 border border-line-strong bg-surface p-8 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 animate-spin">
          <Icon.Pulse size={24} />
        </div>
        <div className="font-mono text-sm uppercase tracking-widest text-paper">
          OZIKRA · GOOGLE SSO VERIFICATION
        </div>
        <div className="font-mono text-xs text-muted text-center max-w-sm">
          {status}
        </div>
      </div>
    </div>
  );
}
