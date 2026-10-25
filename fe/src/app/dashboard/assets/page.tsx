"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  DataTable,
  ErrorLine,
  Input,
  IntegrityTag,
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
import { fetchAssets } from "@/lib/api";
import { canIntakeAssets } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import { ASSET_TYPE_LABEL, type Asset, type IntegrityState } from "@/types/sentinel";

type Filter = "ALL" | IntegrityState;

const COLUMNS: Column<Asset>[] = [
  { key: "id", header: "Asset ID", render: (a) => <Mono>{a.id}</Mono> },
  { key: "name", header: "Name", render: (a) => <span className="text-[13px] font-medium">{a.name}</span> },
  { key: "type", header: "Type", render: (a) => <span className="text-[13px] text-muted">{ASSET_TYPE_LABEL[a.type]}</span> },
  { key: "class", header: "Class", render: (a) => <Tag tone="muted">{a.classification}</Tag> },
  { key: "vendor", header: "Vendor", render: (a) => <span className="text-[13px] text-muted">{a.vendor}</span> },
  { key: "sn", header: "Serial", render: (a) => <Mono className="text-muted">{a.serialNumber}</Mono> },
  {
    key: "cve",
    header: "CVE",
    render: (a) => (a.cveCount > 0 ? <Tag tone="inverted">{a.cveCount} Open</Tag> : <Mono className="text-subtle">0</Mono>),
  },
  { key: "trust", header: "Trust", render: (a) => <Mono>{a.trustScore == null ? "--" : `${a.trustScore}%`}</Mono> },
  {
    key: "fw",
    header: "Firmware SHA-256",
    render: (a) => <Mono className="block max-w-[160px] truncate text-subtle">{a.firmwareHash ?? "--"}</Mono>,
  },
  { key: "state", header: "State", render: (a) => <IntegrityTag state={a.integrityState} /> },
];

export default function AssetsPage() {
  const { role } = useSession();
  const assets = useAsyncResource(fetchAssets);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const canIntake = role ? canIntakeAssets(role) : false;

  const rows = useMemo(() => {
    if (!assets.data) return null;
    const q = query.toLowerCase();
    return assets.data.filter(
      (a) =>
        (filter === "ALL" || a.integrityState === filter) &&
        (!q || [a.id, a.name, a.vendor, a.serialNumber].some((v) => v.toLowerCase().includes(q))),
    );
  }, [assets.data, query, filter]);

  // Strict 10 / 20 items per page pagination
  const pagination = usePagination(rows, 10);

  const exportCSV = () => {
    if (!rows || rows.length === 0) return;
    const headers = ["ID", "Name", "Type", "Classification", "Vendor", "SerialNumber", "CVECount", "TrustScore", "IntegrityState", "FirmwareHash"];
    const csvContent = [
      headers.join(","),
      ...rows.map((a) => [
        `"${a.id}"`,
        `"${a.name.replace(/"/g, '""')}"`,
        `"${a.type}"`,
        `"${a.classification}"`,
        `"${a.vendor.replace(/"/g, '""')}"`,
        `"${a.serialNumber}"`,
        a.cveCount,
        a.trustScore ?? "",
        `"${a.integrityState}"`,
        `"${a.firmwareHash}"`,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OZIK_ASSETS_EXPORT_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!rows || rows.length === 0) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OZIK_ASSETS_EXPORT_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RoleGate route="assets">
      <PageHeader
        eyebrow="Registry & Audit / Inventory"
        title="IT/OT Asset Registry"
        description="Master inventory of every hardware and software asset sealed through the gatekeeper, with live CVE exposure and integrity state."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button id="assets-export-csv" size="sm" variant="outline" icon={<Icon.Arrow size={13} className="rotate-90" />} onClick={exportCSV}>
              Export CSV
            </Button>
            <Button id="assets-export-json" size="sm" variant="outline" icon={<Icon.Arrow size={13} className="rotate-90" />} onClick={exportJSON}>
              Export JSON
            </Button>
            <Button id="assets-refresh" size="sm" icon={<Icon.Refresh size={13} />} onClick={assets.refetch}>
              Refresh
            </Button>
            {canIntake && (
              <Link href="/dashboard/gatekeeper">
                <Button id="assets-intake" size="sm" variant="primary" icon={<Icon.Gate size={13} />}>
                  Intake New Asset
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <Panel
        bodyClassName="p-0"
        title="Registered Assets"
        eyebrow={`${rows?.length ?? 0} records`}
        actions={
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "SECURE", label: "Secure" },
              { value: "MAINTENANCE", label: "Maint." },
              { value: "QUARANTINED", label: "Quarantine" },
              { value: "COMPROMISED", label: "Compromised" },
            ]}
          />
        }
      >
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                id="assets-search"
                className="pl-9"
                placeholder="Search by ID, name, vendor, serial…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-muted">⚡ Auto-Fill Filter:</span>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setQuery("Radar"); setFilter("ALL"); }}>
                Radar (OT)
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setQuery(""); setFilter("COMPROMISED"); }}>
                Compromised
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7" onClick={() => { setQuery("Server"); setFilter("ALL"); }}>
                Server Taktis
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-[10px] py-0.5 px-2 h-7 text-muted" onClick={() => { setQuery(""); setFilter("ALL"); }}>
                Reset
              </Button>
            </div>
          </div>
        </div>
        <ErrorLine error={assets.error} />
        <DataTable
          columns={COLUMNS}
          rows={pagination.paginatedItems}
          rowKey={(a) => a.id}
          isLoading={assets.isLoading}
          emptyTitle="Registry empty"
          emptyMessage="No assets returned from /assets. Register assets via the Supply-Chain Gatekeeper."
        />
        <Pagination
          idPrefix="assets-table"
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
