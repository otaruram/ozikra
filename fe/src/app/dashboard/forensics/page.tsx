"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  cn,
  EmptyState,
  Eyebrow,
  Mono,
  Notice,
  PageHeader,
  Panel,
  Select,
  Tag,
} from "@/components/ui";
import { useAction, useAsyncResource } from "@/hooks/use-async";
import {
  API_BASE_URL,
  downloadForensicReportPdf,
  fetchAssets,
  onExportForensicReport,
  onIsolateAssetNode,
  onRunForensicAgent,
} from "@/lib/api";
import { canKillSwitch as checkKillSwitch } from "@/lib/rbac";
import { sanitizeMilitaryText } from "@/lib/sanitize";
import { useSession } from "@/lib/session-context";
import type { TimelinePhase } from "@/types/sentinel";

const PHASE_LABEL: Record<TimelinePhase, string> = {
  PHASE_1_SUPPLY_CHAIN: "P1 · Supply Chain",
  PHASE_2_QR_SIEM: "P2 · QR / SIEM",
  PHASE_3_ANOMALY: "P3 · Anomaly",
};

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-paper">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-paper">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function CleanMarkdownView({ content }: { content: string }) {
  if (!content) return null;
  const sanitized = sanitizeMilitaryText(content);
  const paragraphs = sanitized.split("\n\n");

  return (
    <div className="flex flex-col gap-3 font-sans text-[12.5px] leading-relaxed text-paper">
      {paragraphs.map((p, idx) => (
        <p key={idx} className="break-words text-paper/90 whitespace-pre-line leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

export default function ForensicsPage() {
  const { role } = useSession();
  const assets = useAsyncResource(fetchAssets);
  const [assetId, setAssetId] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const investigate = useAction(onRunForensicAgent);
  const isolate = useAction(onIsolateAssetNode);
  const report = investigate.result;
  const isolated = report?.isolated || isolate.result?.isolated;
  const canKillSwitch = role ? checkKillSwitch(role) : false;

  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ kind: "error" | "info" | "success"; message: string } | null>(null);

  const handleExportForensicReport = async (targetAssetId?: string) => {
    const idToExport = targetAssetId || report?.assetId || assetId;
    if (!idToExport) {
      setExportNotice({
        kind: "error",
        message: "Pilih target aset atau jalankan investigasi forensik terlebih dahulu.",
      });
      return;
    }

    try {
      setIsExporting(true);
      setExportNotice(null);
      await downloadForensicReportPdf(idToExport);
      setExportNotice({
        kind: "success",
        message: `File BAP_FORENSIK_${idToExport}_${new Date().toISOString().slice(0, 10)}.pdf berhasil diunduh ke folder Downloads Anda.`,
      });
    } catch (err: any) {
      console.error(err);
      setExportNotice({
        kind: "error",
        message: err?.message || "Gagal mengunduh laporan forensik resmi (PDF).",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleAutoFillForensics = async () => {
    const target = assets.data?.find((a) => a.integrityState === "COMPROMISED" || a.id === "AST-RADIO-VHF") || assets.data?.[0];
    const targetId = target ? target.id : "AST-RADIO-VHF";
    setAssetId(targetId);
    // Execute real backend AI investigation & write RCA into Supabase
    await investigate.run(targetId);
  };

  return (
    <RoleGate route="forensics">
      <PageHeader
        eyebrow="Core Operations / Phase 03"
        title="AI Digital Forensics"
        description="1-Click Investigation: correlates Phase 01 vendor evidence and Phase 02 QR/SIEM logs into an auditable root-cause analysis."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFillForensics}
              icon={<Icon.Refresh size={12} />}
              className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink"
            >
              ⚡ Auto-Fill Target Insiden &amp; Jalankan Forensik
            </Button>
            <div className="w-64">
              <Select id="forensics-asset-select" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">{assets.isLoading ? "Loading assets…" : "Select target asset"}</option>
                {assets.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} — {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              id="forensics-run-investigation"
              variant="primary"
              disabled={!assetId}
              loading={investigate.isPending}
              icon={<Icon.Forensic size={15} />}
              onClick={() => investigate.run(assetId)}
            >
              Run AI Forensic Investigation
            </Button>
          </div>
        }
      />

      {assets.data && assets.data.length === 0 && (
        <div className="border border-line bg-surface px-4 py-3 font-mono text-[11px] text-muted">
          [SYSTEM] Asset registry is empty — the selector populates from <span className="text-paper">/assets</span>.
        </div>
      )}
      <Notice notice={investigate.notice} onClose={() => investigate.setNotice(null)} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Timeline */}
        <Panel className="xl:col-span-4 min-w-0" eyebrow="Evidence" title="Chronological Attack & Audit Timeline">
          {!report || report.timeline.length === 0 ? (
            <EmptyState
              icon={<Icon.Ledger size={16} />}
              title="No timeline reconstructed"
              message="Linked evidence from vendor manifests, QR scan logs and SIEM anomalies will be ordered here."
            />
          ) : (
            <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
              {report.timeline.map((t) => (
                <li key={t.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[25px] top-1 h-2 w-2 border border-paper",
                      t.phase === "PHASE_3_ANOMALY" ? "bg-paper animate-pulse" : "bg-ink",
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <Mono className="text-muted">{new Date(t.timestamp).toLocaleString("en-GB")}</Mono>
                    <Tag tone={t.phase === "PHASE_3_ANOMALY" ? "inverted" : "muted"}>{PHASE_LABEL[t.phase]}</Tag>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{t.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{t.detail}</p>
                  {t.evidenceHash && <Mono className="mt-1 block truncate text-[10.5px] text-subtle">{t.evidenceHash}</Mono>}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* RCA */}
        <Panel
          className="xl:col-span-5 min-w-0"
          eyebrow="Analysis"
          title="AI Root Cause Analysis (RCA)"
          actions={report && <Tag>Confidence {Math.round(report.confidence * 100)}%</Tag>}
        >
          {!report ? (
            <EmptyState
              icon={<Icon.Forensic size={16} />}
              title="No analysis generated"
              message="The forensic agent's structured RCA output will stream into this container."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="border border-line bg-ink p-4 min-w-0 overflow-x-auto">
                <CleanMarkdownView content={report.rootCauseMarkdown} />
              </div>
              {report.recommendedActions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Eyebrow>Recommended Actions</Eyebrow>
                  <ul className="flex flex-col gap-1.5">
                    {report.recommendedActions.map((a, i) => (
                      <li key={i} className="flex gap-3 text-[13px]">
                        <Mono className="text-subtle">{String(i + 1).padStart(2, "0")}</Mono>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Response */}
        <Panel className="xl:col-span-3 min-w-0" eyebrow="Response" title="Tactical Response Actions">
          <div className="flex flex-col gap-4">
            <div className={cn("border p-4", isolated ? "border-paper bg-paper text-ink" : "border-line bg-ink")}>
              <Eyebrow className={isolated ? "text-ink/60" : undefined}>Node Status</Eyebrow>
              <p className="mt-1 font-mono text-sm font-semibold">{isolated ? "[ISOLATED]" : assetId ? "CONNECTED" : "--"}</p>
              <Mono className={cn("mt-1 block", isolated ? "text-ink/60" : "text-subtle")}>{assetId || "No asset selected"}</Mono>
            </div>

            {canKillSwitch ? (
              <>
                <Button
                  id="forensics-kill-switch"
                  variant="critical"
                  disabled={!assetId || !!isolated}
                  loading={isolate.isPending}
                  icon={<Icon.Power size={15} />}
                  onClick={() => isolate.run(assetId)}
                >
                  Isolate Asset Node (Kill-Switch)
                </Button>
                <Notice notice={isolate.notice} onClose={() => isolate.setNotice(null)} />
              </>
            ) : (
              <div className="border border-red-500/40 bg-red-950/20 p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-red-400 font-mono text-xs font-bold uppercase tracking-wider">
                  <Icon.ShieldAlert size={14} />
                  <span>Otorisasi Komando Diperlukan.</span>
                </div>
                <p className="font-mono text-[11px] text-muted leading-relaxed">
                  Eksekusi Kill-Switch isolasi fisik node hanya dapat disahkan oleh <span className="text-paper font-semibold">Komandan (COMMANDER)</span> atau <span className="text-accent font-semibold">SUPER_ADMIN</span>. Peran aktif Anda: <span className="text-amber-400 font-bold">[{role || "AUDITOR"}]</span>.
                </p>
              </div>
            )}

            <Button
              id="forensics-export-pdf"
              disabled={!report && !assetId}
              loading={isExporting}
              icon={<Icon.File size={15} />}
              onClick={() => handleExportForensicReport(report?.assetId || assetId)}
            >
              Export Official Forensic Report (PDF)
            </Button>
            <Notice notice={exportNotice} onClose={() => setExportNotice(null)} />

            <p className="border-t border-line pt-4 font-mono text-[10.5px] leading-relaxed text-subtle">
              Every response action is hash-chained into the Immutable Audit Ledger with the operator&apos;s signature.
            </p>
          </div>
        </Panel>
      </div>

      {/* Official Indonesian Military Standard Berita Acara Forensik Siber (BAIFS) Modal */}
      {showReportModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto">
          <div className="relative my-8 flex w-full max-w-3xl flex-col border border-paper bg-white text-black p-8 shadow-2xl">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-black">
              <span className="font-mono text-xs font-bold tracking-widest text-neutral-600">
                PUSSIBERAD · SATUAN INVESTIGASI DIGITAL SIBER
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" className="text-black hover:bg-neutral-200" onClick={() => setShowReportModal(false)}>
                  Close
                </Button>
                <Button
                  id="forensics-download-bap-pdf"
                  size="sm"
                  variant="outline"
                  className="text-black border-black/40 hover:bg-neutral-100"
                  icon={<Icon.Arrow size={14} className="rotate-90" />}
                  loading={isExporting}
                  onClick={() => handleExportForensicReport(report.assetId || assetId)}
                >
                  Download / Simpan PDF Resmi
                </Button>
                <Button size="sm" variant="primary" icon={<Icon.File size={14} />} onClick={() => window.print()}>
                  Print / Save PDF
                </Button>
              </div>
            </div>

            {/* Official Military Document Content */}
            <div id="berita-acara-print-area" className="py-6 font-serif">
              {/* Kop Surat Resmi Militer */}
              <div className="border-b-2 border-black pb-4 text-center">
                <div className="text-[12px] font-bold tracking-widest uppercase">TENTARA NASIONAL INDONESIA ANGKATAN DARAT</div>
                <div className="text-[14px] font-black tracking-wider uppercase">PUSAT SIBER TNI ANGKATAN DARAT (PUSSIBERAD)</div>
                <div className="text-[10px] font-sans tracking-wide text-neutral-700">KOMANDO OPERASI SIBER &amp; TANGGAP INSIDEN KRITIS (CSIRT-AD)</div>
                <div className="mt-2 inline-block border-y border-black px-4 py-0.5 font-mono text-[11px] font-bold">
                  KLASIFIKASI: SANGAT RAHASIA / OPERASIONAL SIBER
                </div>
              </div>

              {/* Title & Reference */}
              <div className="my-6 text-center">
                <div className="text-lg font-black underline tracking-wide">BERITA ACARA INVESTIGASI FORENSIK SIBER (BAIFS)</div>
                <div className="font-mono text-xs text-neutral-800 mt-1">
                  Nomor: BAIFS/026/CSIRT-AD/X/2026/INV-{report.investigationId}
                </div>
              </div>

              {/* Preamble */}
              <div className="text-[12px] leading-relaxed text-justify mb-4">
                Pada hari ini, <span className="font-bold">{new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>, telah dilaksanakan tindakan investigasi digital forensik otomatis dan verifikasi rantai pasok (Supply Chain Forensics) oleh Satuan Tugas Keamanan Siber Terpadu OZIK-SENTINEL PUSSIBERAD terhadap modul infrastruktur pertahanan dengan rincian sebagai berikut:
              </div>

              {/* Metadata Table */}
              <table className="w-full border-collapse border border-black text-[11px] font-sans mb-6">
                <tbody>
                  <tr className="border-b border-black">
                    <td className="w-1/3 bg-neutral-100 p-2 font-bold">ID / NAMA ASET TERDAMPAK</td>
                    <td className="p-2 font-mono font-bold">{report.assetId}</td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="bg-neutral-100 p-2 font-bold">WAKTU DETEKSI AWAL</td>
                    <td className="p-2 font-mono">{report.startedAt}</td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="bg-neutral-100 p-2 font-bold">STATUS ISOLASI NODE (KILL-SWITCH)</td>
                    <td className="p-2 font-mono font-bold text-red-700">
                      {isolated ? "TERISOLASI (NODE ISOLATED FROM TACTICAL BUS)" : "DALAM PENANGANAN"}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-neutral-100 p-2 font-bold">TINGKAT KEPERCAYAAN AI (CONFIDENCE)</td>
                    <td className="p-2 font-mono font-bold">{Math.round(report.confidence * 100)}% (Ozik-Omni Reasoning Model)</td>
                  </tr>
                </tbody>
              </table>

              {/* Chronological Timeline */}
              <div className="mb-6">
                <div className="font-bold text-[12px] border-b border-black pb-1 mb-2">I. KRONOLOGI SERANGAN &amp; BUKTI RANTAI PASOK (TIMELINE EVIDENCE)</div>
                <div className="flex flex-col gap-2 font-sans text-[11px]">
                  {report.timeline.map((t, idx) => (
                    <div key={t.id} className="border-l-2 border-black pl-3 py-1">
                      <div className="font-bold font-mono text-[10px] text-neutral-700">{t.timestamp} — [{t.phase}]</div>
                      <div className="font-bold text-neutral-900">{t.title}</div>
                      <div className="text-neutral-700">{t.detail}</div>
                      {t.evidenceHash && (
                        <div className="font-mono text-[9px] text-neutral-600 truncate">SHA-256 Hash: {t.evidenceHash}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* RCA Analysis */}
              <div className="mb-6">
                <div className="font-bold text-[12px] border-b border-black pb-1 mb-2">II. ANALISIS PENYEBAB UTAMA (ROOT CAUSE ANALYSIS)</div>
                <div className="bg-neutral-50 p-4 border border-neutral-300 min-w-0 overflow-x-auto text-black">
                  <CleanMarkdownView content={report.rootCauseMarkdown} />
                </div>
              </div>

              {/* Recommendations */}
              <div className="mb-8">
                <div className="font-bold text-[12px] border-b border-black pb-1 mb-2">III. TINDAKAN PENANGGULANGAN OPERASIONAL</div>
                <ol className="list-decimal pl-5 text-[11px] font-sans flex flex-col gap-1">
                  {report.recommendedActions.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ol>
              </div>

              {/* Signature Block */}
              <div className="mt-8 grid grid-cols-2 text-center font-sans text-[11px]">
                <div>
                  <div>Pemeriksa / Auditor Forensik Siber,</div>
                  <div className="h-16 flex items-center justify-center font-mono text-[10px] text-neutral-400">
                    [ TANDA TANGAN DIGITAL TERVERIFIKASI ]
                  </div>
                  <div className="font-bold underline">LETTU CKE REZA ADITYA</div>
                  <div className="text-[10px]">NRP 21190089201088</div>
                </div>
                <div>
                  <div>Mengetahui,</div>
                  <div>Komandan Detasemen Forensik Siber,</div>
                  <div className="h-14 flex items-center justify-center font-mono text-[10px] text-neutral-400">
                    [ TANDA TANGAN DIGITAL SHA-256 ]
                  </div>
                  <div className="font-bold underline">KOLONEL CKE OZIKRA, S.T., M.Sc.</div>
                  <div className="text-[10px]">NRP 11040019230876</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  );
}
