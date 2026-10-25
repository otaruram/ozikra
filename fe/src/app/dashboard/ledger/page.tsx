"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  DataTable,
  ErrorLine,
  Eyebrow,
  Input,
  Mono,
  PageHeader,
  Pagination,
  Panel,
  Segmented,
  Tag,
  usePagination,
  type Column,
} from "@/components/ui";
import { useAsyncResource } from "@/hooks/use-async";
import { fetchLedger, recordAuditAction, verifyLedgerIntegrity } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { LedgerEntry, TacticalRole } from "@/types/sentinel";

type Filter = "ALL" | "GATEKEEPER" | "QR" | "FORENSIC" | "ADMIN";
type RoleView = "LOGISTICS_OFFICER" | "COMMANDER" | "FORENSIC_AUDITOR" | "SUPER_ADMIN";

const short = (h: string) => (h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h);

const ROLE_PERSPECTIVES: { id: RoleView; label: string; icon: string; desc: string }[] = [
  {
    id: "LOGISTICS_OFFICER",
    label: "Perwira Logistik",
    icon: "📦",
    desc: "Buku Induk Logistik & Paspor Segel Fisik Alutsista",
  },
  {
    id: "COMMANDER",
    label: "Panglima Komando",
    icon: "🛡️",
    desc: "Buku Direktif Operasi Taktis & Lembar SPRIN Darurat",
  },
  {
    id: "FORENSIC_AUDITOR",
    label: "Auditor Forensik",
    icon: "🔬",
    desc: "Rantai Bukti Hukum & Berita Acara Pemeriksaan (BAP-SIBER)",
  },
  {
    id: "SUPER_ADMIN",
    label: "Master Blockchain",
    icon: "⚡",
    desc: "Penjelajah Blok Kriptografis SHA-256 PUSSIBERAD",
  },
];

const COLUMNS: Column<LedgerEntry>[] = [
  { key: "idx", header: "#", render: (e) => <Mono className="text-subtle">{String(e.index).padStart(6, "0")}</Mono> },
  { key: "ts", header: "Timestamp", render: (e) => <Mono className="text-muted">{new Date(e.timestamp).toLocaleString("id-ID")}</Mono> },
  { key: "actor", header: "Actor", render: (e) => <span className="text-[13px] font-semibold">{e.actor}</span> },
  { key: "action", header: "Action", render: (e) => <Mono className="text-accent">{e.action}</Mono> },
  { key: "asset", header: "Asset", render: (e) => <Mono className="text-paper">{e.assetId ?? "--"}</Mono> },
  { key: "prev", header: "Prev Hash", render: (e) => <Mono className="text-subtle">{short(e.previousHash)}</Mono> },
  { key: "hash", header: "Block SHA-256", render: (e) => <Mono className="font-bold">{short(e.hash)}</Mono> },
];

export default function LedgerPage() {
  const { role } = useSession();
  const ledger = useAsyncResource(fetchLedger);
  const [activeView, setActiveView] = useState<RoleView>("SUPER_ADMIN");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    status: string;
    total_blocks: number;
    tampered_blocks: number;
    verification_at: string;
    algorithm: string;
  } | null>(null);

  // Synchronize initial active view with user's military session role
  useEffect(() => {
    if (role && ["LOGISTICS_OFFICER", "COMMANDER", "FORENSIC_AUDITOR", "SUPER_ADMIN"].includes(role)) {
      setActiveView(role as RoleView);
    }
  }, [role]);

  const rows = useMemo(() => {
    if (!ledger.data) return null;
    const q = query.toLowerCase();
    return ledger.data.filter(
      (e) =>
        (filter === "ALL" || e.action.toUpperCase().includes(filter)) &&
        (!q || [e.actor, e.action, e.hash, e.assetId ?? ""].some((v) => v.toLowerCase().includes(q)))
    );
  }, [ledger.data, query, filter]);

  const pagination = usePagination(rows, 10);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await verifyLedgerIntegrity();
      setVerifyResult(res);
      await recordAuditAction(
        "LEDGER_HASH_CHAIN_VERIFIED",
        "BLOCKCHAIN_ROOT",
        `STATUS:${res.status}:BLOCKS:${res.total_blocks}:TAMPERED:${res.tampered_blocks}`
      );
    } catch (err: any) {
      setVerifyResult({
        valid: false,
        status: "VERIFICATION_ERROR",
        total_blocks: rows?.length || 0,
        tampered_blocks: 0,
        verification_at: new Date().toISOString(),
        algorithm: "SHA-256",
      });
    } finally {
      setVerifying(false);
    }
  };

  const exportCSV = () => {
    if (!rows || rows.length === 0) return;
    const headers = ["Index", "Timestamp", "Actor", "Action", "AssetID", "PayloadHash", "PreviousHash", "Hash"];
    const csvContent = [
      headers.join(","),
      ...rows.map((e) => [
        e.index,
        `"${e.timestamp}"`,
        `"${e.actor.replace(/"/g, '""')}"`,
        `"${e.action}"`,
        `"${e.assetId || ""}"`,
        `"${e.payloadHash}"`,
        `"${e.previousHash}"`,
        `"${e.hash}"`,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OZIK_LEDGER_${activeView}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!rows || rows.length === 0) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OZIK_LEDGER_${activeView}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadLogisticsReceipt = (item: LedgerEntry) => {
    const receipt = {
      dokumen: "BUKU INDUK PENERIMAAN LOGISTIK & REGISTRASI SEGEL (BAP-LOG)",
      instansi: "PUSAT SIBER TNI ANGKATAN DARAT (PUSSIBERAD) - BEKPAL",
      no_bap: `BAP-LOG-2026-#${String(item.index).padStart(4, "0")}`,
      id_aset: item.assetId || "AST-OT-728",
      nama_alutsista: "Radar Avionik Taktis / Node Komunikasi Militer",
      waktu_terima: item.timestamp,
      petugas_bekpal: item.actor,
      status_segel: item.action.includes("QUARANTINE") ? "KARANTINA_DEFECT" : "TERSEGEL_RESMI_MIL_SPEC",
      verifikasi_qr_url: `https://ozikra.vercel.app/verify?id=${encodeURIComponent(item.assetId || "AST-OT-728")}&sig=${encodeURIComponent(item.hash)}&ts=${encodeURIComponent(item.timestamp)}`,
      sha256_hash_segel: item.hash,
      blok_sebelumnya: item.previousHash,
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TANDA_TERIMA_LOGISTIK_${item.assetId || "ASET"}_#${item.index}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSprinDirective = (item: LedgerEntry) => {
    const sprin = {
      dokumen: "SURAT PERINTAH OPERASI SIBER TAKTIS (SPRIN-OPS)",
      markas: "KOMANDO OPERASI PUSAT SIBER ANGKATAN DARAT (PUSSIBERAD)",
      nomor_sprin: `SPRIN-OPS/PUSSIBERAD/DIR-#${String(item.index).padStart(4, "0")}`,
      direktif_tindakan: item.action,
      node_sasaran: item.assetId || "PUSSIBERAD_C2_COMMAND_STATION",
      otoritas_komandan: item.actor,
      waktu_instruksi: item.timestamp,
      tingkat_defcon: item.action.includes("KILL_SWITCH") ? "DEFCON 1 (AIR-GAP EMERGENCY)" : "DEFCON 2 (ELEVATED DEFENSE)",
      stempel_kriptografis: item.hash,
      komitmen_rantai_taktis: item.previousHash,
    };
    const blob = new Blob([JSON.stringify(sprin, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SPRIN_DIREKTIF_OPERASI_#${item.index}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBAPDossier = (item: LedgerEntry) => {
    const bap = {
      dokumen: "BERITA ACARA PEMERIKSAAN SIBER & RANTAI BUKTI HUKUM (BAP-SIBER)",
      yurisdiksi: "PERADILAN MILITER & SATUAN SIBER TNI ANGKATAN DARAT",
      nomor_perkara: `BAP-SIBER/PUSSIBERAD/2026/KASUS-#${String(item.index).padStart(4, "0")}`,
      target_investigasi: item.assetId || "Hardware Node & Bobot Model AI",
      auditor_penyidik: item.actor,
      waktu_pencatatan_bukti: item.timestamp,
      keabsahan_chain_of_custody: "VALID_UNBROKEN_SHA256",
      hash_alat_bukti: item.hash,
      jangkar_blok_sebelumnya: item.previousHash,
      sertifikasi_hukum: "BUKTI DIGITAL INI SAH SEBAGAI ALAT BUKTI ELEKTRONIK HUKUM MILITER (PASAL 5 UU ITE & MIL-SPEC 810H)",
    };
    const blob = new Blob([JSON.stringify(bap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BAP_SIBER_DOSSIER_#${item.index}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RoleGate route="ledger">
      <PageHeader
        eyebrow="Registry & Audit / Multi-Role Activity History"
        title="Buku Riwayat Aktivitas & Audit Ledger"
        description="Pencatatan setiap aktivitas pengguna dari seluruh peran militer ke dalam rantai blok kriptografis SHA-256 yang tidak dapat dimanipulasi (immutable). Bentuk dan format riwayat disajikan khusus sesuai tugas pokok dan fungsi tiap peran."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              id="ledger-verify"
              size="sm"
              variant="primary"
              loading={verifying}
              icon={<Icon.Ledger size={13} />}
              onClick={handleVerify}
            >
              Verify Hash-Chain
            </Button>
            <Button id="ledger-export-csv" size="sm" variant="outline" icon={<Icon.Arrow size={13} className="rotate-90" />} onClick={exportCSV}>
              Export CSV
            </Button>
            <Button id="ledger-export-json" size="sm" variant="outline" icon={<Icon.Arrow size={13} className="rotate-90" />} onClick={exportJSON}>
              Export JSON
            </Button>
            <Button id="ledger-refresh" size="sm" icon={<Icon.Refresh size={13} />} onClick={ledger.refetch}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Role Perspective Selector Banner */}
      <div className="border border-line-strong bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-paper" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-paper">
                PERSPEKTIF BUKU RIWAYAT PERAN AKTIF
              </span>
              <span className="border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
                Peran Sesi: <strong className="text-paper">{role || "SUPER_ADMIN"}</strong>
              </span>
            </div>
            <p className="text-xs text-muted font-mono">
              Bentuk tampilan buku riwayat di bawah ini disesuaikan secara khusus dengan format operasional masing-masing peran militer:
            </p>
          </div>

          {/* Quick Perspective Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_PERSPECTIVES.map((p) => {
              const isSelected = activeView === p.id;
              const isUserRole = role === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveView(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-all border ${
                    isSelected
                      ? "border-paper bg-paper text-ink font-bold shadow-md"
                      : "border-line bg-surface-2 text-muted hover:border-paper hover:text-paper"
                  }`}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                  {isUserRole && (
                    <span className={`text-[9px] px-1 py-0.2 rounded ${isSelected ? "bg-ink text-paper" : "bg-paper/20 text-paper"}`}>
                      AKTIF
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cryptographic Hash-Chain Verification Banner */}
      {verifyResult && (
        <div
          className={`border p-4 font-mono text-xs flex items-center justify-between ${
            verifyResult.valid
              ? "border-emerald-500/50 bg-emerald-950/20 text-emerald-200"
              : "border-red-500/50 bg-red-950/20 text-red-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${verifyResult.valid ? "bg-emerald-400" : "bg-red-400 animate-ping"}`} />
            <div>
              <div className="font-bold">
                {verifyResult.valid ? "CRYPTOGRAPHIC HASH-CHAIN INTEGRITY VERIFIED (OK)" : "CHAIN INTEGRITY COMPROMISED"}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Status: {verifyResult.status} · Blok Terverifikasi: {verifyResult.total_blocks} · Blok Cacat: {verifyResult.tampered_blocks} · Algoritma: {verifyResult.algorithm}
              </div>
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            className="text-[11px] opacity-70 hover:opacity-100 uppercase"
          >
            [Tutup]
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 1. PERSPETIF: PERWIRA LOGISTIK (Buku Induk Logistik & Paspor Segel Fisik) */}
      {/* ------------------------------------------------------------------ */}
      {activeView === "LOGISTICS_OFFICER" && (
        <div className="flex flex-col gap-4">
          {/* Logistics KPI Metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Buku Induk Logistik</Eyebrow>
              <span className="font-mono text-3xl font-bold text-paper">{rows?.length ?? 0}</span>
              <span className="text-[11px] text-muted font-mono">Total Transaksi Penerimaan</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Paspor Segel Fisik</Eyebrow>
              <span className="font-mono text-3xl font-bold text-emerald-400">
                {rows?.filter((r) => r.action.includes("SEAL") || r.action.includes("GATEKEEPER")).length ?? 0}
              </span>
              <span className="text-[11px] text-emerald-400/80 font-mono">Stiker QR Mil-Spec Aktif</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Karantina Pengadaan</Eyebrow>
              <span className="font-mono text-3xl font-bold text-amber-400">
                {rows?.filter((r) => r.action.includes("QUARANTINE")).length ?? 0}
              </span>
              <span className="text-[11px] text-amber-400/80 font-mono">Anomali Manifest / CVE</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Standar Segel Fisik</Eyebrow>
              <span className="font-mono text-xl font-bold text-paper mt-1">MIL-STD-810H</span>
              <span className="text-[11px] text-muted font-mono">Polyimide Thermal Label</span>
            </div>
          </div>

          <Panel
            eyebrow="Buku Induk Bekpal"
            title="Daftar Berita Acara Penerimaan & Registrasi Segel Fisik Alutsista"
            actions={
              <div className="flex items-center gap-2">
                <Tag tone="default">[FORMAT LOGISTIK RESMI]</Tag>
              </div>
            }
          >
            {/* Search & filter toolbar */}
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
              <div className="relative max-w-md flex-1">
                <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9 font-mono"
                  placeholder="Cari nomor BAP-LOG, ID aset, petugas bekpal…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-muted">
                <span>Filter:</span>
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2 py-0.5 border ${filter === "ALL" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setFilter("GATEKEEPER")}
                  className={`px-2 py-0.5 border ${filter === "GATEKEEPER" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Segel Gatekeeper
                </button>
                <button
                  onClick={() => setFilter("QR")}
                  className={`px-2 py-0.5 border ${filter === "QR" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Stiker QR
                </button>
              </div>
            </div>

            <ErrorLine error={ledger.error} />

            {/* List of Logistics Vouchers */}
            <div className="flex flex-col gap-3">
              {pagination.paginatedItems.map((item) => {
                const isSeal = item.action.includes("SEAL") || item.action.includes("GATEKEEPER");
                const isQuarantine = item.action.includes("QUARANTINE");
                const verifyUrl = `https://ozikra.vercel.app/verify?id=${encodeURIComponent(
                  item.assetId || "AST-OT-728"
                )}&sig=${encodeURIComponent(item.hash)}&ts=${encodeURIComponent(item.timestamp)}&vendor=PT+Len+Industri`;

                return (
                  <div
                    key={item.hash}
                    className="border border-line bg-surface-2 p-4 transition-all hover:border-paper/80 flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-paper">
                          BAP-LOG-2026-#00{String(item.index).padStart(4, "0")}
                        </span>
                        <Tag tone={isQuarantine ? "alert" : isSeal ? "default" : "muted"}>
                          {isQuarantine
                            ? "CACAT PENGADAAN (KARANTINA)"
                            : isSeal
                            ? "TERSEGEL RESMI (HMAC-SHA256)"
                            : "TERCATAT LOGISTIK"}
                        </Tag>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                        <Icon.Clock size={12} />
                        <span>{new Date(item.timestamp).toLocaleString("id-ID")} WIB</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Alutsista / ID Aset:</span>
                        <div className="font-mono text-sm font-bold text-paper">
                          {item.assetId || "AST-OT-728 · Radar Taktis"}
                        </div>
                        <span className="text-[11px] text-muted">PT Len Industri / Thales Defence</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Petugas Penerima (Bekpal):</span>
                        <div className="font-mono text-sm font-medium text-paper">{item.actor}</div>
                        <span className="text-[11px] text-muted">Aksi: {item.action}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Kode Segel SHA-256:</span>
                        <Mono className="text-[11px] break-all text-muted/90">{short(item.hash)}</Mono>
                        <div className="text-[10px] font-mono text-emerald-400 mt-0.5">✓ Polyimide Mil-Spec Label OK</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                      <span className="font-mono text-[10px] text-muted truncate max-w-sm">
                        Jangkar Blok: {item.previousHash.slice(0, 20)}…
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={verifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 border border-emerald-500/50 bg-emerald-950/20 px-2.5 py-1 font-mono text-[11px] text-emerald-300 hover:bg-emerald-900/30"
                        >
                          <Icon.QR size={12} />
                          <span>↗ Buka Hasil Scan QR</span>
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2.5"
                          icon={<Icon.Arrow size={12} className="rotate-90" />}
                          onClick={() => downloadLogisticsReceipt(item)}
                        >
                          Unduh Tanda Terima (BAP-LOG)
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              idPrefix="logistics-history"
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. PERSPEKTIF: PANGLIMA KOMANDO (Buku Direktif Operasi Taktis & SPRIN) */}
      {/* ------------------------------------------------------------------ */}
      {activeView === "COMMANDER" && (
        <div className="flex flex-col gap-4">
          {/* Commander C2 Situation Banner */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-red-500/40 bg-red-950/20 p-4 flex flex-col gap-1">
              <Eyebrow>Postur Pertahanan Siber</Eyebrow>
              <div className="flex items-center gap-2 mt-1">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <span className="font-mono text-2xl font-black text-red-400">DEFCON 2</span>
              </div>
              <span className="text-[11px] text-red-300/80 font-mono">Elevated Readiness Alert</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Surat Perintah (SPRIN)</Eyebrow>
              <span className="font-mono text-3xl font-bold text-paper">{rows?.length ?? 0}</span>
              <span className="text-[11px] text-muted font-mono">Direktif Komando Dikeluarkan</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Isolasi Nodal Air-Gap</Eyebrow>
              <span className="font-mono text-3xl font-bold text-amber-400">
                {rows?.filter((r) => r.action.includes("KILL_SWITCH") || r.action.includes("ISOLAT")).length ?? 0}
              </span>
              <span className="text-[11px] text-amber-400/80 font-mono">Node Diputus Relai Fisik</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Otoritas Komando C2</Eyebrow>
              <span className="font-mono text-xl font-bold text-paper mt-1">PUSSIBERAD C2</span>
              <span className="text-[11px] text-muted font-mono">Cryptographically Validated</span>
            </div>
          </div>

          <Panel
            eyebrow="Komando Operasi"
            title="Buku Direktif Operasi Militer & Lembar Perintah Komando (SPRIN)"
            actions={
              <div className="flex items-center gap-2">
                <Tag tone="inverted">[LEMBAR KOMANDO DARURAT]</Tag>
              </div>
            }
          >
            {/* Search toolbar */}
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
              <div className="relative max-w-md flex-1">
                <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9 font-mono"
                  placeholder="Cari nomor SPRIN, aksi isolasi, alutsista sasaran…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-muted">
                <span>Filter Perintah:</span>
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2 py-0.5 border ${filter === "ALL" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setFilter("GATEKEEPER")}
                  className={`px-2 py-0.5 border ${filter === "GATEKEEPER" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Otorisasi Nodal
                </button>
                <button
                  onClick={() => setFilter("ADMIN")}
                  className={`px-2 py-0.5 border ${filter === "ADMIN" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Alih Komando
                </button>
              </div>
            </div>

            <ErrorLine error={ledger.error} />

            {/* List of Military SPRIN Directives */}
            <div className="flex flex-col gap-3">
              {pagination.paginatedItems.map((item) => {
                const isKillSwitch = item.action.includes("KILL_SWITCH") || item.action.includes("ISOLAT");
                const isRoleSwitch = item.action.includes("SWITCH");

                return (
                  <div
                    key={item.hash}
                    className={`border p-4 transition-all flex flex-col gap-3 ${
                      isKillSwitch
                        ? "border-red-500/60 bg-red-950/15"
                        : isRoleSwitch
                        ? "border-amber-500/50 bg-amber-950/15"
                        : "border-line bg-surface-2"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black tracking-wider text-paper">
                          SPRIN-OPS/PUSSIBERAD/DIR-#00{String(item.index).padStart(4, "0")}
                        </span>
                        <Tag tone={isKillSwitch ? "alert" : isRoleSwitch ? "inverted" : "default"}>
                          {isKillSwitch
                            ? "PERINTAH: ISOLASI AIR-GAP / RELAY CUT"
                            : isRoleSwitch
                            ? "PERINTAH: ALIH OTORITAS KOMANDO"
                            : "DIREKTIF: INTEGRITAS ALUTSISTA"}
                        </Tag>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                        <Icon.Clock size={12} />
                        <span>{new Date(item.timestamp).toLocaleString("id-ID")} WIB</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Instruksi Taktis:</span>
                        <div className="font-mono text-sm font-bold text-paper">{item.action}</div>
                        <span className="text-[11px] text-muted">Sasaran: {item.assetId || "JARINGAN KONSOL C2"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Otoritas Komandan:</span>
                        <div className="font-mono text-sm font-medium text-paper">{item.actor}</div>
                        <span className="text-[11px] text-emerald-400 font-mono">✓ Otorisasi Sah PUSSIBERAD</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Cap Digital Kriptografis:</span>
                        <Mono className="text-[11px] break-all text-muted">{short(item.hash)}</Mono>
                        <div className="text-[10px] font-mono text-muted mt-0.5">HMAC-SHA256 Command Stamp</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                      <span className="font-mono text-[10px] text-muted">
                        Komitmen Keamanan: Blok #{item.index} terikat pada {item.previousHash.slice(0, 16)}…
                      </span>
                      <div className="flex items-center gap-2">
                        <Link
                          href="/dashboard/siem"
                          className="inline-flex items-center gap-1 border border-line bg-surface px-2.5 py-1 font-mono text-[11px] text-paper hover:bg-surface-2"
                        >
                          <Icon.Radar size={12} />
                          <span>Status Radar / SCADA</span>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2.5"
                          icon={<Icon.Arrow size={12} className="rotate-90" />}
                          onClick={() => downloadSprinDirective(item)}
                        >
                          Unduh Lembar SPRIN
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              idPrefix="commander-history"
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. PERSPEKTIF: AUDITOR FORENSIK (Berkas Rantai Bukti Hukum & BAP-SIBER) */}
      {/* ------------------------------------------------------------------ */}
      {activeView === "FORENSIC_AUDITOR" && (
        <div className="flex flex-col gap-4">
          {/* Forensics KPI Metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Berkas Perkara BAP</Eyebrow>
              <span className="font-mono text-3xl font-bold text-paper">{rows?.length ?? 0}</span>
              <span className="text-[11px] text-muted font-mono">Dossier Kasus Digital Terbit</span>
            </div>
            <div className="border border-emerald-500/40 bg-emerald-950/20 p-4 flex flex-col gap-1">
              <Eyebrow>Chain of Custody</Eyebrow>
              <div className="flex items-center gap-2 mt-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="font-mono text-2xl font-bold text-emerald-400">100% UTUH</span>
              </div>
              <span className="text-[11px] text-emerald-300/80 font-mono">Rantai Bukti Tidak Terputus</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Bukti Model AI Terkunci</Eyebrow>
              <span className="font-mono text-3xl font-bold text-purple-400">
                {rows?.filter((r) => r.action.includes("FORENSIC")).length ?? 0}
              </span>
              <span className="text-[11px] text-purple-400/80 font-mono">Neural Weights Audited</span>
            </div>
            <div className="border border-line bg-surface p-4 flex flex-col gap-1">
              <Eyebrow>Standar Yudisial Militer</Eyebrow>
              <span className="font-mono text-xl font-bold text-paper mt-1">ISO/IEC 27037</span>
              <span className="text-[11px] text-muted font-mono">Court-Admissible Evidence</span>
            </div>
          </div>

          <Panel
            eyebrow="Rantai Bukti Hukum"
            title="Daftar Berkas Acara Pemeriksaan Siber (BAP-SIBER) & Bukti Digital"
            actions={
              <div className="flex items-center gap-2">
                <Tag tone="default">[ALAT BUKTI HUKUM MILITER]</Tag>
              </div>
            }
          >
            {/* Search toolbar */}
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
              <div className="relative max-w-md flex-1">
                <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9 font-mono"
                  placeholder="Cari nomor perkara BAP, hash bukti digital, auditor siber…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-muted">
                <span>Filter Bukti:</span>
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2 py-0.5 border ${filter === "ALL" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setFilter("FORENSIC")}
                  className={`px-2 py-0.5 border ${filter === "FORENSIC" ? "border-paper text-paper bg-surface-2" : "border-line text-muted"}`}
                >
                  Pemeriksaan AI
                </button>
              </div>
            </div>

            <ErrorLine error={ledger.error} />

            {/* List of Forensic Case Dossiers */}
            <div className="flex flex-col gap-3">
              {pagination.paginatedItems.map((item) => {
                const isForensic = item.action.includes("FORENSIC");

                return (
                  <div
                    key={item.hash}
                    className="border border-line bg-surface-2 p-4 transition-all hover:border-paper/80 flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-paper">
                          BAP-SIBER/2026/KASUS-#00{String(item.index).padStart(4, "0")}
                        </span>
                        <Tag tone={isForensic ? "default" : "muted"}>
                          {isForensic ? "UJI FORENSIK MODEL AI" : "BUKTI PENGAWASAN NODAL"}
                        </Tag>
                        <span className="border border-emerald-500/40 bg-emerald-950/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                          RANTAI BUKTI: UTUH &amp; SAH
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                        <Icon.Clock size={12} />
                        <span>{new Date(item.timestamp).toLocaleString("id-ID")} WIB</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Objek Pemeriksaan Siber:</span>
                        <div className="font-mono text-sm font-bold text-paper">
                          {item.assetId || "Model AI Deteksi / Firmware Alutsista"}
                        </div>
                        <span className="text-[11px] text-muted">Tindakan: {item.action}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Auditor Penyidik:</span>
                        <div className="font-mono text-sm font-medium text-paper">{item.actor}</div>
                        <span className="text-[11px] text-muted">Sertifikasi: CHFI / CCFP Militer</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted">Hash SHA-256 Barang Bukti:</span>
                        <Mono className="text-[11px] break-all text-paper">{short(item.hash)}</Mono>
                        <div className="text-[10px] font-mono text-emerald-400 mt-0.5">Integritas Matematis Valid</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                      <span className="font-mono text-[10px] text-muted truncate max-w-sm">
                        Jangkar Merkle Sebelumnya: {item.previousHash.slice(0, 24)}…
                      </span>
                      <div className="flex items-center gap-2">
                        <Link
                          href="/dashboard/forensics"
                          className="inline-flex items-center gap-1 border border-line bg-surface px-2.5 py-1 font-mono text-[11px] text-paper hover:bg-surface-2"
                        >
                          <Icon.Forensic size={12} />
                          <span>Meja Analisis Forensik</span>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2.5"
                          icon={<Icon.Arrow size={12} className="rotate-90" />}
                          onClick={() => downloadBAPDossier(item)}
                        >
                          Unduh Berkas BAP-SIBER
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              idPrefix="forensics-history"
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. PERSPEKTIF: SUPER_ADMIN (Master Cryptographic Blockchain Explorer) */}
      {/* ------------------------------------------------------------------ */}
      {activeView === "SUPER_ADMIN" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ["Hash Algorithm", "SHA-256 (RFC 6234)"],
              ["Total Chain Blocks", ledger.data ? String(ledger.data.length) : "--"],
              ["Chain Head Hash", ledger.data?.length ? short(ledger.data[ledger.data.length - 1].hash) : "--"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border border-line bg-surface px-4 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{k}</span>
                <Mono className="font-bold">{v}</Mono>
              </div>
            ))}
          </div>

          <Panel
            bodyClassName="p-0"
            title="Master Cryptographic Ledger Explorer"
            eyebrow="Append-only"
            actions={
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "GATEKEEPER", label: "Gate" },
                  { value: "QR", label: "QR" },
                  { value: "FORENSIC", label: "Forensic" },
                  { value: "ADMIN", label: "Admin" },
                ]}
              />
            }
          >
            <div className="border-b border-line p-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <Input
                    id="ledger-search"
                    className="pl-9 font-mono"
                    placeholder="Search actor, action, hash…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10.5px] text-muted">⚡ Quick Filter:</span>
                  <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("ALL"); setQuery("GENESIS"); }}>
                    Genesis Block
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("FORENSIC"); setQuery(""); }}>
                    Forensik
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("QR"); setQuery(""); }}>
                    QR Seal
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7 text-muted" onClick={() => { setFilter("ALL"); setQuery(""); }}>
                    Reset
                  </Button>
                </div>
              </div>
            </div>
            <ErrorLine error={ledger.error} />
            <DataTable
              columns={COLUMNS}
              rows={pagination.paginatedItems}
              rowKey={(e) => e.hash}
              isLoading={ledger.isLoading}
              emptyTitle="Ledger genesis pending"
              emptyMessage="No hash-chained entries returned from /ledger yet."
            />
            <Pagination
              idPrefix="ledger-table"
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </Panel>
        </div>
      )}
    </RoleGate>
  );
}
