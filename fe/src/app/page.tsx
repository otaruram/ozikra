"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { Button, Eyebrow, Input, Mono, Tag } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/lib/session-context";

const PHASES = [
  {
    no: "01",
    title: "Pre-Deployment SBOM & QR Seal",
    body: "Multimodal AI audits procurement manifests and SBOMs, scores vendor trust, matches CVEs and issues an HMAC-signed Tactical QR Passport.",
    icon: Icon.Gate,
  },
  {
    no: "02",
    title: "Active OT/IT Telemetry",
    body: "Lightweight SIEM correlates firmware and network events against physical QR check-ins. No scan, no window — any change is an anomaly.",
    icon: Icon.Pulse,
  },
  {
    no: "03",
    title: "Automated Forensic RCA",
    body: "One-click investigation stitches Phase 1 and Phase 2 evidence into a root-cause report, executes node isolation and exports the official record.",
    icon: Icon.Forensic,
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { session, isReady, verifyMemberNRP, signInWithGoogle, signOut } = useSession();
  const [pending, setPending] = useState<"google" | "sprint" | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [modalStep, setModalStep] = useState<"VERIFY_SPRINT" | "PENDING_NOTICE">("VERIFY_SPRINT");

  // Sprint / Nomor Pasukan Verification States (User Lama setelah login Google)
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [sprintInput, setSprintInput] = useState("");
  const [sprintError, setSprintError] = useState<string | null>(null);
  const [sprintSuccessText, setSprintSuccessText] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [approvalStatusMsg, setApprovalStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth")) return;
    }
    if (isReady && session) {
      router.replace("/dashboard");
    }
  }, [isReady, session, router]);

  // Check URL query parameters on return from Google Auth Callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authAction = params.get("auth");
    const emailParam = params.get("email");

    if (authAction === "verify_sprint" && emailParam) {
      fetch(`/api/auth/officer?email=${encodeURIComponent(emailParam)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.exists && data.officer) {
            setSelectedOfficer(data.officer);
            setShowAuthModal(true);
            setSprintInput("");
            setSprintError(null);
            setSprintSuccessText(null);
            if (data.officer.status === "PENDING") {
              setModalStep("PENDING_NOTICE");
            } else {
              setModalStep("VERIFY_SPRINT");
            }
          }
        })
        .catch(console.error);
    }
  }, []);

  const handleGoogleSignInClick = async () => {
    setPending("google");
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      alert("Gagal menginisiasi Supabase Google Auth: " + (err?.message || ""));
      setPending(null);
    }
  };

  const handleVerifySprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficer || !sprintInput.trim()) return;

    setPending("sprint");
    setSprintError(null);
    setSprintSuccessText(null);

    const res = await verifyMemberNRP(selectedOfficer.email, sprintInput.trim());
    if (res.success) {
      setSprintSuccessText("✅ Nomor Pasukan / Sprint Valid! Membuka sesi Command Console...");
      setTimeout(() => {
        setShowAuthModal(false);
        router.push("/dashboard");
      }, 500);
    } else {
      setSprintError(res.error || "Nomor Pasukan / Sprint tidak cocok dengan identitas dinas.");
      setPending(null);
    }
  };

  const handleCheckApprovalStatus = async () => {
    if (!selectedOfficer?.email) return;
    setCheckingApproval(true);
    setApprovalStatusMsg("Memeriksa status persetujuan di basis data PostgreSQL...");

    try {
      const res = await fetch(`/api/auth/officer?email=${encodeURIComponent(selectedOfficer.email)}`);
      const data = await res.json();
      if (data.exists && data.officer) {
        setSelectedOfficer(data.officer);
        if (data.officer.status === "APPROVED") {
          setApprovalStatusMsg("✅ Akun telah DISETUJUI oleh Super Admin! Silakan masukkan Nomor Pasukan.");
          setModalStep("VERIFY_SPRINT");
        } else if (data.officer.status === "REJECTED") {
          setApprovalStatusMsg("❌ Permohonan pendaftaran akun DITOLAK.");
        } else {
          setApprovalStatusMsg("⏳ Status masih MENUNGGU PERSETUJUAN (PENDING) dari Super Admin.");
        }
      }
    } catch (err) {
      setApprovalStatusMsg("Gagal menghubungi server database.");
    } finally {
      setCheckingApproval(false);
    }
  };



  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-radial" />
      <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-paper/[0.06] blur-[120px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-paper/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper/[0.04] to-transparent animate-scan" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
        <OzikLogo size={28} />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-paper" /> PUSSIBERAD · Kartika Cyber Hackathon 2026
          </span>
          <ThemeToggle id="landing-theme-toggle" />
          {isReady && session && session.user?.status === "APPROVED" ? (
            <Button id="nav-open-console" variant="primary" size="sm" onClick={() => router.push("/dashboard")} icon={<Icon.Arrow size={14} />}>
              Open Console ({session.user.name.split(" ")[0]})
            </Button>
          ) : (
            <Button id="nav-google-signin" variant="primary" size="sm" onClick={handleGoogleSignInClick} loading={pending === "google"} icon={<Icon.Google size={14} />}>
              Sign In with Google
            </Button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16 md:px-10">
        <div className="flex flex-col items-start gap-7">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 border border-line-strong bg-surface/80 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.16em] text-paper backdrop-blur">
              <span className="h-1.5 w-1.5 animate-blink bg-paper" />
              [ZERO-TRUST IT/OT SUPPLY-CHAIN &amp; LIGHTWEIGHT SIEM]
            </span>
          </div>

          <h1
            className="max-w-4xl text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] animate-fade-up sm:text-6xl md:text-[80px]"
            style={{ animationDelay: "80ms" }}
          >
            End-to-End Physical-to-Cyber
            <br />
            <span className="bg-gradient-to-b from-paper to-paper/40 bg-clip-text text-transparent">Asset Integrity.</span>
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-muted animate-fade-up md:text-lg" style={{ animationDelay: "160ms" }}>
            Three phases, one chain of custody. <span className="text-paper">Supply-Chain Gatekeeper</span> seals every asset before deployment,{" "}
            <span className="text-paper">QR Maintenance SIEM</span> binds physical access to cyber events, and{" "}
            <span className="text-paper">AI Digital Forensics</span> reconstructs every incident automatically.
          </p>

          <div className="flex flex-wrap items-center gap-3 animate-fade-up" style={{ animationDelay: "240ms" }}>
            <Button id="hero-google-oauth" variant="primary" size="lg" onClick={handleGoogleSignInClick} loading={pending === "google"} icon={<Icon.Google size={16} />}>
              Masuk dengan Akun Google
            </Button>
            <Button
              id="hero-register-new"
              variant="outline"
              size="lg"
              onClick={() => router.push("/onboarding")}
              icon={<Icon.Arrow size={14} />}
            >
              ⚡ Daftar Personel Baru (Isi No. Pasukan)
            </Button>
          </div>

          <p className="font-mono text-[10.5px] tracking-wide text-subtle animate-fade-up" style={{ animationDelay: "300ms" }}>
            Otentikasi Zero-Trust: Akun Google wajib dilanjutkan dengan Nomor Pasukan / Sprint. Personel baru wajib diapprove Super Admin sebelum akses dibuka.
          </p>
        </div>

        {/* Architecture strip */}
        <div className="mt-16 grid grid-cols-1 border border-line bg-surface/70 backdrop-blur md:grid-cols-3">
          {PHASES.map((p, i) => (
            <article
              key={p.no}
              className="group relative flex flex-col gap-4 border-line p-6 transition-colors duration-300 hover:bg-paper hover:text-ink animate-fade-up md:border-l first:md:border-l-0 [&:not(:first-child)]:border-t md:[&:not(:first-child)]:border-t-0"
              style={{ animationDelay: `${360 + i * 90}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.2em] text-muted group-hover:text-ink/60">PHASE {p.no}</span>
                <p.icon size={18} />
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight">
                {p.no}. {p.title}
              </h3>
              <p className="text-[13px] leading-relaxed text-muted group-hover:text-ink/70">{p.body}</p>
              <Icon.Arrow size={14} className="mt-auto opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
            </article>
          ))}
        </div>
      </main>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-2 border-t border-line px-6 py-4 font-mono text-[10.5px] tracking-[0.14em] text-subtle md:flex-row md:px-10">
        <Eyebrow className="text-subtle">© OZIKRA · Air-Gapped Ready Architecture</Eyebrow>
        <span>SHA-256 LEDGER · HMAC QR SEAL · SUMOPOD AI GATEWAY</span>
      </footer>

      {/* Post-Google Authentication Modal: Verifikasi Nomor Pasukan / Sprint */}
      {showAuthModal && selectedOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative flex w-full max-w-lg flex-col border border-line-strong bg-ink p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <Icon.Shield size={18} className="text-paper" />
                <div>
                  <span className="font-mono text-xs font-bold tracking-wider text-paper block">
                    {modalStep === "VERIFY_SPRINT" && "VERIFIKASI NOMOR PASUKAN / SPRINT // LANGKAH 2/2"}
                    {modalStep === "PENDING_NOTICE" && "STATUS: PENDING SUPER ADMIN APPROVAL"}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {modalStep === "VERIFY_SPRINT" && "Otentikasi lapis kedua khusus perwira militer aktif setelah login Google"}
                    {modalStep === "PENDING_NOTICE" && "Akses Command Console diblokir sampai disetujui"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="font-mono text-xs text-muted hover:text-paper"
              >
                [TUTUP / ESC]
              </button>
            </div>

            {/* STEP 2: VERIFIKASI NOMOR PASUKAN / SPRINT (UNTUK USER LAMA) */}
            {modalStep === "VERIFY_SPRINT" && (
              <div className="flex flex-col gap-4 pt-3">
                {/* Officer Google Verified Info */}
                <div className="border border-line bg-surface-2 p-3.5 font-mono text-xs space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    Akun Google Terautentikasi:
                  </div>
                  <div className="font-bold text-paper text-sm">{selectedOfficer.name}</div>
                  <div className="text-[11px] text-muted">{selectedOfficer.email}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="border border-line px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-paper">
                      {selectedOfficer.rank || "Perwira"}
                    </span>
                    <span className="border border-line px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-paper">
                      {selectedOfficer.role}
                    </span>
                    <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-emerald-400">
                      STATUS: APPROVED
                    </span>
                  </div>
                </div>

                {/* Form Input Nomor Pasukan / Sprint */}
                <form onSubmit={handleVerifySprintSubmit} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10.5px] uppercase tracking-wider text-paper font-semibold">
                      Nomor Pasukan / Sprint (Surat Perintah):
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSprintInput(selectedOfficer.nrp || "11050182740981")}
                      className="text-[10.5px] border-paper/40 hover:bg-paper hover:text-ink"
                    >
                      ⚡ Auto-Fill No. Pasukan ({selectedOfficer.nrp})
                    </Button>
                  </div>

                  <Input
                    type="text"
                    placeholder="Masukkan Nomor Pasukan / Sprint Anda"
                    className="font-mono text-sm tracking-wider"
                    value={sprintInput}
                    onChange={(e) => setSprintInput(e.target.value)}
                    required
                    autoFocus
                  />

                  {sprintError && (
                    <div className="flex items-center gap-2 border border-red-500/40 bg-red-950/40 p-2.5 font-mono text-[11px] text-red-200">
                      <Icon.Alert size={14} className="text-red-400 shrink-0" />
                      <span>{sprintError}</span>
                    </div>
                  )}

                  {sprintSuccessText && (
                    <div className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-950/40 p-2.5 font-mono text-[11px] text-emerald-200">
                      <span className="h-1.5 w-1.5 animate-pulse bg-emerald-400" />
                      <span>{sprintSuccessText}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        setShowAuthModal(false);
                        signOut();
                      }}
                      className="text-xs text-muted"
                    >
                      Keluar Akun Google
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={pending === "sprint"}
                      disabled={!sprintInput.trim()}
                      icon={<Icon.Arrow size={14} />}
                      className="flex-1 justify-center"
                    >
                      Verifikasi &amp; Buka Command Console
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* PENDING APPROVAL NOTICE */}
            {modalStep === "PENDING_NOTICE" && (
              <div className="flex flex-col gap-4 pt-3">
                <div className="border border-yellow-500/40 bg-yellow-950/20 p-4 font-mono text-xs space-y-2">
                  <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs uppercase">
                    <Icon.Alert size={16} />
                    PENDAFTARAN MENUNGGU PERSETUJUAN SUPER ADMIN
                  </div>
                  <div className="border-t border-line/60 pt-2 space-y-1.5 text-muted">
                    <div>Nama: <strong className="text-paper">{selectedOfficer.name}</strong></div>
                    <div>Email Google: <strong className="text-paper">{selectedOfficer.email}</strong></div>
                    <div>Nomor Pasukan / Sprint: <strong className="text-paper">{selectedOfficer.nrp}</strong></div>
                    <div>Status Akun: <span className="border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-yellow-400 text-[10px] font-bold">PENDING APPROVAL</span></div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted">
                  Sesuai doktrin Zero-Trust PUSSIBERAD, akses Command Console Anda saat ini <strong className="text-red-400">DIBLOKIR</strong> sampai disetujui (Approved) secara resmi oleh Markas Komando / Super Admin.
                </p>

                {approvalStatusMsg && (
                  <div className="flex items-center gap-2 border border-line bg-surface-2 p-3 font-mono text-xs text-paper">
                    <span>{approvalStatusMsg}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={checkingApproval}
                    onClick={handleCheckApprovalStatus}
                    className="border-paper/40 text-[11px] justify-center"
                  >
                    ⚡ Cek Status Persetujuan Real-Time
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await fetch("/api/admin/approve-officer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          officer_id: selectedOfficer.id,
                          approved_by: "Jenderal TNI (Purn) Okitr / Panglima Siber",
                        }),
                      });
                      if (res.ok) {
                        setSelectedOfficer({ ...selectedOfficer, status: "APPROVED" });
                        setModalStep("VERIFY_SPRINT");
                      }
                    }}
                    className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[11px] justify-center"
                  >
                    ⚡ Auto-Approve (Simulasi Super Admin)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAuthModal(false);
                      signOut();
                    }}
                    className="text-[11px] justify-center text-muted"
                  >
                    Tutup / Keluar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
