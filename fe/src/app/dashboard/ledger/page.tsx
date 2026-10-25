"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  DataTable,
  ErrorLine,
  Input,
  Mono,
  PageHeader,
  Pagination,
  Panel,
  Segmented,
  usePagination,
  type Column,
} from "@/components/ui";
import { useAsyncResource } from "@/hooks/use-async";
import { fetchLedger, verifyLedgerIntegrity } from "@/lib/api";
import type { LedgerEntry } from "@/types/sentinel";

type Filter = "ALL" | "GATEKEEPER" | "QR" | "FORENSIC" | "ADMIN";

const short = (h: string) => (h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h);

const COLUMNS: Column<LedgerEntry>[] = [
  { key: "idx", header: "#", render: (e) => <Mono className="text-subtle">{String(e.index).padStart(6, "0")}</Mono> },
  { key: "ts", header: "Timestamp", render: (e) => <Mono className="text-muted">{new Date(e.timestamp).toLocaleString("en-GB")}</Mono> },
  { key: "actor", header: "Actor", render: (e) => <span className="text-[13px]">{e.actor}</span> },
  { key: "action", header: "Action", render: (e) => <Mono>{e.action}</Mono> },
  { key: "asset", header: "Asset", render: (e) => <Mono className="text-muted">{e.assetId ?? "--"}</Mono> },
  { key: "prev", header: "Prev Hash", render: (e) => <Mono className="text-subtle" >{short(e.previousHash)}</Mono> },
  { key: "hash", header: "Block SHA-256", render: (e) => <Mono>{short(e.hash)}</Mono> },
];

export default function LedgerPage() {
  const ledger = useAsyncResource(fetchLedger);
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

  const rows = useMemo(() => {
    if (!ledger.data) return null;
    const q = query.toLowerCase();
    return ledger.data.filter(
      (e) =>
        (filter === "ALL" || e.action.toUpperCase().includes(filter)) &&
        (!q || [e.actor, e.action, e.hash, e.assetId ?? ""].some((v) => v.toLowerCase().includes(q))),
    );
  }, [ledger.data, query, filter]);

  // Strict 10 / 20 items per page pagination
  const pagination = usePagination(rows, 10);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await verifyLedgerIntegrity();
      setVerifyResult(res);
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
    link.download = `OZIK_LEDGER_EXPORT_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!rows || rows.length === 0) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OZIK_LEDGER_EXPORT_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RoleGate route="ledger">
      <PageHeader
        eyebrow="Registry & Audit / Ledger"
        title="Immutable Audit Ledger"
        description="Append-only, SHA-256 hash-chained record of every operator and system action. Each block commits to its predecessor."
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
                Status: {verifyResult.status} · Blocks Validated: {verifyResult.total_blocks} · Tampered: {verifyResult.tampered_blocks} · Algorithm: {verifyResult.algorithm}
              </div>
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            className="text-[11px] opacity-70 hover:opacity-100 uppercase"
          >
            [Close]
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ["Hash Algorithm", "SHA-256"],
          ["Chain Blocks", ledger.data ? String(ledger.data.length) : "--"],
          ["Chain Head", ledger.data?.length ? short(ledger.data[ledger.data.length - 1].hash) : "--"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border border-line bg-surface px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{k}</span>
            <Mono>{v}</Mono>
          </div>
        ))}
      </div>

      <Panel
        bodyClassName="p-0"
        title="Ledger Blocks"
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
              <span className="font-mono text-[10.5px] text-muted">⚡ Auto-Fill Filter:</span>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("ALL"); setQuery("GENESIS"); }}>
                Genesis Block
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("FORENSIC"); setQuery(""); }}>
                Forensik
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setFilter("QR"); setQuery(""); }}>
                QR Maintenance
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
    </RoleGate>
  );
}
