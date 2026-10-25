"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  cn,
  DataTable,
  EmptyState,
  ErrorLine,
  Eyebrow,
  Field,
  Input,
  Mono,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Tag,
  type Column,
} from "@/components/ui";
import { useAction, useAsyncResource } from "@/hooks/use-async";
import {
  API_BASE_URL,
  fetchAssets,
  fetchAssetTopology,
  fetchPagedTelemetryCorrelations,
  onSendIoTTelemetry,
  onTriggerQRCheckIn,
} from "@/lib/api";
import { canTriggerMaintenanceWindow } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import dynamic from "next/dynamic";
import type { AssetTopology, TelemetryCorrelation } from "@/types/sentinel";

const TacticalMap = dynamic(
  () => import("@/components/siem/tactical-map").then((mod) => mod.TacticalMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] w-full items-center justify-center border border-line bg-surface font-mono text-xs text-muted">
        [MEMUAT PETA TAKTIS INTERAKTIF (LEAFLET.JS)...]
      </div>
    ),
  }
);

const CORRELATION_COLUMNS: Column<TelemetryCorrelation>[] = [
  {
    key: "ts",
    header: "Timestamp",
    render: (c) => <Mono className="text-muted">{new Date(c.timestamp).toLocaleTimeString("en-GB", { hour12: false })}</Mono>,
  },
  { key: "asset", header: "Asset", render: (c) => <Mono>{c.assetId}</Mono> },
  { key: "net", header: "Network / Firmware Event", render: (c) => <span className="text-[12.5px] leading-snug">{c.networkEvent}</span>, className: "whitespace-normal min-w-[200px]" },
  {
    key: "auth",
    header: "Physical QR Authorization",
    render: (c) => (
      <Tag tone={c.physicalAuthorization === "AUTHORIZED" ? "default" : c.physicalAuthorization === "UNAUTHORIZED" ? "inverted" : "muted"}>
        {c.physicalAuthorization}
      </Tag>
    ),
  },
  {
    key: "verdict",
    header: "Verdict",
    render: (c) => (c.verdict === "ANOMALY" ? <Tag tone="alert">[Anomaly]</Tag> : <Tag tone="muted">Nominal</Tag>),
  },
];

function useCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt || remaining == null) return "--:--";
  const s = Math.floor(remaining / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function TopologyView({ topology }: { topology: AssetTopology }) {
  const size = 320;
  const r = 120;
  const pos = new Map(
    topology.nodes.map((n, i) => {
      const a = (i / topology.nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [n.id, { x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) }];
    }),
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      {topology.edges.map((e, idx) => {
        const s = pos.get(e.source);
        const t = pos.get(e.target);
        if (!s || !t) return null;
        return <line key={`${e.source}-${e.target}-${idx}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#2e2e2e" strokeWidth={1} />;
      })}
      {topology.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const bad = n.integrityState === "COMPROMISED";
        return (
          <g key={n.id}>
            <rect
              x={p.x - 6}
              y={p.y - 6}
              width={12}
              height={12}
              fill={bad || n.integrityState === "SECURE" ? "#fff" : "#000"}
              stroke="#fff"
              className={bad ? "animate-pulse" : undefined}
            />
            <text x={p.x} y={p.y + 22} textAnchor="middle" className="fill-[#888] font-mono text-[9px]">
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SiemPage() {
  const { role } = useSession();
  const [qrHash, setQrHash] = useState("");
  const [techId, setTechId] = useState("");
  const [viewMode, setViewMode] = useState<"MAP" | "GRAPH">("MAP");

  // Server-backed Telemetry Pagination & Filter State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [telemetryState, setTelemetryState] = useState<{
    data: TelemetryCorrelation[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    data: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isFetchingTelemetry, setIsFetchingTelemetry] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const checkIn = useAction(onTriggerQRCheckIn);
  const topology = useAsyncResource(fetchAssetTopology);
  const assets = useAsyncResource(fetchAssets, { pollMs: 10000 });
  const activeWindow = checkIn.result;
  const countdown = useCountdown(activeWindow?.expiresAt);

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load paginated telemetry data directly from Supabase / GET /api/v1/siem/telemetry
  const loadTelemetry = useCallback(async () => {
    setIsFetchingTelemetry(true);
    setTelemetryError(null);
    try {
      const res = await fetchPagedTelemetryCorrelations(currentPage, pageSize, debouncedSearch);
      setTelemetryState({
        data: res.data || res.items || [],
        total: res.total || 0,
        page: res.page || currentPage,
        limit: res.limit || pageSize,
        totalPages: res.totalPages || Math.max(1, Math.ceil((res.total || 0) / pageSize)),
      });
    } catch (err: any) {
      setTelemetryError(err?.message || "Failed to load telemetry");
    } finally {
      setIsFetchingTelemetry(false);
    }
  }, [currentPage, pageSize, debouncedSearch]);

  useEffect(() => {
    loadTelemetry();
  }, [loadTelemetry]);

  // Live SSE Telemetry Stream Connection (GET /api/v1/siem/stream)
  useEffect(() => {
    let sse: EventSource | null = null;
    try {
      sse = new EventSource(`${API_BASE_URL}/api/v1/siem/stream`);
      sse.addEventListener("SIEM_TELEMETRY_ALERT", (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload?.correlation && currentPage === 1 && !debouncedSearch) {
            setTelemetryState((prev) => ({
              ...prev,
              total: prev.total + 1,
              data: [payload.correlation, ...prev.data.slice(0, pageSize - 1)],
            }));
          } else {
            loadTelemetry();
          }
          assets.refetch();
          topology.refetch();
        } catch (err) {}
      });
      sse.addEventListener("MAINTENANCE_WINDOW_OPENED", () => {
        loadTelemetry();
        topology.refetch();
        assets.refetch();
      });
    } catch (err) {
      console.warn("[SIEM-SSE] EventSource connection notice:", err);
    }
    return () => {
      if (sse) sse.close();
    };
  }, [currentPage, pageSize, debouncedSearch, loadTelemetry, assets, topology]);

  const canSimulate = role ? canTriggerMaintenanceWindow(role) : false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await checkIn.run({ assetQrHash: qrHash.trim(), technicianId: techId.trim() });
    if (res) {
      loadTelemetry();
      assets.refetch();
    }
  };

  // Tactical Simulation Seeder: Open maintenance window and send nominal IoT telemetry packet
  const handleAutoFillSiem = async () => {
    const targetAsset = assets.data?.find((a) => a.id === "AST-RADAR-01") || assets.data?.find((a) => a.qrHash) || assets.data?.[0];
    const targetId = targetAsset?.id || "AST-RADAR-01";
    const targetHash = targetAsset?.qrHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const targetFw = targetAsset?.firmwareHash || "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const technician = "Sgt. Pratama (NRP 310892 - PUSSIBERAD)";
    setQrHash(targetHash);
    setTechId(technician);

    // 1. Execute backend QR check-in & open HMAC window in Supabase Postgres
    await checkIn.run({ assetQrHash: targetHash, technicianId: technician });

    // 2. Transmit nominal IoT Edge telemetry log within the opened window
    try {
      await onSendIoTTelemetry({
        asset_id: targetId,
        temperature_c: 38.6,
        voltage_v: 24.1,
        firmware_hash: targetFw,
        network_tx_kbps: 340.0,
        qr_hash: targetHash,
      });
    } catch (e) {}

    // 3. Immediately refresh correlations and asset registry so user observes green status change
    await Promise.all([loadTelemetry(), assets.refetch(), topology.refetch()]);
  };

  return (
    <RoleGate route="siem">
      <PageHeader
        eyebrow="Core Operations / Phase 02"
        title="Live SIEM & QR Check-In"
        description="Any firmware or configuration change without a matching physical QR maintenance window is flagged as unverified tampering."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFillSiem}
              icon={<Icon.Refresh size={12} />}
              className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink cursor-pointer"
            >
              ⚡ Auto-Fill QR Check-In
            </Button>
            <Tag tone="muted">Active Monitoring</Tag>
          </div>
        }
      />

      {/* Top control bar — QR simulator (visible only to authorized operators) */}
      {canSimulate && (
        <Panel
          eyebrow="Simulator"
          title="Physical QR Check-In Simulator"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFillSiem}
              icon={<Icon.Refresh size={12} />}
              className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink cursor-pointer"
            >
              ⚡ Auto-Fill
            </Button>
          }
        >
          <form onSubmit={submit} className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[1fr_1fr_auto_220px]">
            <Field label="Asset QR Hash">
              <Input
                id="siem-qr-hash"
                className="font-mono"
                value={qrHash}
                onChange={(e) => setQrHash(e.target.value)}
                placeholder="Scan or paste signed QR payload"
              />
            </Field>
            <Field label="Technician ID">
              <Input
                id="siem-technician-id"
                className="font-mono"
                value={techId}
                onChange={(e) => setTechId(e.target.value)}
                placeholder="NRP / Technician badge"
              />
            </Field>
            <Button
              id="siem-open-window"
              type="submit"
              variant="primary"
              disabled={!qrHash.trim() || !techId.trim()}
              loading={checkIn.isPending}
              icon={<Icon.QR size={15} />}
            >
              Open Maintenance Window
            </Button>
            <div className="flex h-10 items-center justify-between border border-line bg-ink px-3">
              <Eyebrow className="text-[9.5px]">{activeWindow ? activeWindow.status : "Window Closed"}</Eyebrow>
              <Mono className="text-base">{countdown}</Mono>
            </div>
          </form>
          <div className="mt-4">
            <Notice notice={checkIn.notice} onClose={() => checkIn.setNotice(null)} />
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left Column: Interactive Tactical Map (Leaflet.js) */}
        <Panel
          className="xl:col-span-6"
          eyebrow="Tactical Geolocation & Defense Topology"
          title={viewMode === "MAP" ? "Interactive Tactical Map (Leaflet.js)" : "Asset Dependency Topology"}
          bodyClassName={viewMode === "MAP" ? "p-0 overflow-hidden" : undefined}
          actions={
            <div className="flex items-center gap-1 border border-line p-0.5 bg-surface">
              <button
                id="siem-view-map"
                onClick={() => setViewMode("MAP")}
                className={cn(
                  "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors cursor-pointer",
                  viewMode === "MAP" ? "bg-paper text-ink font-bold" : "text-muted hover:text-paper",
                )}
              >
                🗺️ Tactical Map
              </button>
              <button
                id="siem-view-graph"
                onClick={() => setViewMode("GRAPH")}
                className={cn(
                  "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors cursor-pointer",
                  viewMode === "GRAPH" ? "bg-paper text-ink font-bold" : "text-muted hover:text-paper",
                )}
              >
                🕸️ Node Tree
              </button>
            </div>
          }
        >
          {viewMode === "MAP" ? (
            <div className="w-full">
              <TacticalMap assets={assets.data || []} onRefresh={assets.refetch} />
            </div>
          ) : (
            <div>
              <ErrorLine error={topology.error} />
              <div className="relative aspect-square w-full border border-line bg-ink bg-dots">
                {topology.data && topology.data.nodes.length > 0 ? (
                  <TopologyView topology={topology.data} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-6">
                    <EmptyState
                      className="w-full border-line bg-ink/80"
                      icon={<Icon.Registry size={16} />}
                      title="No topology graph"
                      message="Node-link dependency graph renders when /siem/topology returns nodes and edges."
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* Right Column: Real-Time Telemetry Correlation Table with Search & Limit Pagination */}
        <Panel className="xl:col-span-6" eyebrow="Correlation" title="Real-Time Telemetry Correlation" bodyClassName="p-0">
          {/* Search Bar & Stream Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface/50 p-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Icon.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="siem-telemetry-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by asset ID, network event, or verdict..."
                className="w-full bg-ink border border-line pl-8 pr-3 py-1 font-mono text-[11px] text-paper placeholder:text-muted focus:border-paper focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted">
                {isFetchingTelemetry ? (
                  <span className="flex items-center gap-1 text-paper">
                    <Icon.Refresh size={10} className="animate-spin" /> Fetching...
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Stream
                  </span>
                )}
              </span>
            </div>
          </div>

          <ErrorLine error={telemetryError} />
          <DataTable
            columns={CORRELATION_COLUMNS}
            rows={telemetryState.data}
            rowKey={(c) => c.id}
            isLoading={isFetchingTelemetry && telemetryState.data.length === 0}
            emptyTitle="No correlated events"
            emptyMessage={debouncedSearch ? "No events matching your search filter." : "No telemetry logs ingested yet. Awaiting backend stream..."}
            rowClassName={(c) => (c.verdict === "ANOMALY" ? "bg-red-950/15" : undefined)}
          />
          <Pagination
            idPrefix="siem-table"
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={telemetryState.total}
            pageSizeOptions={[10, 20]}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </Panel>
      </div>
    </RoleGate>
  );
}
