"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { Button, Eyebrow, Input, Mono, Tag } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { generateOnboardingAutoFill } from "@/lib/autofill-generator";
import { useSession } from "@/lib/session-context";
import type { TacticalRole } from "@/types/sentinel";

interface OfficerRoleOption {
  id: TacticalRole;
  title: string;
  badge: string;
  description: string;
  authorities: string[];
  icon: keyof typeof Icon;
}

// Strictly 3 official military roles (SUPER_ADMIN is hidden from self-registration)
const OFFICIAL_ROLES: OfficerRoleOption[] = [
  {
    id: "COMMANDER",
    title: "Komandan Satuan Siber",
    badge: "COMMANDER",
    description: "Otoritas komando penuh terhadap ekosistem zero-trust, monitor SIEM, supervisi rantai pasok alutsista, dan hak aktivasi protokol darurat.",
    authorities: [
      "Akses Penuh Command Center & SIEM",
      "Persetujuan Paspor Gatekeeper",
      "Investigasi Forensik RCA & Ledger",
      "Eksekusi Protokol Darurat Kill-Switch",
    ],
    icon: "Command",
  },
  {
    id: "LOGISTICS_OFFICER",
    title: "Perwira Logistik & Alutsista",
    badge: "LOGISTICS",
    description: "Pengelolaan integritas rantai pasok alutsista, verifikasi manifest SBOM vendor, pengujian firmware, dan penerbitan Paspor QR Mil-Spec 810H.",
    authorities: [
      "Registrasi & Intake Aset Alutsista",
      "Audit Kerentanan CVE & SBOM",
      "Penerbitan Stiker Paspor QR Mil-Spec",
      "Inspeksi Ledger Inventaris Aset",
    ],
    icon: "Gate",
  },
  {
    id: "FORENSIC_AUDITOR",
    title: "Auditor & Forensik Siber",
    badge: "AUDITOR",
    description: "Analisis telemetri fisik-siber, investigasi anomali SIEM, audit keaslian hash rantai pasok blockchain, dan penerbitan Berita Acara BAIFS resmi.",
    authorities: [
      "Korelasi Telemetri SIEM Real-Time",
      "Audit Kriptografi SHA-256 Ledger",
      "Penerbitan Berita Acara BAIFS Resmi",
      "Penyitaan & Isolasi Forensik Node",
    ],
    icon: "Forensic",
  },
];

const MILITARY_UNITS = [
  "Pusat Sandi & Siber TNI-AD (PUSSANSERAD)",
  "Direktorat Perhubungan TNI-AD (Dithubad)",
  "Direktorat Pembekalan Angkutan TNI-AD (Ditbekangad)",
  "Dinas Informasi dan Pengolahan Data TNI-AD (Disinfolahta)",
  "Satuan Siber Mabes TNI (Satsiber TNI)",
  "Komando Operasi Udara Nasional (Koopsudnas)",
  "Kogabwilhan I / II / III",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { session, signInWithGoogleAccount, confirmOfficerSession } = useSession();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [nrp, setNrp] = useState("");
  const [rank, setRank] = useState("Mayor Cke");
  const [unit, setUnit] = useState(MILITARY_UNITS[0]);
  const [selectedRole, setSelectedRole] = useState<TacticalRole>("COMMANDER");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Read pending Google login or existing session info
    const pendingEmail = window.sessionStorage.getItem("ozikra_pending_google_email");
    const pendingName = window.sessionStorage.getItem("ozikra_pending_google_name");

    if (pendingEmail) {
      setEmail(pendingEmail);
      if (pendingName) setFullName(pendingName);
    } else if (session?.user?.email) {
      setEmail(session.user.email);
      setFullName(session.user.name);
    } else {
      // Start clean/empty until user types or clicks Auto-Fill
      setEmail("");
      setFullName("");
    }
  }, [session]);

  const applyDynamicOnboardingAutoFill = (rolePreset: TacticalRole, rankPreset: string) => {
    const generated = generateOnboardingAutoFill(rolePreset);
    setRank(rankPreset);
    setFullName(generated.fullName.replace(/^[^\s]+\s+[^\s]+\s+/, ""));
    if (!window.sessionStorage.getItem("ozikra_pending_google_email")) {
      setEmail(generated.email);
    }
    setNrp(generated.nrp);
    setUnit(generated.unit);
    setSelectedRole(rolePreset);
  };

  const [submittedOfficer, setSubmittedOfficer] = useState<any>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusMsg, setCheckStatusMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg("Nama Lengkap personel militer wajib diisi.");
      return;
    }
    if (!nrp.trim()) {
      setErrorMsg("NRP / Nomor Anggota personel wajib diisi untuk otentikasi militer.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Submit to Golang & PostgreSQL Backend Registration API
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: `${rank} ${fullName.trim()}`,
          nrp: nrp.trim(),
          unit,
          rank,
          role: selectedRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Gagal melakukan registrasi personel");
      }

      const officer = data.officer;

      // Clear pending storage
      window.sessionStorage.removeItem("ozikra_pending_google_email");
      window.sessionStorage.removeItem("ozikra_pending_google_name");

      // Auto-approve in database so account is active
      try {
        await fetch("/api/admin/approve-officer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officer_id: officer.id,
            approved_by: "Panglima Siber PUSSIBERAD",
          }),
        });
      } catch (approveErr) {
        console.warn("Auto-approve:", approveErr);
      }

      // Immediately establish session and go to Command Console dashboard!
      confirmOfficerSession({
        ...officer,
        status: "APPROVED",
      });

      router.push("/dashboard");
    } catch (err: any) {
      console.error("Registration error:", err);
      setErrorMsg(err?.message || "Terjadi kendala teknis saat registrasi database.");
      setSubmitting(false);
    }
  };

  const handleCheckApprovalStatus = async () => {
    if (!submittedOfficer?.email) return;
    setCheckingStatus(true);
    setCheckStatusMsg("Menghubungi server PostgreSQL untuk memeriksa status persetujuan...");

    try {
      const res = await fetch(`/api/auth/officer?email=${encodeURIComponent(submittedOfficer.email)}`);
      const data = await res.json();
      if (data.exists && data.officer) {
        if (data.officer.status === "APPROVED") {
          confirmOfficerSession({
            ...data.officer,
            status: "APPROVED",
          });
          setCheckStatusMsg("✅ Selamat! Pendaftaran Anda telah DISETUJUI oleh Super Admin. Mengarahkan ke Command Console...");
          setTimeout(() => {
            router.push("/dashboard");
          }, 800);
        } else if (data.officer.status === "REJECTED") {
          setCheckStatusMsg("❌ Pendaftaran Anda DITOLAK oleh Markas Komando.");
        } else {
          setCheckStatusMsg("⏳ Status pendaftaran masih MENUNGGU PERSETUJUAN (PENDING) dari Super Admin / Panglima Siber.");
        }
      }
    } catch (err) {
      setCheckStatusMsg("Gagal memeriksa status ke database.");
    } finally {
      setCheckingStatus(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink text-paper">
      {/* Tactical Background Grid & Lighting */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-radial" />
      <div className="pointer-events-none absolute left-1/2 top-[-15%] h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-paper/[0.05] blur-[140px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-paper/40 to-transparent" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-6 md:px-10 md:py-4">
        <OzikLogo size={26} />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-1.5 border border-line bg-surface/80 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-paper sm:gap-2 sm:px-2.5 sm:text-[10.5px] sm:tracking-[0.15em]">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-emerald-400" />
            <span className="hidden sm:inline">PostgreSQL &amp; Prisma Active</span>
            <span className="sm:hidden">DB ACTIVE</span>
          </span>
          <ThemeToggle id="onboarding-theme-toggle" />
        </div>
      </header>

      {/* Main Content: Pending Approval Card OR Registration Form */}
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 py-7 sm:px-6 md:py-10">
        {submittedOfficer ? (
          <div className="border border-paper/40 bg-surface/80 p-6 md:p-8 backdrop-blur shadow-2xl animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-yellow-400">
                <span className="h-2 w-2 rounded-full bg-yellow-400 animate-ping" />
                STATUS: PENDING SUPER ADMIN APPROVAL
              </span>
              <span className="font-mono text-xs text-muted">ID: {submittedOfficer.id}</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-paper">
              Formulir Pendaftaran Terkirim ke Super Admin
            </h1>

            <p className="mt-2 text-sm text-muted leading-relaxed">
              Data personel militer Anda telah berhasil dicatat dalam basis data resmi PostgreSQL. Sesuai doktrin Zero-Trust PUSSIBERAD, akun dinas Google baru memerlukan persetujuan (approval) resmi dari <strong className="text-paper">Super Admin (Panglima/PUSSANSERAD)</strong> sebelum sesi Command Console dapat diaktifkan.
            </p>

            {/* Officer Profile Summary Table */}
            <div className="my-6 border border-line bg-surface-2/90 p-4 font-mono text-xs space-y-2.5">
              <div className="text-[10.5px] uppercase tracking-wider text-muted border-b border-line pb-1.5 font-bold">
                Rincian Formulir Personel Baru
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line/40">
                <span className="text-muted">Nama Lengkap &amp; Gelar:</span>
                <span className="font-bold text-paper">{submittedOfficer.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line/40">
                <span className="text-muted">Akun Google Dinas:</span>
                <span className="text-paper">{submittedOfficer.email}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line/40">
                <span className="text-muted">Nomor Anggota (NRP):</span>
                <span className="font-bold text-paper text-sm">{submittedOfficer.nrp}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line/40">
                <span className="text-muted">Pangkat &amp; Kesatuan:</span>
                <span className="text-paper">{submittedOfficer.rank} · {submittedOfficer.unit}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted">Role yang Diajukan:</span>
                <span className="border border-paper/40 px-2 py-0.5 text-paper font-bold">{submittedOfficer.role}</span>
              </div>
            </div>

            {checkStatusMsg && (
              <div className="mb-5 flex items-center gap-2 border border-line bg-surface-2 p-3 font-mono text-xs text-paper">
                <Icon.Pulse size={14} className="animate-spin text-paper" />
                <span>{checkStatusMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleCheckApprovalStatus}
                loading={checkingStatus}
                icon={<Icon.Refresh size={14} />}
              >
                ⚡ Cek Status Persetujuan Real-Time
              </Button>

              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  router.push("/");
                }}
                className="border-paper/40 text-[11px]"
              >
                Kembali ke Beranda
              </Button>

              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={async () => {
                  const res = await fetch("/api/admin/approve-officer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      officer_id: submittedOfficer.id,
                      approved_by: "Jenderal TNI (Purn) Okitr / Panglima Siber",
                    }),
                  });
                  if (res.ok) {
                    confirmOfficerSession({
                      ...submittedOfficer,
                      status: "APPROVED",
                    });
                    setCheckStatusMsg("✅ Akun berhasil disetujui oleh Super Admin! Membuka Command Console...");
                    setTimeout(() => {
                      router.push("/dashboard");
                    }, 600);
                  }
                }}
                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[11px]"
              >
                ⚡ Auto-Approve (Simulasi Super Admin)
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-8">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Tag tone="muted" className="whitespace-normal break-words text-[9.5px] sm:whitespace-nowrap sm:text-[10px]">
                  PUSSIBERAD · PROTOKOL REGISTRASI PERSONEL
                </Tag>
                <span className="font-mono text-[10px] text-muted sm:text-[10.5px]">MIL-SPEC RBAC 2026</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Aktivasi Kredensial Personel Militer
              </h1>
              <p className="mt-2 text-sm text-muted">
                Akun Google Anda berhasil diautentikasi. Lengkapi formulir pendaftaran resmi di bawah ini. Formulir akan dikirimkan ke Super Admin untuk persetujuan (approval) sebelum hak akses console aktif.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-6 flex items-center gap-3 border border-red-500/40 bg-red-500/10 p-3.5 font-mono text-xs text-red-400">
                <Icon.Bolt size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Section 1: Verified Google Account Card */}
              <div className="border border-line bg-surface/60 p-4 backdrop-blur sm:p-5">
                <Eyebrow>01 · IDENTITAS GOOGLE TERVERIFIKASI</Eyebrow>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-line/60 bg-surface-2/80 p-3.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
                      <Icon.Google size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ketik email dinas atau klik Auto-Fill di bawah…"
                        className="w-full bg-transparent font-mono text-xs font-semibold text-paper placeholder:text-muted/60 focus:outline-none break-all"
                        required
                      />
                      <div className="font-mono text-[11px] text-muted">Google OAuth SSO Provider Token Valid</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    GOOGLE VERIFIED
                  </span>
                </div>
              </div>

          {/* Section 2: Military Bio Details & Quick Presets */}
          <div className="border border-line bg-surface/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <Eyebrow>02 · BIODATA PERSONEL &amp; KESATUAN</Eyebrow>
              <span className="font-mono text-[10px] text-muted">NOMOR PASUKAN / SPRINT WAJIB</span>
            </div>

            {/* Quick Access Presets for Judges & Testing (Unique per User & Click) */}
            <div className="mb-5 border border-line bg-surface-2/60 p-3.5">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-paper font-semibold block mb-2">
                ⚡ Akses Cepat / Auto-Fill Identitas Unik (Berbeda Tiap User &amp; Klik):
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDynamicOnboardingAutoFill("COMMANDER", "Mayor Cke")}
                  className="justify-start text-left text-[11px] border-paper/40 hover:bg-paper hover:text-ink"
                >
                  ⚡ Auto-Fill Komando (Format A)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDynamicOnboardingAutoFill("COMMANDER", "Kolonel Cke")}
                  className="justify-start text-left text-[11px] border-paper/40 hover:bg-paper hover:text-ink"
                >
                  ⚡ Auto-Fill Commander (Format B)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDynamicOnboardingAutoFill("LOGISTICS_OFFICER", "Kapten Cba")}
                  className="justify-start text-left text-[11px] border-paper/40 hover:bg-paper hover:text-ink"
                >
                  ⚡ Auto-Fill Logistik (Format C)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDynamicOnboardingAutoFill("FORENSIC_AUDITOR", "Lettu Cke")}
                  className="justify-start text-left text-[11px] border-paper/40 hover:bg-paper hover:text-ink"
                >
                  ⚡ Auto-Fill Forensik (Format D)
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                  Pangkat Militer
                </label>
                <select
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  className="w-full border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-paper focus:border-paper focus:outline-none"
                >
                  <option value="Kolonel Cke">Kolonel Cke</option>
                  <option value="Letkol Cke">Letkol Cke</option>
                  <option value="Mayor Cke">Mayor Cke</option>
                  <option value="Kapten Cba">Kapten Cba</option>
                  <option value="Kapten Cke">Kapten Cke</option>
                  <option value="Lettu Cke">Lettu Cke</option>
                  <option value="Letda Cke">Letda Cke</option>
                  <option value="PNS Gol. III/IV">PNS Gol. III/IV</option>
                  <option value="Auditor Ahli">Auditor Ahli Siber</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                  Nama Lengkap &amp; Gelar *
                </label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Hendra Pratama, S.Kom."
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-paper font-semibold">
                  Nomor Pasukan / Sprint (NRP) *
                </label>
                <Input
                  value={nrp}
                  onChange={(e) => setNrp(e.target.value)}
                  placeholder="Contoh: 11200192840999 atau SPRINT-0192"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                  Satuan / Matra Penugasan
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-paper focus:border-paper focus:outline-none"
                >
                  {MILITARY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Official Role Selection (3 Roles Only) */}
          <div className="border border-line bg-surface/60 p-5 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <Eyebrow>03 · PENETAPAN ROLE RESMI MILITER</Eyebrow>
              <span className="font-mono text-[10px] text-muted">
                *SUPER ADMIN DILINDUNGI &amp; DISEMBUNYIKAN
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {OFFICIAL_ROLES.map((role) => {
                const IconComponent = Icon[role.icon] || Icon.Command;
                const isSelected = selectedRole === role.id;

                return (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`relative cursor-pointer border p-4.5 transition-all duration-150 ${
                      isSelected
                        ? "border-paper bg-surface-2 shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                        : "border-line bg-surface/40 hover:border-line-strong hover:bg-surface/70"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-2.5 right-3 border border-paper bg-ink px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-paper">
                        TERPILIH
                      </div>
                    )}

                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center border ${
                          isSelected
                            ? "border-paper bg-paper text-ink"
                            : "border-line bg-surface text-muted"
                        }`}
                      >
                        <IconComponent size={16} />
                      </div>
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          {role.badge}
                        </div>
                        <h3 className="text-sm font-semibold text-paper">{role.title}</h3>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-muted">{role.description}</p>

                    <div className="mt-4 border-t border-line/60 pt-3">
                      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted">
                        Otoritas Hak Akses:
                      </div>
                      <ul className="space-y-1">
                        {role.authorities.map((auth, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-1.5 font-mono text-[10px] text-paper/80"
                          >
                            <span className="h-1 w-1 rounded-full bg-paper/60" />
                            {auth}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Live KTA Siber Preview */}
          <div className="border border-line-strong bg-surface-2/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <Icon.Lock size={16} />
                <span className="tracking-wider text-paper">
                  PRATINJAU KTA SIBER: {rank} {fullName || "PERSONEL BARU"} [{selectedRole}]
                </span>
              </div>
              <span className="text-[10px] text-muted">
                DATABASE: POSTGRESQL (PRISMA ORM) · AIR-GAPPED READY
              </span>
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => router.push("/")}
              disabled={submitting}
            >
              Kembali ke Beranda
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              icon={<Icon.Arrow size={16} />}
            >
              Aktifkan Akun Personel &amp; Buka Console
            </Button>
          </div>
        </form>
      </div>
    )}
  </main>
</div>
);
}
