"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { generateVerifySealAutoFill } from "@/lib/autofill-generator";

export default function VerifyPassportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center font-mono text-xs text-zinc-600">
          LOADING TACTICAL VERIFICATION GATEWAY...
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
    if (status === "tampered" || status === "invalid" || status === "quarantined") {
      setIsValid(false);
      setSecurityLevel("SECURITY BREACH / QUARANTINED");
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
    setSecurityLevel(ok ? "Zero-Trust Encrypted" : "SECURITY BREACH / QUARANTINED");
  };

  const handleVerify = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      if (isValid) {
        alert(
          "✓ VERIFIKASI BERHASIL:\nTanda tangan digital HMAC-SHA256 COCOK dengan master key PUSSIBERAD.\nStatus: SECURE / VERIFIED"
        );
      } else {
        alert(
          "⚠ PERINGATAN KEAMANAN SIBER:\nTanda tangan digital TIDAK COCOK atau segel fisik telah dimodifikasi!\nStatus: TAMPERED / UNAUTHORIZED"
        );
      }
    }, 600);
  };

  const handleDownloadAudit = () => {
    const auditData = {
      system: "OZIK-SENTINEL",
      gateway: "PUSSIBERAD Tactical Gatekeeper",
      domain: "oziksentinel.biz.id",
      audit_version: "2.5.0-MIL",
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
    a.download = `AUDIT_LOG_${assetId}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copySignature = () => {
    navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSimulate = () => {
    setIsValid((prev) => {
      const next = !prev;
      setSecurityLevel(next ? "Zero-Trust Encrypted" : "SECURITY BREACH DETECTED");
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-white text-zinc-950 font-sans antialiased selection:bg-zinc-950 selection:text-white pb-12">
      {/* Top Tactical Banner */}
      <header className="border-b-2 border-zinc-900 bg-zinc-950 text-white px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-[11px] font-mono tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isValid ? "bg-emerald-600 animate-pulse" : "bg-red-600 animate-ping"
              }`}
            />
            <span className="font-bold">PUSSIBERAD · TACTICAL GATEKEEPER</span>
          </div>
          <div className="text-zinc-400 text-[10px] hidden sm:block">
            MIL-SPEC RFC-2104 · ZERO-TRUST
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-6 sm:pt-8">
        <div className="border-2 border-zinc-900 bg-white p-5 sm:p-7 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] relative">
          {/* Tactical Crosshair Corners */}
          <span className="absolute -top-[2px] -left-[2px] w-3 h-3 border-t-2 border-l-2 border-zinc-900" />
          <span className="absolute -top-[2px] -right-[2px] w-3 h-3 border-t-2 border-r-2 border-zinc-900" />
          <span className="absolute -bottom-[2px] -left-[2px] w-3 h-3 border-b-2 border-l-2 border-zinc-900" />
          <span className="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b-2 border-r-2 border-zinc-900" />

          {/* 1. Header / Status Bar */}
          <div className="border-b-2 border-zinc-900 pb-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                  AUTHENTICATION GATEWAY // OZIKSENTINEL.BIZ.ID
                </div>
                <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-zinc-950 mt-0.5">
                  Tactical QR Passport Verification
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFillVerify}
                  className="border-2 border-zinc-900 bg-zinc-100 hover:bg-zinc-900 hover:text-white px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ⚡ Auto-Fill Sample QR Seal
                </button>
                {/* Dynamic Badge */}
                <div
                  className={`inline-flex items-center gap-2 border-2 px-3.5 py-1.5 self-start sm:self-center transition-colors ${
                    !assetId
                      ? "border-zinc-500 bg-zinc-100 text-zinc-700"
                      : isValid
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-red-600 bg-red-50 text-red-900"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      !assetId
                        ? "bg-zinc-500"
                        : isValid
                        ? "bg-emerald-600"
                        : "bg-red-600 animate-ping"
                    }`}
                  />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">
                    {!assetId
                      ? "AWAITING QR SCAN / AUTO-FILL"
                      : isValid
                      ? "SECURE / VERIFIED"
                      : "WARNING: UNVERIFIED / TAMPERED"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>
                INSTANSI:{" "}
                <strong className="text-zinc-950">
                  PUSAT SIBER TNI ANGKATAN DARAT
                </strong>
              </span>
              <span className="hidden sm:inline">
                SECURITY LEVEL:{" "}
                <strong className="text-zinc-950">TOP-SECRET / MIL</strong>
              </span>
            </div>
          </div>

          {/* 2. QR & Asset Details */}
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-6 items-start mb-6">
            {/* Tactical QR Representation */}
            <div className="flex flex-col items-center">
              <div className="border-2 border-zinc-900 p-2 bg-white relative w-full aspect-square max-w-[160px] flex items-center justify-center">
                <svg
                  className="w-full h-full text-zinc-950"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
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
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 mt-2 text-center">
                TACTICAL SEAL STAMP
              </span>
            </div>

            {/* Asset Metadata (Monospace) */}
            <div className="space-y-3.5 font-mono text-xs">
              <div className="border border-zinc-900 p-2.5 bg-zinc-50">
                <span className="block text-[10px] text-zinc-500 tracking-wider uppercase mb-0.5 font-sans font-semibold">
                  ASSET ID
                </span>
                <span className="font-bold text-sm tracking-tight text-zinc-950">
                  {assetId || "— (Scan QR atau klik ⚡ Auto-Fill Sample QR Seal)"}
                </span>
              </div>

              <div className="border border-zinc-900 p-2.5 bg-zinc-50">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-zinc-500 tracking-wider uppercase font-sans font-semibold">
                    HMAC-SHA256 SIGNATURE
                  </span>
                  <button
                    onClick={copySignature}
                    disabled={!signature}
                    className="text-[10px] uppercase underline text-zinc-950 hover:text-emerald-700 transition-colors disabled:opacity-40"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <span className="break-all text-[11px] font-semibold text-zinc-800 leading-relaxed block">
                  {signature || "—"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border border-zinc-900 p-2.5 bg-zinc-50">
                  <span className="block text-[10px] text-zinc-500 tracking-wider uppercase mb-0.5 font-sans font-semibold">
                    ISSUED TIMESTAMP
                  </span>
                  <span className="font-semibold text-[11.5px] text-zinc-950">
                    {timestamp || "—"}
                  </span>
                </div>

                <div className="border border-zinc-900 p-2.5 bg-zinc-50">
                  <span className="block text-[10px] text-zinc-500 tracking-wider uppercase mb-0.5 font-sans font-semibold">
                    SECURITY LEVEL
                  </span>
                  <span
                    className={`font-bold text-[11.5px] ${
                      isValid ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {securityLevel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Verification Report */}
          <div className="border-2 border-zinc-900 p-3.5 bg-zinc-50 mb-6 font-mono text-[11.5px]">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 inline-block ${
                  isValid ? "bg-emerald-600" : "bg-red-600"
                }`}
              />
              <strong
                className={`uppercase tracking-wider text-xs ${
                  isValid ? "text-zinc-950" : "text-red-700 font-bold"
                }`}
              >
                {isValid
                  ? "CRYPTOGRAPHIC DIGEST MATCH: VALID"
                  : "CRYPTOGRAPHIC SIGNATURE MISMATCH: TAMPERED!"}
              </strong>
            </div>
            <p className="text-zinc-600 font-sans text-xs leading-relaxed">
              {isValid
                ? "Tanda tangan digital HMAC-SHA256 telah diverifikasi terhadap master key PUSSIBERAD. Integritas firmware, nomor seri fisik, dan manifest alutsista dinyatakan otentik dan belum dimodifikasi."
                : "PERINGATAN! Hash tanda tangan digital tidak cocok dengan registri PUSSIBERAD. Ada indikasi alutsista mengalami serangan fisik, tampering firmware backdoor, atau sertifikat palsu."}
            </p>
          </div>

          {/* 4. Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="flex items-center justify-center gap-2 border-2 border-zinc-900 bg-zinc-950 text-white hover:bg-zinc-800 active:translate-y-0.5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] disabled:opacity-60"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>
                {isVerifying ? "Verifying Digest..." : "Verify Digital Seal"}
              </span>
            </button>

            <button
              onClick={handleDownloadAudit}
              className="flex items-center justify-center gap-2 border-2 border-zinc-900 bg-white text-zinc-950 hover:bg-zinc-100 active:translate-y-0.5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_0px_rgba(24,24,27,1)]"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download Audit Log</span>
            </button>
          </div>

          {/* Simulation Toggle & Navigation Links */}
          <div className="mt-5 pt-4 border-t border-dashed border-zinc-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-zinc-500">
            <button
              onClick={toggleSimulate}
              className="uppercase font-bold underline hover:text-red-700 transition-colors"
            >
              {isValid
                ? "[Simulasikan Tampered / Invalid]"
                : "[Pulihkan ke Valid / Verified]"}
            </button>
            <Link
              href="/dashboard/gatekeeper"
              className="uppercase underline hover:text-zinc-950 transition-colors"
            >
              Kembali ke Gatekeeper Dashboard →
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Pusat Siber TNI AD (PUSSIBERAD) · OZIK-SENTINEL Zero-Trust Ecosystem
          <br />
          Tanda Tangan Kriptografi Dilindungi Undang-Undang ITE & Doktrin Operasi Siber TNI
        </footer>
      </main>
    </div>
  );
}
