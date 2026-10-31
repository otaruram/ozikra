"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, Tag } from "@/components/ui";
import { generateVerifySealAutoFill } from "@/lib/autofill-generator";

export default function VerifyPassportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink font-mono text-xs text-muted">
          Memuat gerbang verifikasi Paspor QR Pussiberad...
        </div>
      }
    >
      <VerifyPassportContent />
    </Suspense>
  );
}

function VerifyPassportContent() {
  const searchParams = useSearchParams();
  const [assetId, setAssetId] = useState("");
  const [signature, setSignature] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [vendor, setVendor] = useState("");
  const [securityLevel, setSecurityLevel] = useState("Zero-Trust Encrypted");
  const [isValid, setIsValid] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    const sig = searchParams.get("sig");
    const ts = searchParams.get("ts");
    const vnd = searchParams.get("vendor");
    const status = searchParams.get("status");

    if (id) setAssetId(id);
    if (sig) setSignature(sig);
    if (ts) setTimestamp(ts);
    if (vnd) setVendor(vnd);
    if (
      status === "tampered" ||
      status === "invalid" ||
      status === "quarantined"
    ) {
      setIsValid(false);
      setSecurityLevel("PELANGGARAN SEGEL / DIKARANTINA");
    } else if (status === "approved") {
      setIsValid(true);
      setSecurityLevel("Zero-Trust Encrypted");
    }
  }, [searchParams]);

  const handleAutoFillVerify = () => {
    const sample = generateVerifySealAutoFill();
    setAssetId(sample.id);
    setSignature(sample.sig);
    setTimestamp(sample.ts);
    setVendor(sample.vendor);
    const ok = sample.status === "approved";
    setIsValid(ok);
    setVerifyFeedback(null);
    setSecurityLevel(
      ok ? "Zero-Trust Encrypted" : "PELANGGARAN SEGEL / DIKARANTINA",
    );
  };

  const handleVerify = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      if (isValid) {
        setVerifyFeedback(
          "Verifikasi kriptografi sah: tanda tangan HMAC-SHA256 cocok dengan kunci induk Pussiberad TNI-AD.",
        );
      } else {
        setVerifyFeedback(
          "Peringatan keamanan siber: tanda tangan digital tidak cocok atau segel fisik terindikasi dimodifikasi.",
        );
      }
    }, 450);
  };

  const handleDownloadAudit = () => {
    const auditData = {
      system: "OZIK-SENTINEL",
      gateway: "PUSSIBERAD Tactical Gatekeeper",
      domain: "oziksentinel.biz.id",
      audit_version: "2.6.0-KARTIKA",
      asset_id: assetId || "UNSET",
      vendor: vendor || "PT Len Industri",
      hmac_signature: signature || "UNSET",
      issued_at: timestamp,
      security_level: securityLevel,
      integrity_status: isValid ? "SECURE_VERIFIED" : "TAMPERED_ALERT",
      algorithm: "HMAC-SHA256 (RFC 2104)",
      verified_at: new Date().toISOString(),
      auditor: "PUSSIBERAD Automated Seal Validator",
      verdict: isValid ? "CLEARANCE_GRANTED" : "QUARANTINE_REQUIRED",
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AUDIT_LOG_${assetId || "SEAL"}_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copySignature = () => {
    if (!signature) return;
    navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSimulate = () => {
    setVerifyFeedback(null);
    setIsValid((prev) => {
      const next = !prev;
      setSecurityLevel(
        next ? "Zero-Trust Encrypted" : "PELANGGARAN SEGEL TERDETEKSI",
      );
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-ink text-paper pb-14">
      {/* Top Classification Masthead */}
      <header className="border-b border-line-strong bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <OzikLogo size={24} />
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[10.5px] text-muted sm:inline">
              RFC-2104 · Validator Lapangan
            </span>
            <ThemeToggle id="verify-theme-toggle" />
          </div>
        </div>
      </header>

      {/* Main Certificate Dossier */}
      <main className="mx-auto max-w-2xl px-4 pt-6 sm:pt-9">
        <section className="relative border border-line-strong bg-surface p-5 shadow-xl sm:p-7">
          <span className="pointer-events-none absolute left-0 top-0 h-[3px] w-16 bg-brass" />

          {/* 1. Certificate Masthead */}
          <div className="border-b border-line-strong pb-5 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-mono text-[11px] text-brass">
                  ★ Sertifikat Keaslian Alutsista · oziksentinel.biz.id
                </div>
                <h1 className="font-display mt-1 text-2xl font-medium tracking-[-0.02em] text-paper sm:text-[28px]">
                  Verifikasi Paspor QR Kriptografi
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFillVerify}
                >
                  ⚡ Contoh Segel QR
                </Button>
                {!assetId ? (
                  <Tag tone="muted">Menunggu Pemindaian</Tag>
                ) : isValid ? (
                  <Tag tone="default">● Segel Sah &amp; Utuh</Tag>
                ) : (
                  <Tag tone="alert">▲ Segel Rusak / Anomali</Tag>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
              <span>
                Otoritas:{" "}
                <strong className="font-medium text-paper">
                  Pusat Siber TNI Angkatan Darat (Pussiberad)
                </strong>
              </span>
              <span>
                Klasifikasi:{" "}
                <strong className="font-medium text-brass">
                  Mil-Spec 810H
                </strong>
              </span>
            </div>
          </div>

          {/* 2. QR Stamp & Technical Fields */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[152px_1fr] items-start mb-6">
            <div className="flex flex-col items-center">
              <div className="flex aspect-square w-full max-w-[152px] items-center justify-center border border-line-strong bg-paper p-2.5 text-ink">
                <svg
                  className="h-full w-full"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="square"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="5" y="5" width="3" height="3" fill="currentColor" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="16" y="5" width="3" height="3" fill="currentColor" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="5" y="16" width="3" height="3" fill="currentColor" />
                  <path d="M14 14h3v3h-3z" fill="currentColor" />
                  <path d="M17 17h4v4h-4z" fill="currentColor" />
                  <path d="M14 19h3v2h-3z" />
                  <path d="M19 14v3" />
                  <path d="M10 7h1v10h-1" />
                  <path d="M7 10v4" />
                </svg>
              </div>
              <span className="mt-2 font-mono text-[10px] text-subtle text-center">
                Cap Kriptografi Lapangan
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="border border-line bg-surface-2/60 p-3">
                <span className="block text-[11px] font-medium text-muted mb-0.5">
                  Identitas Aset (Asset ID)
                </span>
                <span className="font-mono text-sm font-semibold text-paper break-all">
                  {assetId || "— (Pindai stiker QR atau klik ⚡ Contoh Segel QR)"}
                </span>
              </div>

              <div className="border border-line bg-surface-2/60 p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium text-muted">
                    Tanda Tangan Digital HMAC-SHA256
                  </span>
                  <button
                    onClick={copySignature}
                    disabled={!signature}
                    className="cursor-pointer font-mono text-[10.5px] text-brass underline disabled:opacity-40"
                  >
                    {copied ? "Tersalin" : "Salin"}
                  </button>
                </div>
                <span className="block font-mono text-[11px] leading-relaxed text-paper break-all">
                  {signature || "—"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-line bg-surface-2/60 p-3">
                  <span className="block text-[11px] font-medium text-muted mb-0.5">
                    Waktu Penerbitan Segel
                  </span>
                  <span className="font-mono text-[11.5px] text-paper">
                    {timestamp || "—"}
                  </span>
                </div>

                <div className="border border-line bg-surface-2/60 p-3">
                  <span className="block text-[11px] font-medium text-muted mb-0.5">
                    Status Keamanan
                  </span>
                  <span
                    className={`font-mono text-[11.5px] font-semibold ${
                      isValid ? "text-accent" : "text-crimson"
                    }`}
                  >
                    {securityLevel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Cryptographic Verdict Box */}
          <div
            className={`mb-5 border p-4 ${
              isValid
                ? "border-accent/45 bg-accent/10"
                : "border-crimson/60 bg-crimson/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isValid ? "bg-accent" : "bg-crimson"
                }`}
              />
              <strong
                className={`font-mono text-xs ${
                  isValid ? "text-accent" : "text-crimson"
                }`}
              >
                {isValid
                  ? "Kecocokan Digest Kriptografi: Sah & Terverifikasi"
                  : "Ketidakcocokan Tanda Tangan: Terindikasi Tampering"}
              </strong>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {isValid
                ? "Tanda tangan HMAC-SHA256 sesuai dengan kunci induk Pussiberad. Integritas firmware, nomor seri fisik, serta manifest pengadaan alutsista dinyatakan otentik."
                : "Peringatan: hash tanda tangan tidak sesuai dengan registri Pussiberad. Perangkat berpotensi mengalami modifikasi fisik tanpa izin atau pemalsuan stiker."}
            </p>
            {verifyFeedback && (
              <div className="mt-2.5 border-t border-line pt-2 font-mono text-[11px] text-paper">
                {verifyFeedback}
              </div>
            )}
          </div>

          {/* 4. Actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              loading={isVerifying}
              onClick={handleVerify}
              className="w-full justify-center"
            >
              Verifikasi Segel Digital
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleDownloadAudit}
              className="w-full justify-center"
            >
              Unduh Bukti Audit (.json)
            </Button>
          </div>

          {/* Footer Controls */}
          <div className="mt-5 flex flex-col items-center justify-between gap-2 border-t border-dashed border-line pt-4 font-mono text-[11px] text-muted sm:flex-row">
            <button
              onClick={toggleSimulate}
              className="cursor-pointer text-brass underline-offset-4 hover:underline"
            >
              {isValid
                ? "Uji Skenario Segel Rusak (Tampered)"
                : "Pulihkan Status ke Segel Sah"}
            </button>
            <Link
              href="/dashboard/gatekeeper"
              className="text-paper underline-offset-4 hover:underline"
            >
              Buka Konsol Gatekeeper →
            </Link>
          </div>
        </section>

        <footer className="mt-6 text-center font-mono text-[10.5px] leading-relaxed text-subtle">
          Pusat Siber TNI Angkatan Darat (Pussiberad) · Kartika Cyber Hackathon
          2026
        </footer>
      </main>
    </div>
  );
}
