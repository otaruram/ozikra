"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, cn, Tag } from "@/components/ui";
import { useSession } from "@/lib/session-context";

interface GuideStep {
  id: string;
  phase: string;
  title: string;
  href: string;
  nextLabel: string;
  summary: string;
  howToTry: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: "command",
    phase: "Posko Utama",
    title: "Pusat Komando & Peta Mandala GIS",
    href: "/dashboard",
    nextLabel: "Fase I Gatekeeper",
    summary:
      "Layar utama untuk memantau kesiapan alutsista, arus telemetri siber langsung, dan titik gelar radar/server pertahanan se-NKRI.",
    howToTry:
      "Klik pin node pada Peta Mandala untuk melihat sensor suhu/tegangan, atau ganti jabatan kapan saja lewat tombol Peran di kanan atas tanpa ganti akun.",
  },
  {
    id: "gatekeeper",
    phase: "Fase I · Pra-Penempatan",
    title: "Supply-Chain Gatekeeper & Paspor QR",
    href: "/dashboard/gatekeeper",
    nextLabel: "Fase II Live SIEM",
    summary:
      "Mengaudit dokumen pengadaan & SBOM dengan AI untuk mendeteksi celah CVE sebelum perangkat dipasang, lalu menerbitkan segel Paspor QR kriptografi.",
    howToTry:
      "Tekan tombol ★ Auto-Fill di halaman ini — sistem otomatis mengisi data unik akun Anda dan menerbitkan kode QR yang bisa langsung di-scan kamera HP.",
  },
  {
    id: "siem",
    phase: "Fase II · Operasi Aktif",
    title: "Live SIEM & Jendela Servis Fisik QR",
    href: "/dashboard/siem",
    nextLabel: "Fase III Forensik AI",
    summary:
      "Mengikat akses fisik teknisi dengan aktivitas jaringan. Perubahan firmware tanpa scan QR resmi langsung ditandai sebagai anomali/sabotase.",
    howToTry:
      "Tekan tombol ★ Auto-Fill QR Check-In di kanan atas untuk menyimulasikan check-in teknisi lapangan dan melihat korelasi log telemetri real-time.",
  },
  {
    id: "forensics",
    phase: "Fase III · Tanggap Insiden",
    title: "AI Digital Forensics, Kill-Switch & BAIFS",
    href: "/dashboard/forensics",
    nextLabel: "Registri Aset IT/OT",
    summary:
      "Merekonstruksi kronologi serangan otomatis dengan AI (Root Cause Analysis), memutus node terinfeksi (Kill-Switch), dan mencetak dokumen hukum militer.",
    howToTry:
      "Pilih aset lalu klik Run AI Root Cause Analysis, kemudian klik Export Official Forensic Report untuk membuka lembar Berita Acara (BAIFS) resmi.",
  },
  {
    id: "assets",
    phase: "Inventaris & Kompartemen",
    title: "Registri Aset & Riwayat Terkunci Peran",
    href: "/dashboard/assets",
    nextLabel: "Buku Audit SHA-256",
    summary:
      "Menyimpan daftar aset unik milik workspace Anda beserta tabel Riwayat Gerakan di bagian bawah yang terisolasi ketat sesuai peran aktif.",
    howToTry:
      "Coba tekan ★ Auto-Fill & Tambah Aset Unik, lalu ganti Peran di header atas — riwayat kegiatan peran sebelumnya otomatis terkunci dari peran lain.",
  },
  {
    id: "ledger",
    phase: "Rantai Bukti Kriptografi",
    title: "Buku Audit SHA-256 Multi-Perspektif",
    href: "/dashboard/ledger",
    nextLabel: "Selesai",
    summary:
      "Seluruh aktivitas disegel dalam rantai blok SHA-256 anti-manipulasi dengan format dokumen khusus tiap jabatan (BAP-LOG, SPRIN, & BAP-SIBER).",
    howToTry:
      "Klik tombol Verify Hash-Chain untuk memvalidasi keutuhan matematis seluruh blok, atau unduh bukti surat perintah/BAP pada tiap kartu riwayat.",
  },
];

function getGuideSeenKey(email?: string | null) {
  return `ozikra.guide_seen_v1.${(email || "guest").toLowerCase().trim()}`;
}

export function openTacticalGuideTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ozikra:open-guide"));
  }
}

export function TacticalGuideTour({
  onVisibilityChange,
}: {
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, clearanceApproved } = useSession();

  const [mode, setMode] = useState<"CLOSED" | "WELCOME" | "TOUR">("CLOSED");
  const [stepIndex, setStepIndex] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const userEmail = session?.user?.email;

  useEffect(() => {
    onVisibilityChange?.(mode !== "CLOSED");
  }, [mode, onVisibilityChange]);

  // Auto-open for brand-new users or freshly registered personnel
  useEffect(() => {
    if (!userEmail || !clearanceApproved) return;
    if (typeof window === "undefined") return;

    const forceTrigger =
      window.sessionStorage.getItem("ozikra.trigger_new_user_tour") === "true";
    const alreadySeen =
      window.localStorage.getItem(getGuideSeenKey(userEmail)) === "true";

    if (forceTrigger || !alreadySeen) {
      window.sessionStorage.removeItem("ozikra.trigger_new_user_tour");
      setStepIndex(0);
      setMinimized(false);
      setMode("WELCOME");
    }
  }, [userEmail, clearanceApproved]);

  // Allow re-opening anytime from Header "Panduan" button
  useEffect(() => {
    const handleManualOpen = () => {
      const matchingIdx = GUIDE_STEPS.findIndex((s) => s.href === pathname);
      setStepIndex(matchingIdx >= 0 ? matchingIdx : 0);
      setMinimized(false);
      setMode("WELCOME");
    };
    window.addEventListener("ozikra:open-guide", handleManualOpen);
    return () =>
      window.removeEventListener("ozikra:open-guide", handleManualOpen);
  }, [pathname]);

  const markSeenAndClose = useCallback(() => {
    if (typeof window !== "undefined" && userEmail) {
      window.localStorage.setItem(getGuideSeenKey(userEmail), "true");
      window.sessionStorage.removeItem("ozikra.trigger_new_user_tour");
    }
    setMode("CLOSED");
    setMinimized(false);
  }, [userEmail]);

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, idx));
      const target = GUIDE_STEPS[clamped];
      setStepIndex(clamped);
      setMode("TOUR");
      if (pathname !== target.href) {
        router.push(target.href);
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [pathname, router],
  );

  if (mode === "CLOSED") return null;

  const step = GUIDE_STEPS[stepIndex];
  const isLastStep = stepIndex === GUIDE_STEPS.length - 1;

  // Compact minimized pill bar (especially handy on small mobile screens)
  if (mode === "TOUR" && minimized) {
    return (
      <aside
        aria-label="Panduan Konsol Terkecil"
        className="fixed inset-x-2.5 bottom-2.5 z-40 flex items-center justify-between gap-2 border-2 border-brass/75 bg-surface/98 px-3 py-2 shadow-2xl backdrop-blur-md sm:left-auto sm:right-6 sm:bottom-6 sm:w-[390px]"
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <span className="shrink-0 font-mono text-[10.5px] font-semibold text-brass">
            ★ {stepIndex + 1}/{GUIDE_STEPS.length}
          </span>
          <span className="truncate text-xs font-semibold text-paper">
            {step.title}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="cursor-pointer border border-line bg-surface-2 px-2 py-1 font-mono text-[10px] text-paper hover:border-brass"
          >
            Buka ▴
          </button>
          <Button
            size="sm"
            variant="primary"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => {
              if (isLastStep) markSeenAndClose();
              else goToStep(stepIndex + 1);
            }}
          >
            {isLastStep ? "Selesai ✓" : "Lanjut →"}
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Panduan Interaktif Ozik-Sentinel"
      className="fixed inset-x-2.5 bottom-2.5 z-40 flex max-h-[60dvh] flex-col overflow-y-auto border-2 border-brass/75 bg-surface/98 p-3.5 shadow-2xl backdrop-blur-md animate-fade-up sm:left-auto sm:right-6 sm:bottom-6 sm:max-h-[78dvh] sm:w-[435px] sm:p-4"
    >
      {/* Top Kartika accent hairline */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-brass" />

      {mode === "WELCOME" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag tone="brass">★ Briefing Operasi · User Baru</Tag>
              <span className="font-mono text-[10px] text-muted">
                6 Langkah · ±45 dtk
              </span>
            </div>
            <button
              id="guide-skip-top"
              type="button"
              onClick={markSeenAndClose}
              aria-label="Lewati panduan"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border border-line text-muted transition-colors hover:border-line-strong hover:text-paper"
            >
              <Icon.Close size={12} />
            </button>
          </div>

          <div>
            <h3 className="font-display text-lg font-medium leading-snug text-paper sm:text-[19px]">
              Selamat Datang di Konsol Ozik-Sentinel
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted sm:text-[13px]">
              Ikuti panduan singkat ini untuk{" "}
              <strong className="font-medium text-paper">
                berpindah halaman secara otomatis
              </strong>{" "}
              sambil melihat fungsi utama dan cara mencoba cepat tiap fitur (atau
              lewati kapan saja).
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            <Button
              id="guide-skip-welcome"
              type="button"
              size="sm"
              variant="ghost"
              onClick={markSeenAndClose}
              className="text-xs"
            >
              Lewati Panduan
            </Button>
            <Button
              id="guide-start-btn"
              type="button"
              size="sm"
              variant="primary"
              onClick={() => goToStep(0)}
              icon={<Icon.Arrow size={13} />}
              className="text-xs"
            >
              Ikuti Panduan Otomatis
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Header Bar: Step Counter + Minimize & Skip */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-semibold text-brass">
                ★ LANGKAH {stepIndex + 1} / {GUIDE_STEPS.length}
              </span>
              <Tag tone="muted" className="text-[10px]">
                {step.phase}
              </Tag>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                title="Perkecil kotak panduan"
                className="cursor-pointer border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-line-strong hover:text-paper"
              >
                Perkecil ▾
              </button>
              <button
                id="guide-skip-active"
                type="button"
                onClick={markSeenAndClose}
                title="Tutup & lewati panduan"
                className="cursor-pointer border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-crimson/50 hover:text-crimson"
              >
                Lewati ✕
              </button>
            </div>
          </div>

          {/* Clickable 6-Step Progress Rail */}
          <div className="grid grid-cols-6 gap-1">
            {GUIDE_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goToStep(idx)}
                aria-label={`Lompat ke langkah ${idx + 1}: ${s.title}`}
                className={cn(
                  "h-1.5 cursor-pointer transition-colors",
                  idx === stepIndex
                    ? "bg-brass"
                    : idx < stepIndex
                    ? "bg-accent"
                    : "bg-line-strong/60 hover:bg-muted",
                )}
              />
            ))}
          </div>

          {/* Step Title & Explanation */}
          <div className="flex flex-col gap-1.5">
            <h3 className="font-display text-[17px] font-medium leading-snug text-paper sm:text-[18px]">
              {step.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted sm:text-[12.5px]">
              {step.summary}
            </p>
          </div>

          {/* Actionable "Cara Coba Cepat" Box */}
          <div className="border border-accent/50 bg-accent/10 px-3 py-2 text-[11.5px] leading-relaxed text-paper">
            <span className="font-mono text-[10.5px] font-semibold text-accent">
              ★ Cara Coba:{" "}
            </span>
            <span>{step.howToTry}</span>
          </div>

          {/* Navigation Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
            <Button
              id="guide-prev-btn"
              type="button"
              size="sm"
              variant="outline"
              disabled={stepIndex === 0}
              onClick={() => goToStep(stepIndex - 1)}
              className="h-8 px-2.5 text-[11.5px]"
            >
              ← Kembali
            </Button>

            <Button
              id="guide-next-btn"
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                if (isLastStep) {
                  markSeenAndClose();
                } else {
                  goToStep(stepIndex + 1);
                }
              }}
              className="h-8 px-3 text-[11.5px]"
            >
              {isLastStep
                ? "Selesai & Mulai Operasi ✓"
                : `Lanjut: ${step.nextLabel} →`}
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
