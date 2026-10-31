"use client";

import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  cn,
  Dropzone,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Mono,
  Notice,
  PageHeader,
  Panel,
  Select,
  Tag,
} from "@/components/ui";
import { useAction } from "@/hooks/use-async";
import { onExportQRSeal, onUploadManifest, recordAuditAction } from "@/lib/api";
import { FRONTEND_BASE_URL, generateGatekeeperAutoFill } from "@/lib/autofill-generator";
import { useSession } from "@/lib/session-context";
import { ASSET_TYPE_LABEL, type AssetType, type ManifestSubmission } from "@/types/sentinel";

const EMPTY_FORM: ManifestSubmission = {
  assetName: "",
  serialNumber: "",
  vendor: "",
  assetType: "IT_SERVER",
  manifestFile: null,
  sbomFile: null,
};

export default function GatekeeperPage() {
  const { role, session } = useSession();
  const canIntake = role === "LOGISTICS_OFFICER" || role === "SUPER_ADMIN" || role === "COMMANDER";
  const [form, setForm] = useState<ManifestSubmission>(EMPTY_FORM);
  const [activeFormatNote, setActiveFormatNote] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const verify = useAction(onUploadManifest);
  const exportSeal = useAction(onExportQRSeal);
  const result = verify.result;

  const activePassport = result?.passport || null;

  // Construct absolute scannable HTTPS verification URL for camera lenses (iOS / Android / Lens)
  const verifyUrl = activePassport
    ? `${FRONTEND_BASE_URL}/verify?id=${encodeURIComponent(
        activePassport.assetId
      )}&sig=${encodeURIComponent(
        activePassport.signature
      )}&ts=${encodeURIComponent(
        activePassport.issuedAt
      )}&vendor=${encodeURIComponent(
        form.vendor || "PT Len Industri"
      )}&status=${encodeURIComponent(
        (result?.verdict || "APPROVED").toLowerCase()
      )}`
    : "";

  useEffect(() => {
    if (!verifyUrl) {
      setQrDataUrl("");
      return;
    }
    // Generate high-contrast, optimal quiet-zone QR Code for instant phone camera recognition
    QRCode.toDataURL(verifyUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR Code Generation failed", err));
  }, [verifyUrl]);

  const set = <K extends keyof ManifestSubmission>(k: K, v: ManifestSubmission[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit =
    form.assetName.trim() && form.serialNumber.trim() && form.vendor.trim() && (form.manifestFile || form.sbomFile);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await verify.run(form);
  };

  const handleAutoFillGatekeeper = async () => {
    const bundle = generateGatekeeperAutoFill(session?.user?.email);
    setActiveFormatNote(`${bundle.formatLabel} → Target: [${bundle.expectedOutcome}]`);

    const submission: ManifestSubmission = {
      assetName: bundle.assetName,
      serialNumber: bundle.serialNumber,
      vendor: bundle.vendor,
      assetType: bundle.assetType,
      manifestFile: bundle.manifestFile,
      sbomFile: bundle.sbomFile,
    };

    setForm(submission);
    // Execute live backend AI pipeline & write real user-scoped row into Supabase Postgres
    await verify.run(submission);
  };

  return (
    <RoleGate route="gatekeeper">
      <PageHeader
        eyebrow="Core Operations / Phase 01"
        title="Supply-Chain Gatekeeper"
        description="Pre-deployment multimodal audit of procurement manifests and SBOMs. Approved assets receive an HMAC-signed Tactical QR Passport."
        actions={
          <div className="flex items-center gap-2">
            {canIntake ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoFillGatekeeper}
                icon={<Icon.Refresh size={12} />}
                className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink"
              >
                ⚡ Auto-Fill Manifest &amp; SBOM
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 border border-amber-500/40 bg-amber-950/20 px-3 py-1 font-mono text-[11px] text-amber-300">
                <Icon.ShieldAlert size={12} />
                <span>Otorisasi Terbatas: {role || "GUEST"}</span>
              </div>
            )}
            <Tag tone="muted">Pre-Deployment</Tag>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Left — intake form / locked authorization banner */}
        <Panel
          eyebrow="Intake"
          title="Asset Submission"
          actions={
            canIntake ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoFillGatekeeper}
                icon={<Icon.Refresh size={12} />}
                className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink"
              >
                ⚡ Auto-Fill
              </Button>
            ) : null
          }
        >
          {!canIntake ? (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-red-500/40 bg-red-950/20 text-center gap-4">
              <div className="w-12 h-12 rounded-full border border-red-500/40 bg-red-500/10 flex items-center justify-center text-red-400">
                <Icon.ShieldAlert size={24} />
              </div>
              <div className="flex flex-col gap-2 max-w-md">
                <h3 className="font-mono text-sm uppercase tracking-wider text-red-400 font-bold">
                  Akses Ditolak: Fitur ini memerlukan otorisasi Perwira Logistik.
                </h3>
                <p className="text-xs text-muted font-mono leading-relaxed">
                  Peran aktif sesi militer Anda saat ini adalah <span className="text-paper font-bold">[{role || "UNKNOWN"}]</span>.
                  Modul verifikasi pre-deployment Gatekeeper (Upload Manifest &amp; SBOM, Analisis Kerentanan CVE &amp; Penerbitan QR Passport) dibatasi secara ketat hanya untuk <span className="text-emerald-400 font-semibold">LOGISTICS_OFFICER</span> atau <span className="text-accent font-semibold">SUPER_ADMIN</span>.
                </p>
              </div>
              <div className="mt-2 text-[11px] font-mono text-muted/90 bg-surface-2 px-3 py-2 border border-line flex items-center gap-2">
                <span>💡</span>
                <span>
                  Gunakan dropdown <strong>Switch Role Simulator</strong> di header kanan atas untuk beralih ke <strong>Perwira Logistik (LOGISTICS_OFFICER)</strong>.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              {activeFormatNote && (
                <div className="flex items-center justify-between border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 font-mono text-[11px] text-emerald-300">
                  <span>PRESET AKTIF: {activeFormatNote}</span>
                  <span className="text-[10px] text-emerald-400/80">Klik Auto-Fill lagi untuk ganti format</span>
                </div>
              )}
              <Dropzone
                id="gatekeeper-manifest-dropzone"
                label="Procurement Manifest / CoC"
                accept=".pdf,image/*"
                description="PDF, PNG, JPG · OCR by multimodal agent"
                file={form.manifestFile}
                onFile={(f) => set("manifestFile", f)}
              />
              <Dropzone
                id="gatekeeper-sbom-dropzone"
                label="SBOM / Firmware Spec"
                accept=".json,.csv,.xml,.spdx"
                description="CycloneDX / SPDX JSON, CSV"
                file={form.sbomFile}
                onFile={(f) => set("sbomFile", f)}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Asset Name">
                  <Input
                    id="gatekeeper-asset-name"
                    value={form.assetName}
                    onChange={(e) => set("assetName", e.target.value)}
                    placeholder="e.g. Radar Avionik Unit"
                  />
                </Field>
                <Field label="Serial / Part Number">
                  <Input
                    id="gatekeeper-serial"
                    className="font-mono"
                    value={form.serialNumber}
                    onChange={(e) => set("serialNumber", e.target.value)}
                    placeholder="SN-XXXX-XXXX"
                  />
                </Field>
                <Field label="Vendor">
                  <Input
                    id="gatekeeper-vendor"
                    value={form.vendor}
                    onChange={(e) => set("vendor", e.target.value)}
                    placeholder="Manufacturer / Distributor"
                  />
                </Field>
                <Field label="Asset Type">
                  <Select
                    id="gatekeeper-asset-type"
                    value={form.assetType}
                    onChange={(e) => set("assetType", e.target.value as AssetType)}
                  >
                    {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                      <option key={t} value={t}>
                        {ASSET_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Notice notice={verify.notice} onClose={() => verify.setNotice(null)} />

              <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={() => setForm(EMPTY_FORM)}
                  className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted hover:text-paper"
                >
                  Reset
                </button>
                <Button
                  id="gatekeeper-run-agent"
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                  loading={verify.isPending}
                  icon={<Icon.Gate size={15} />}
                >
                  Run Multimodal Verification Agent
                </Button>
              </div>
            </form>
          )}
        </Panel>

        {/* Right — output */}
        <div className="flex flex-col gap-4">
          <Panel eyebrow="Output" title="Verification Result">
            {!result ? (
              <EmptyState
                icon={<Icon.Forensic size={16} />}
                title="Awaiting verification"
                message="AI extraction results, supply-chain trust score and matched CVE vectors will render here after the agent completes."
              />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-end justify-between border-b border-line pb-5">
                  <div className="flex flex-col gap-1">
                    <Eyebrow>Supply Chain Trust Score</Eyebrow>
                    <span className="font-mono text-5xl font-light tracking-tighter">{result.trustScore}%</span>
                  </div>
                  <Tag tone={result.verdict === "APPROVED" ? "default" : "inverted"}>[{result.verdict}]</Tag>
                </div>
                <div className="flex flex-col gap-2">
                  <Eyebrow>Extracted Fields</Eyebrow>
                  {result.extractedFields.map((f) => (
                    <div key={f.key} className="flex justify-between border-b border-line py-1.5 text-sm">
                      <span className="text-muted">{f.key}</span>
                      <span>
                        {f.value} <Mono className="text-subtle">· {(f.confidence * 100).toFixed(0)}%</Mono>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <Eyebrow>CVE Vector Results</Eyebrow>
                  {result.cveMatches.length === 0 && <Mono className="text-muted">No matching CVE vectors.</Mono>}
                  {result.cveMatches.map((c) => (
                    <div key={c.cveId} className="flex items-center justify-between gap-3 border border-line px-3 py-2">
                      <div className="flex flex-col">
                        <Mono>{c.cveId}</Mono>
                        <span className="text-[11px] text-muted">
                          {c.component}@{c.version}
                        </span>
                      </div>
                      <Tag tone={c.severity === "CRITICAL" ? "alert" : c.severity === "HIGH" ? "inverted" : "muted"}>
                        {c.severity} · {c.cvss}
                      </Tag>
                    </div>
                  ))}
                </div>
                {result.reasoning && (
                  <div className={cn(
                    "border-l-2 p-3 font-mono text-[12px] leading-relaxed",
                    result.verdict === "QUARANTINED"
                      ? "border-amber-400 bg-amber-500/10 text-amber-200"
                      : "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                  )}>
                    <div className="flex items-center gap-2 mb-1.5 font-bold uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-paper" />
                      <span>
                        Ringkasan Integritas: [{result.verdict}] · Skor Kepercayaan {result.trustScore}% · {result.cveMatches?.length ?? 0} Kerentanan CVE
                      </span>
                    </div>
                    <p className="text-[12.5px] font-sans leading-relaxed text-paper/90">{result.reasoning}</p>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow={!activePassport ? "Awaiting Seal" : "Live Seal"}
            title="Tactical QR Code Passport"
            actions={
              <Tag tone={!activePassport ? "muted" : "default"}>
                {!activePassport ? "[NO SEAL YET]" : "[VERIFIED PASSPORT]"}
              </Tag>
            }
          >
            {!activePassport ? (
              <EmptyState
                icon={<Icon.QR size={16} />}
                title="Belum Ada Segel QR Diterbitkan"
                message="Unggah dokumen Manifest/SBOM atau tekan tombol '⚡ Auto-Fill Manifest & SBOM' untuk menghasilkan Tactical QR Code Passport unik bagi sesi Anda."
              />
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative flex aspect-square w-full max-w-[190px] shrink-0 items-center justify-center border-2 border-line-strong bg-white p-2 shadow-inner">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="Tactical QR Passport"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center font-mono text-[10px] text-zinc-500">
                        GENERATING QR...
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Kamera HP Siap Scan</span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <Eyebrow>Asset ID</Eyebrow>
                    <Mono className="text-base font-bold text-paper">{activePassport.assetId}</Mono>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Eyebrow>HMAC-SHA256 Signature</Eyebrow>
                    <Mono className="break-all text-[11px] text-muted">{activePassport.signature}</Mono>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Eyebrow>Issued Authority</Eyebrow>
                    <Mono className="text-muted text-[11px]">
                      {activePassport.issuedAt} · {activePassport.issuedBy}
                    </Mono>
                  </div>

                  {/* Direct Mobile/Browser Verification Link */}
                  <div className="border border-line bg-surface-2 p-2.5 font-mono text-[11px] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-muted text-[10px]">
                      <span>TARGET VERIFIKASI SIBER:</span>
                      <span className="text-emerald-400 font-bold">HTTPS AKTIF (oziksentinel.biz.id)</span>
                    </div>
                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-accent hover:underline flex items-center gap-1 text-[11.5px]"
                      title={verifyUrl}
                    >
                      <span>↗ Buka Hasil Scan di Tab Baru</span>
                    </a>
                    <p className="text-[10px] text-muted/80 leading-relaxed font-sans">
                      Arahkan kamera smartphone ke kode QR di atas untuk membuka Tactical Passport Verification Gateway secara langsung.
                    </p>
                  </div>

                  <Notice notice={exportSeal.notice} onClose={() => exportSeal.setNotice(null)} />
                  <Button
                    id="gatekeeper-export-qr"
                    className="mt-auto self-start"
                    size="sm"
                    loading={exportSeal.isPending}
                    icon={<Icon.QR size={13} />}
                    onClick={async () => {
                      await exportSeal.run(activePassport.assetId);
                      await recordAuditAction(
                        "SEAL_PHYSICAL_TAG_PRINTED",
                        activePassport.assetId,
                        `PRINT_PREVIEW_OPENED:ASSET:${activePassport.assetId}`
                      );
                      setShowPrintModal(true);
                    }}
                  >
                    Print / Export Tactical QR Seal
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Military-Grade Tactical QR Passport Tag Modal */}
      {showPrintModal && activePassport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-lg flex-col border border-paper bg-ink p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-paper" />
                <span className="font-mono text-xs font-bold tracking-[0.2em] text-paper">
                  PUSSIBERAD · TACTICAL ASSET IDENTITY
                </span>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="font-mono text-xs text-muted hover:text-paper"
              >
                [ESC / CLOSE]
              </button>
            </div>

            {/* Tactical Label Preview Box */}
            <div id="tactical-label-print-area" className="my-6 border-2 border-dashed border-line-strong bg-white p-6 text-black">
              <div className="flex items-start justify-between border-b-2 border-black pb-3">
                <div>
                  <div className="text-[12px] font-black tracking-widest">TNI ANGKATAN DARAT</div>
                  <div className="text-[10px] font-semibold text-neutral-700">PUSAT SIBER (PUSSIBERAD) - CORE INFRA</div>
                </div>
                <div className="text-right">
                  <span className="border border-black px-1.5 py-0.5 text-[9px] font-mono font-bold">MIL-SPEC 810H</span>
                </div>
              </div>

              <div className="my-4 flex items-center gap-5">
                <div className="flex h-36 w-36 shrink-0 items-center justify-center border-2 border-black p-1 bg-white">
                  {qrDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="QR Seal" className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] font-mono">
                  <div>
                    <span className="font-bold text-neutral-600">ID ASET:</span>
                    <div className="text-sm font-black">{activePassport.assetId}</div>
                  </div>
                  <div>
                    <span className="font-bold text-neutral-600">TIPE / MODEL:</span>
                    <div className="font-semibold">{form.assetName || "Tactical Hardware Node"}</div>
                  </div>
                  <div>
                    <span className="font-bold text-neutral-600">SERIAL NO:</span>
                    <div>{form.serialNumber || "SN-UNKNOWN"}</div>
                  </div>
                  <div>
                    <span className="font-bold text-neutral-600">VENDOR ASAL:</span>
                    <div>{form.vendor || "PT Len Industri"}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-black pt-2 text-[8px] font-mono leading-tight text-neutral-800">
                <div className="truncate"><span className="font-bold">VERIFY URL:</span> {verifyUrl}</div>
                <div className="truncate"><span className="font-bold">HMAC SIG:</span> {activePassport.signature}</div>
                <div className="mt-1 text-center font-bold tracking-widest">[ DILARANG MERUSAK / MELEPAS STIKER PENGAWASAN TAKTIS ]</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="font-mono text-[10.5px] text-muted">Format: Thermal / Polyimide Mil-Spec Label</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowPrintModal(false)}>
                  Cancel
                </Button>
                <Button
                  id="gatekeeper-download-png"
                  size="sm"
                  variant="outline"
                  icon={<Icon.Arrow size={14} className="rotate-90" />}
                  onClick={async () => {
                    const urlToDownload = qrDataUrl;
                    if (!urlToDownload) return;
                    await recordAuditAction(
                      "QR_SEAL_IMAGE_DOWNLOADED",
                      activePassport.assetId,
                      `DOWNLOAD_PNG_SEAL:${activePassport.assetId}`
                    );
                    const a = document.createElement("a");
                    a.href = urlToDownload;
                    a.download = `TACTICAL_QR_SEAL_${activePassport.assetId}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  Download PNG
                </Button>
                <Button
                  id="gatekeeper-print-label"
                  size="sm"
                  variant="primary"
                  icon={<Icon.QR size={14} />}
                  onClick={async () => {
                    await recordAuditAction(
                      "SEAL_PHYSICAL_TAG_PRINTED",
                      activePassport.assetId,
                      `PHYSICAL_LABEL_PRINTED:ASSET:${activePassport.assetId}`
                    );
                    window.print();
                  }}
                >
                  Print Label Stiker
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  );
}
