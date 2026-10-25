"use client";

import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import { TelemetryFeed } from "@/components/telemetry-feed";
import {
  Button,
  cn,
  DataTable,
  ErrorLine,
  IntegrityTag,
  MetricCard,
  Mono,
  PageHeader,
  Pagination,
  Panel,
  Tag,
  usePagination,
  type Column,
} from "@/components/ui";
import { useAsyncResource } from "@/hooks/use-async";
import { fetchCriticalAssets, fetchDashboardMetrics } from "@/lib/api";
import { canViewSiemFeed } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import type { Asset } from "@/types/sentinel";

const ASSET_COLUMNS: Column<Asset>[] = [
  {
    key: "id",
    header: "Asset ID",
    render: (a) => (
      <div className="flex flex-col">
        <Mono>{a.id}</Mono>
        <span className="text-[11px] text-muted">{a.name}</span>
      </div>
    ),
  },
  { key: "class", header: "Classification", render: (a) => <Tag tone="muted">{a.classification}</Tag> },
  {
    key: "trust",
    header: "Trust Score",
    render: (a) =>
      a.trustScore == null ? (
        <Mono className="text-subtle">--</Mono>
      ) : (
        <div className="flex items-center gap-2">
          <div className="h-1 w-16 bg-line">
            <div className="h-full bg-paper" style={{ width: `${a.trustScore}%` }} />
          </div>
          <Mono>{a.trustScore}%</Mono>
        </div>
      ),
  },
  {
    key: "qr",
    header: "QR Window",
    render: (a) => <Tag tone={a.qrWindowStatus === "OPEN" ? "default" : "muted"}>{a.qrWindowStatus}</Tag>,
  },
  { key: "state", header: "Integrity State", render: (a) => <IntegrityTag state={a.integrityState} /> },
];

export default function CommandCenterPage() {
  const { role } = useSession();
  const metrics = useAsyncResource(fetchDashboardMetrics);
  const assets = useAsyncResource(fetchCriticalAssets);
  const showSiem = role ? canViewSiemFeed(role) : true;

  // Strict 10 / 20 items per page pagination
  const pagination = usePagination(assets.data, 10);

  return (
    <RoleGate route="command">
      <PageHeader
        eyebrow="Overview / Command Center"
        title="Command Center"
        description="Unified readiness posture across supply-chain intake, physical maintenance windows and cyber telemetry."
        actions={
          <Button
            id="command-refresh"
            size="sm"
            icon={<Icon.Refresh size={13} />}
            onClick={() => {
              metrics.refetch();
              assets.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />

      <ErrorLine error={metrics.error} />

      {/* Row 1 — KPI cards */}
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", showSiem ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <MetricCard
          index="K-01"
          label="Registered IT/OT Assets"
          hint="Total inventory"
          value={metrics.data?.registeredAssets}
          isLoading={metrics.isLoading}
        />
        <MetricCard
          index="K-02"
          label="Quarantined (Pre-Deploy)"
          hint="High CVE risk · Phase 01"
          value={metrics.data?.quarantinedAssets}
          isLoading={metrics.isLoading}
        />
        <MetricCard
          index="K-03"
          label="Active QR Maintenance Windows"
          hint="Technician scans · Phase 02"
          value={metrics.data?.activeMaintenanceWindows}
          isLoading={metrics.isLoading}
        />
        {showSiem && (
          <MetricCard
            index="K-04"
            label="Unverified Anomalies"
            hint="Unauthorised tampering"
            value={metrics.data?.unverifiedAnomalies}
            isLoading={metrics.isLoading}
            emphasis
          />
        )}
      </div>

      {/* Row 2 — split grid */}
      <div className={cn("grid grid-cols-1 gap-4", showSiem ? "xl:grid-cols-5" : "xl:grid-cols-1")}>
        <Panel
          className={showSiem ? "xl:col-span-3" : "xl:col-span-1"}
          eyebrow="Matrix"
          title="Critical Asset Readiness Matrix"
          bodyClassName="p-0"
          actions={
            <div className="hidden items-center gap-3 font-mono text-[10px] text-muted md:flex">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-paper" />Secure</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-muted" />Maint.</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 border border-paper animate-pulse-border" />Compromised</span>
            </div>
          }
        >
          <ErrorLine error={assets.error} />
          <DataTable
            columns={ASSET_COLUMNS}
            rows={pagination.paginatedItems}
            rowKey={(a) => a.id}
            isLoading={assets.isLoading}
            emptyTitle="No critical assets registered"
            emptyMessage="Assets sealed through the Supply-Chain Gatekeeper will appear here once the backend is connected."
            rowClassName={(a) => (a.integrityState === "COMPROMISED" ? "bg-paper/[0.04]" : undefined)}
          />
          <Pagination
            idPrefix="command-assets-table"
            currentPage={pagination.currentPage}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </Panel>

        {showSiem && <TelemetryFeed className="xl:col-span-2" />}
      </div>
    </RoleGate>
  );
}
