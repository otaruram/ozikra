"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { Button, Input, Tag } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/lib/session-context";
import {
  hasOAuthCallbackParams,
  provisionAndConfirmGoogleOfficer,
  resolveGoogleOAuthUser,
} from "@/lib/supabase-browser";

type SpecimenKey = "PASSPORT" | "SIEM" | "BAIFS";

const DOCTRINE_LEDGER = [
  {
    numeral: "I",
    code: "Fase 01 · Pra-Penempatan",
    title: "Supply-Chain Gatekeeper & Segel Paspor QR",
    summary:
      "Agen multimodal mengaudit dokumen manifest pengadaan serta CycloneDX/SPDX SBOM vendor sebelum perangkat masuk jaringan. Setiap perangkat yang lolos menerima tanda tangan HMAC-SHA256 pada Paspor QR fisik berstandar lapangan.",
    artifact: "RFC-2104 HMAC Seal",
    unit: "Logistik & Siber",
  },
  {
    numeral: "II",
    code: "Fase 02 · Pengawasan Aktif",
    title: "Korelasi Fisik-Siber & SIEM Ringan OT/IT",
    summary:
      "Perubahan konfigurasi jaringan atau firmware pada radar, radio taktis, maupun sensor gudang munisi dikorelasikan langsung terhadap pemindaian QR teknisi di lokasi. Tanpa jendela pemeliharaan sah, mutasi diklasifikasikan sebagai anomali.",
    artifact: "Zero-Window Lock",
    unit: "Posko Komando C2",
  },
  {
    numeral: "III",
    code: "Fase 03 · Respons & Bukti Hukum",
    title: "Forensik Digital Otomatis & Berkas BAIFS",
    summary:
      "Investigasi satu klik menyatukan bukti rantai pasok Fase I dengan log telemetri Fase II ke dalam rantai blok SHA-256 yang tak dapat diubah, mengeksekusi isolasi node (Kill-Switch), dan menerbitkan Berita Acara BAIFS resmi.",
    artifact: "Rantai Blok SHA-256",
    unit: "Auditor Forensik",
  },
] as const;

export default function LandingPage() {
  const router = useRouter();
  const {
    session,
    isReady,
    verifyMemberNRP,
    confirmOfficerSession,
    signInWithGoogle,
    signOut,
  } = useSession();

  const [pending, setPending] = useState<"google" | "sprint" | null>(null);
  const [specimen, setSpecimen] = useState<SpecimenKey>("PASSPORT");
  const [wibClock, setWibClock] = useState<string>("— WIB");

  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(
    "Memproses otentikasi Google OAuth...",
  );
  const oauthHandledRef = useRef(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [modalStep, setModalStep] = useState<"VERIFY_SPRINT" | "PENDING_NOTICE">(
    "VERIFY_SPRINT",
  );
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [sprintInput, setSprintInput] = useState("");
  const [sprintError, setSprintError] = useState<string | null>(null);
  const [sprintSuccessText, setSprintSuccessText] = useState<string | null>(
    null,
  );
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [approvalStatusMsg, setApprovalStatusMsg] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const tick = () =>
      setWibClock(
        new Date().toLocaleTimeString("en-GB", {
          hour12: false,
          timeZone: "Asia/Jakarta",
        }) + " WIB",
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Catch Supabase Google OAuth redirects landing on root "/" (#access_token=... or ?code=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasOAuthCallbackParams()) return;
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;

    setIsProcessingOAuth(true);
    setOauthStatus(
      "Memverifikasi sesi Google SSO & menyiapkan Konsol Komando...",
    );

    (async () => {
      try {
        const googleUser = await resolveGoogleOAuthUser();
        if (googleUser) {
          setOauthStatus(
            `Identitas ${googleUser.email} terverifikasi. Membuka Command Center...`,
          );
          const officer = await provisionAndConfirmGoogleOfficer(googleUser);
          confirmOfficerSession(officer);
          window.history.replaceState(null, "", "/");
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("Root Google OAuth callback error:", err);
      }
      setIsProcessingOAuth(false);
    })();
  }, [confirmOfficerSession, router]);

  useEffect(() => {
    if (isProcessingOAuth) return;
    if (typeof window !== "undefined") {
      if (hasOAuthCallbackParams()) return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth")) return;
    }
    if (isReady && session) {
      router.replace("/dashboard");
    }
  }, [isReady, session, isProcessingOAuth, router]);

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
            setModalStep(
              data.officer.status === "PENDING"
                ? "PENDING_NOTICE"
                : "VERIFY_SPRINT",
            );
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
      alert("Gagal menginisiasi Google Auth: " + (err?.message || ""));
      setPending(null);
    }
  };

  const handleVerifySprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficer || !sprintInput.trim()) return;

    setPending("sprint");
    setSprintError(null);
    setSprintSuccessText(null);

    const res = await verifyMemberNRP(
      selectedOfficer.email,
      sprintInput.trim(),
    );
    if (res.success) {
      setSprintSuccessText(
        "Nomor Pasukan / Sprin terverifikasi. Membuka Konsol Komando...",
      );
      setTimeout(() => {
        setShowAuthModal(false);
        router.push("/dashboard");
      }, 450);
    } else {
      setSprintError(
        res.error || "Nomor Pasukan / Sprin tidak sesuai dengan arsip dinas.",
      );
      setPending(null);
    }
  };

  const handleCheckApprovalStatus = async () => {
    if (!selectedOfficer?.email) return;
    setCheckingApproval(true);
    setApprovalStatusMsg(
      "Memeriksa status persetujuan pada basis data PostgreSQL...",
    );

    try {
      const res = await fetch(
        `/api/auth/officer?email=${encodeURIComponent(selectedOfficer.email)}`,
      );
      const data = await res.json();
      if (data.exists && data.officer) {
        setSelectedOfficer(data.officer);
        if (data.officer.status === "APPROVED") {
          setApprovalStatusMsg(
            "Akun telah disetujui. Silakan masukkan Nomor Pasukan / Sprin.",
          );
          setModalStep("VERIFY_SPRINT");
        } else if (data.officer.status === "REJECTED") {
          setApprovalStatusMsg("Permohonan pendaftaran akun ditolak.");
        } else {
          setApprovalStatusMsg("Status masih menunggu persetujuan Super Admin.");
        }
      }
    } catch {
      setApprovalStatusMsg("Gagal menghubungi server basis data.");
    } finally {
      setCheckingApproval(false);
    }
  };

  if (isProcessingOAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-paper">
        <div className="relative flex max-w-md flex-col items-center gap-4 border border-line-strong bg-surface p-8 shadow-2xl">
          <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-14 bg-brass" />
          <div className="flex h-11 w-11 items-center justify-center border border-accent/50 bg-accent/10 text-accent animate-spin">
            <Icon.Pulse size={20} />
          </div>
          <div className="font-display text-lg font-medium text-paper text-center">
            Otentikasi Tunggal Google · Pussiberad
          </div>
          <div className="font-mono text-xs text-muted text-center">
            {oauthStatus}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-ink text-paper">
      {/* Subtle Kartika Topographic Coordinate Grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-radial opacity-75" />

      {/* Top Editorial Classification Ribbon */}
      <div className="relative z-10 border-b border-line bg-surface-2/65 px-4 py-1.5 sm:px-6 md:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
          <span className="flex items-center gap-2">
            <span className="text-brass">★</span>
            <span>
              Kartika Cyber Hackathon 2026 · Pusat Siber TNI Angkatan Darat
            </span>
          </span>
          <div className="hidden items-center gap-4 sm:flex">
            <span>oziksentinel.biz.id</span>
            <span className="text-subtle">|</span>
            <span className="tabular-nums text-paper">{wibClock}</span>
          </div>
        </div>
      </div>

      {/* Masthead Navigation */}
      <nav className="relative z-10 border-b border-line-strong bg-surface/80 backdrop-blur-md px-4 py-3.5 sm:px-6 md:px-10">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <OzikLogo size={28} />
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href="/verify"
              className="hidden items-center gap-1.5 border border-line bg-surface-2/60 px-3 py-1.5 font-mono text-[11px] text-muted transition-colors hover:border-brass hover:text-paper md:inline-flex"
            >
              <span>Cek Segel Paspor QR</span>
            </Link>
            <ThemeToggle id="landing-theme-toggle" />
            {isReady && session ? (
              <Button
                id="nav-open-console"
                variant="primary"
                size="sm"
                onClick={() => router.push("/dashboard")}
                icon={<Icon.Arrow size={14} />}
              >
                Buka Konsol ({session.user.name.split(" ")[0]})
              </Button>
            ) : (
              <Button
                id="nav-google-signin"
                variant="primary"
                size="sm"
                onClick={handleGoogleSignInClick}
                loading={pending === "google"}
                icon={<Icon.Google size={14} />}
              >
                Masuk Konsol
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content — Hallmark Asymmetric Split Hero + Editorial Doctrine Table */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 py-8 sm:px-6 md:px-10 md:py-12">
        {/* Section 1: Asymmetric Two-Column Hero (Fits Screen Cleanly) */}
        <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Editorial Column (7 cols) */}
          <div className="flex flex-col items-start gap-5 lg:col-span-7 lg:py-2 animate-fade-up">
            <div className="inline-flex flex-wrap items-center gap-2 border border-line-strong bg-surface px-3 py-1 font-mono text-[11px] text-muted">
              <span className="h-1.5 w-1.5 bg-accent" />
              <span>Doktrin Zero-Trust IT/OT · Seri Alutsista Matra Darat</span>
            </div>

            <h1 className="font-display max-w-[18ch] text-[36px] font-medium leading-[1.06] tracking-[-0.025em] text-paper sm:text-[52px] lg:text-[60px]">
              Integritas rantai pasok alutsista,{" "}
              <em className="font-normal italic text-brass">
                dari segel fisik hingga forensik siber.
              </em>
            </h1>

            <p className="max-w-[58ch] text-[15px] leading-[1.68] text-muted sm:text-[16px]">
              Menutup titik buta antara pemeliharaan fisik di lapangan dan
              telemetri jaringan militer.{" "}
              <strong className="font-medium text-paper">Ozik-Sentinel</strong>{" "}
              menyegel manifest SBOM pra-penempatan dengan Paspor QR
              kriptografi, mengunci jendela servis teknisi secara waktu nyata,
              dan menyusun berkas forensik BAIFS otomatis.
            </p>

            {/* Primary Task-Driven Actions */}
            <div className="flex w-full flex-col items-stretch gap-3 pt-1 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                id="hero-google-oauth"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={handleGoogleSignInClick}
                loading={pending === "google"}
                icon={<Icon.Google size={16} />}
              >
                Masuk dengan Akun Google
              </Button>
              <Button
                id="hero-register-new"
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => router.push("/onboarding")}
                icon={<Icon.Arrow size={14} />}
              >
                Registrasi Personel &amp; NRP Baru
              </Button>
            </div>

            {/* Cryptographic Provenance Factsheet Strip */}
            <div className="mt-2 grid w-full grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
              <div className="bg-surface px-3.5 py-2.5">
                <div className="font-mono text-[10.5px] text-subtle">
                  Standar Segel QR
                </div>
                <div className="mt-0.5 font-mono text-xs font-medium text-paper">
                  HMAC-SHA256 · RFC 2104
                </div>
              </div>
              <div className="bg-surface px-3.5 py-2.5">
                <div className="font-mono text-[10.5px] text-subtle">
                  Buku Audit Bukti
                </div>
                <div className="mt-0.5 font-mono text-xs font-medium text-paper">
                  Immutable Hash-Chain
                </div>
              </div>
              <div className="col-span-2 bg-surface px-3.5 py-2.5 sm:col-span-1">
                <div className="font-mono text-[10.5px] text-subtle">
                  Arsitektur Posko
                </div>
                <div className="mt-0.5 font-mono text-xs font-medium text-accent">
                  Cloud &amp; Air-Gapped Ready
                </div>
              </div>
            </div>
          </div>

          {/* Right Live Operational Specimen Column (5 cols) */}
          <div
            className="flex flex-col border border-line-strong bg-surface shadow-xl lg:col-span-5 animate-fade-up"
            style={{ animationDelay: "90ms" }}
          >
            {/* Specimen Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-brass" />
                <span className="font-mono text-[11px] font-medium text-paper">
                  Spesimen Berkas Operasional
                </span>
              </div>
              <Tag tone="default">Posko Pussiberad</Tag>
            </div>

            {/* Interactive Phase Selector Tabs */}
            <div className="grid grid-cols-3 border-b border-line bg-ink text-xs">
              {(
                [
                  { id: "PASSPORT", label: "I · Paspor QR" },
                  { id: "SIEM", label: "II · Log SIEM" },
                  { id: "BAIFS", label: "III · BAIFS" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSpecimen(tab.id)}
                  className={`cursor-pointer border-r border-line py-2.5 font-mono text-[11px] last:border-r-0 transition-colors ${
                    specimen === tab.id
                      ? "bg-accent text-accent-ink font-semibold"
                      : "text-muted hover:bg-surface-2 hover:text-paper"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Specimen Body — Real Functional Artifacts (No Placeholder Boxes) */}
            <div className="flex flex-col gap-3.5 p-4 sm:p-5">
              {specimen === "PASSPORT" && (
                <>
                  <div className="flex items-start justify-between gap-3 border border-line bg-surface-2/45 p-3.5">
                    <div className="space-y-1">
                      <div className="font-mono text-[10.5px] text-brass">
                        Sertifikat Alutsista · MIL-STD-810H
                      </div>
                      <div className="font-display text-lg font-medium text-paper">
                        Radar Avionik Taktis Unit-204
                      </div>
                      <div className="font-mono text-[11px] text-muted">
                        Vendor: PT Len Industri · Skor Kepercayaan: 98/100
                      </div>
                    </div>
                    {/* Crisp Vector QR Matrix Stamp */}
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-strong bg-paper p-1.5 text-ink">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-full w-full"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                      >
                        <rect x="3" y="3" width="7" height="7" />
                        <rect
                          x="5"
                          y="5"
                          width="3"
                          height="3"
                          fill="currentColor"
                        />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect
                          x="16"
                          y="5"
                          width="3"
                          height="3"
                          fill="currentColor"
                        />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect
                          x="5"
                          y="16"
                          width="3"
                          height="3"
                          fill="currentColor"
                        />
                        <path d="M14 14h3v3h-3z" fill="currentColor" />
                        <path d="M18 18h3v3h-3z" fill="currentColor" />
                        <path d="M14 19h2v2h-2z" />
                      </svg>
                    </div>
                  </div>
                  <pre className="overflow-x-auto border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-muted">
                    <span className="text-brass">
                      $ ozik-gatekeeper verify --asset AST-RADAR-204
                    </span>
                    {"\n"}sbom.format      : CycloneDX 1.5 (0 CVE Kritis)
                    {"\n"}hmac.rfc2104     : 9f4c8e21a0b7...d41e63b9
                    {"\n"}status.gerbang   :{" "}
                    <span className="text-accent font-semibold">
                      TERSEGEL &amp; SAH DITEMPATKAN
                    </span>
                  </pre>
                </>
              )}

              {specimen === "SIEM" && (
                <>
                  <div className="flex items-center justify-between border border-line bg-surface-2/45 px-3.5 py-2.5">
                    <div>
                      <div className="font-mono text-[10.5px] text-muted">
                        Korelasi Jendela Servis Fisik
                      </div>
                      <div className="font-display text-base font-medium text-paper">
                        Deteksi Mutasi Tanpa Scan Paspor QR
                      </div>
                    </div>
                    <Tag tone="alert">▲ Anomali</Tag>
                  </div>
                  <pre className="overflow-x-auto border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-muted">
                    <span className="text-brass">
                      $ tail -n 4 /var/pussiberad/siem-correlator.log
                    </span>
                    {"\n"}19:14:02 [FW ] AST-RADIO-318 · Mutasi hash bootloader
                    {"\n"}19:14:02 [QR ] Jendela teknisi: CLOSED (0 pemindaian)
                    {"\n"}19:14:03 [C2 ] Putusan:{" "}
                    <span className="text-crimson font-semibold">
                      UNAUTHORIZED_PHYSICAL_TAMPER
                    </span>
                    {"\n"}19:14:03 [LED] Blok #0042 ditautkan ke rantai SHA-256
                  </pre>
                </>
              )}

              {specimen === "BAIFS" && (
                <>
                  <div className="flex items-center justify-between border border-line bg-surface-2/45 px-3.5 py-2.5">
                    <div>
                      <div className="font-mono text-[10.5px] text-brass">
                        Berita Acara Investigasi Forensik Siber
                      </div>
                      <div className="font-display text-base font-medium text-paper">
                        Isolasi Node &amp; Ekspor Bukti Hukum PDF
                      </div>
                    </div>
                    <Tag tone="brass">BAIFS Resmi</Tag>
                  </div>
                  <pre className="overflow-x-auto border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-muted">
                    <span className="text-brass">
                      $ ozik-forensics rca --isolate AST-RADIO-318
                    </span>
                    {"\n"}fase_1.manifest  : Cocok (Segel PT Len utuh)
                    {"\n"}fase_2.vektor    : Injeksi UART fisik tanpa Sprin QR
                    {"\n"}tindakan.c2      :{" "}
                    <span className="text-accent font-semibold">
                      NODE_QUARANTINED · BERKAS_PDF_SIAP
                    </span>
                  </pre>
                </>
              )}

              <div className="flex items-center justify-between border-t border-line pt-2.5 font-mono text-[11px]">
                <span className="text-subtle">
                  Domain verifikasi: oziksentinel.biz.id
                </span>
                <Link
                  href="/verify"
                  className="font-medium text-brass underline-offset-4 hover:underline"
                >
                  Uji Validator QR →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Editorial Double Hairline Divider */}
        <div className="dossier-rule my-10 md:my-14" />

        {/* Section 2: Hallmark Editorial Doctrine Index (No 3-Column Icon-Card Slop) */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <span className="font-mono text-[11px] text-brass">
                Arsitektur Rantai Bukti Tunggal
              </span>
              <h2 className="font-display mt-1 text-2xl font-medium tracking-[-0.02em] text-paper sm:text-[30px]">
                Tiga tahapan pengamanan fisik-ke-siber dalam satu buku besar.
              </h2>
            </div>
            <span className="font-mono text-[11px] text-muted">
              Kompartemen Peran: Logistik · Komando · Forensik
            </span>
          </div>

          <div className="mt-2 border-t border-line-strong">
            {DOCTRINE_LEDGER.map((row) => (
              <article
                key={row.numeral}
                className="group grid grid-cols-1 gap-3 border-b border-line py-5 transition-colors hover:bg-surface/65 sm:px-3 md:grid-cols-12 md:items-baseline md:gap-6 md:py-6"
              >
                <div className="flex items-baseline gap-3 md:col-span-2">
                  <span className="font-display text-2xl italic text-brass md:text-3xl">
                    {row.numeral}.
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {row.code}
                  </span>
                </div>

                <div className="md:col-span-3">
                  <h3 className="font-display text-[19px] font-medium leading-snug text-paper">
                    {row.title}
                  </h3>
                  <span className="mt-1 inline-block font-mono text-[10.5px] text-subtle">
                    Otoritas: {row.unit}
                  </span>
                </div>

                <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted md:col-span-5">
                  {row.summary}
                </p>

                <div className="flex items-center md:col-span-2 md:justify-end">
                  <Tag tone="default">{row.artifact}</Tag>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {/* Editorial Colophon Footer */}
      <footer className="relative z-10 border-t border-line-strong bg-surface/75 px-4 py-5 sm:px-6 md:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-3 text-xs text-muted sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-brass">★</span>
            <span className="font-display text-sm font-medium text-paper">
              Kartika Eka Paksi
            </span>
            <span className="text-subtle">—</span>
            <span>
              Ozik-Sentinel · Pusat Siber TNI Angkatan Darat (Pussiberad)
            </span>
          </div>
          <span className="font-mono text-[11px] text-subtle">
            SHA-256 Ledger · Paspor QR HMAC · Air-Gapped Ready
          </span>
        </div>
      </footer>

      {/* Legacy Sprint Verification Modal */}
      {showAuthModal && selectedOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-md">
          <div className="relative flex w-full max-w-lg flex-col border border-line-strong bg-surface p-6 shadow-2xl">
            <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-14 bg-brass" />
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <Icon.Shield size={18} className="text-brass" />
                <div>
                  <span className="font-display text-base font-medium text-paper block">
                    {modalStep === "VERIFY_SPRINT"
                      ? "Verifikasi Nomor Pasukan / Sprin"
                      : "Menunggu Persetujuan Markas Komando"}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted">
                    Otentikasi perwira siber TNI-AD
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="font-mono text-xs text-muted hover:text-paper"
              >
                [Tutup]
              </button>
            </div>

            {modalStep === "VERIFY_SPRINT" && (
              <div className="flex flex-col gap-4 pt-4">
                <div className="border border-line bg-surface-2 p-3.5 font-mono text-xs space-y-1.5">
                  <div className="text-[10.5px] text-muted">
                    Identitas Google Terverifikasi:
                  </div>
                  <div className="font-semibold text-paper text-sm">
                    {selectedOfficer.name}
                  </div>
                  <div className="text-[11px] text-muted">
                    {selectedOfficer.email}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Tag tone="muted">{selectedOfficer.rank || "Perwira"}</Tag>
                    <Tag tone="brass">{selectedOfficer.role}</Tag>
                    <Tag tone="default">Disetujui</Tag>
                  </div>
                </div>

                <form
                  onSubmit={handleVerifySprintSubmit}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted">
                      Nomor Pasukan / Sprin:
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSprintInput(selectedOfficer.nrp || "11050182740981")
                      }
                    >
                      ⚡ Isi Otomatis ({selectedOfficer.nrp})
                    </Button>
                  </div>

                  <Input
                    type="text"
                    placeholder="Masukkan Nomor Pasukan / Sprin Anda"
                    className="font-mono text-sm"
                    value={sprintInput}
                    onChange={(e) => setSprintInput(e.target.value)}
                    required
                    autoFocus
                  />

                  {sprintError && (
                    <div className="flex items-center gap-2 border border-crimson/60 bg-crimson/12 p-2.5 font-mono text-[11px] text-paper">
                      <Icon.Alert size={14} className="text-crimson shrink-0" />
                      <span>{sprintError}</span>
                    </div>
                  )}

                  {sprintSuccessText && (
                    <div className="flex items-center gap-2 border border-accent/60 bg-accent/12 p-2.5 font-mono text-[11px] text-paper">
                      <span className="h-1.5 w-1.5 animate-pulse bg-accent" />
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
                        void signOut();
                      }}
                    >
                      Keluar
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
                      Verifikasi &amp; Buka Konsol
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {modalStep === "PENDING_NOTICE" && (
              <div className="flex flex-col gap-4 pt-4">
                <div className="border border-brass/50 bg-brass/10 p-4 font-mono text-xs space-y-2">
                  <div className="flex items-center gap-2 text-brass font-semibold">
                    <Icon.Alert size={16} />
                    Menunggu Persetujuan Super Admin
                  </div>
                  <div className="border-t border-line pt-2 space-y-1 text-muted">
                    <div>
                      Nama:{" "}
                      <strong className="text-paper">
                        {selectedOfficer.name}
                      </strong>
                    </div>
                    <div>
                      Email:{" "}
                      <strong className="text-paper">
                        {selectedOfficer.email}
                      </strong>
                    </div>
                    <div>
                      NRP / Sprin:{" "}
                      <strong className="text-paper">
                        {selectedOfficer.nrp}
                      </strong>
                    </div>
                  </div>
                </div>

                {approvalStatusMsg && (
                  <div className="border border-line bg-surface-2 p-3 font-mono text-xs text-paper">
                    {approvalStatusMsg}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={checkingApproval}
                    onClick={handleCheckApprovalStatus}
                  >
                    Cek Status Persetujuan
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
                          approved_by: "Panglima Siber Pussiberad",
                        }),
                      });
                      if (res.ok) {
                        setSelectedOfficer({
                          ...selectedOfficer,
                          status: "APPROVED",
                        });
                        setModalStep("VERIFY_SPRINT");
                      }
                    }}
                  >
                    ⚡ Setujui Otomatis (Simulasi Super Admin)
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
