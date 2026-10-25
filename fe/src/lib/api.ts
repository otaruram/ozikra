/**
 * OZIKRA — Backend API Layer (Production Refactor)
 *
 * Strict integration point between UI and the Golang Backend.
 * Zero fake data fallbacks: real Supabase data or genuine empty/error states.
 * Centralized on `process.env.NEXT_PUBLIC_API_URL`.
 */

import type {
  Asset,
  AssetTopology,
  DashboardMetrics,
  EngineConfig,
  ForensicReport,
  LedgerEntry,
  MaintenanceWindow,
  ManifestSubmission,
  OfficerProfile,
  QRCheckInRequest,
  TacticalRole,
  TelemetryCorrelation,
  TelemetryEvent,
  VerificationResult,
} from "@/types/sentinel";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_OZIKRA_API_URL ||
  "http://localhost:8080";

export const isBackendConnected = () => true;

export class BackendNotConnectedError extends Error {
  constructor(endpoint: string) {
    super(`Backend endpoint error: ${endpoint}`);
    this.name = "BackendNotConnectedError";
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const activeToken = localStorage.getItem("ozikra.active_token");
      const stored = localStorage.getItem("ozikra.session");
      let token = activeToken;
      let role = "";
      let email = "";

      if (stored) {
        const parsed = JSON.parse(stored);
        if (!token && parsed?.token) {
          token = parsed.token;
        }
        if (parsed?.simulatedRole) {
          role = parsed.simulatedRole;
        } else if (parsed?.user?.role) {
          role = parsed.user.role;
        }
        if (parsed?.user?.email) {
          email = parsed.user.email;
        }
      }

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["X-Officer-Token"] = token;
      }
      if (role) {
        headers["X-Simulated-Role"] = role;
      }
      if (email) {
        headers["X-Officer-Email"] = email;
      }
    } catch {}
  }
  return headers;
}

export async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  const authHeaders = getAuthHeaders();

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[${res.status}] ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Direct API Read: Returns live database rows or throws for real error rendering (zero mock fallbacks) */
async function read<T>(endpoint: string): Promise<T> {
  return await request<T>(endpoint);
}

/* ------------------------------------------------------------------ */
/* Command Center                                                      */
/* ------------------------------------------------------------------ */

export const fetchDashboardMetrics = () =>
  read<DashboardMetrics>("/metrics");

export const fetchCriticalAssets = () =>
  read<Asset[]>("/assets?critical=true");

export const fetchTelemetryStream = () =>
  read<TelemetryEvent[]>("/telemetry/stream");

export const onTriggerTelemetryTestEvent = () =>
  request<TelemetryEvent>("/telemetry/test-event", { method: "POST" });

/* ------------------------------------------------------------------ */
/* Phase 1 — Supply-Chain Gatekeeper                                   */
/* ------------------------------------------------------------------ */

export async function onUploadManifest(
  submission: ManifestSubmission,
): Promise<VerificationResult> {
  const form = new FormData();
  form.append("assetName", submission.assetName);
  form.append("serialNumber", submission.serialNumber);
  form.append("vendor", submission.vendor);
  form.append("assetType", submission.assetType);
  if (submission.manifestFile) form.append("manifest", submission.manifestFile);
  if (submission.sbomFile) form.append("sbom", submission.sbomFile);
  return request<VerificationResult>("/api/v1/supply-chain/verify", { method: "POST", body: form });
}

export const onExportQRSeal = (assetId: string) =>
  request<{ url: string }>(`/api/v1/supply-chain/passport/${assetId}/export`);

/* ------------------------------------------------------------------ */
/* Phase 2 — Live SIEM & QR Check-In                                   */
/* ------------------------------------------------------------------ */

export const onTriggerQRCheckIn = (payload: QRCheckInRequest) =>
  request<MaintenanceWindow>("/api/v1/siem/qr-checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export interface PagedTelemetryResponse {
  data: TelemetryCorrelation[];
  items?: TelemetryCorrelation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const fetchPagedTelemetryCorrelations = (page = 1, limit = 10, search = "") =>
  read<PagedTelemetryResponse>(
    `/api/v1/siem/telemetry?format=paged&page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
  );

export const fetchTelemetryCorrelations = () =>
  read<TelemetryCorrelation[]>("/siem/correlations");

export const fetchAssetLatestTelemetry = (assetId: string) =>
  read<{
    asset_id: string;
    temperature_c: number;
    voltage_v: number;
    network_tx_kbps: number;
    firmware_hash: string;
    status: string;
    created_at: string;
  }>(`/api/v1/assets/${encodeURIComponent(assetId)}/telemetry-latest`);

export const onSendIoTTelemetry = (payload: {
  asset_id: string;
  temperature_c: number;
  voltage_v: number;
  firmware_hash: string;
  network_tx_kbps: number;
  qr_hash?: string;
}) =>
  request<any>("/api/v1/siem/telemetry", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAssetTopology = () =>
  read<AssetTopology>("/siem/topology");

/* ------------------------------------------------------------------ */
/* Phase 3 — AI Digital Forensics                                      */
/* ------------------------------------------------------------------ */

export const onRunForensicAgent = (assetId: string) =>
  request<ForensicReport>(`/api/v1/forensics/investigate/${encodeURIComponent(assetId)}`, {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });

export const onIsolateAssetNode = (assetId: string) =>
  request<{ isolated: boolean }>(`/api/v1/forensics/isolate/${encodeURIComponent(assetId)}`, {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });

export const onExportForensicReport = (investigationId: string) =>
  request<{ url: string }>(`/api/v1/forensics/report/${investigationId}/pdf`);

export const downloadForensicReportPdf = async (assetId: string): Promise<void> => {
  const target = encodeURIComponent(assetId.trim());
  const authHeaders = getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/v1/forensics/report/${target}/pdf`, {
    method: "GET",
    headers: {
      ...authHeaders,
      Accept: "application/pdf",
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText || "Gagal mengunduh laporan forensik resmi");
  }

  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `BAP_FORENSIK_${assetId}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
};

/* ------------------------------------------------------------------ */
/* Registry & Audit                                                    */
/* ------------------------------------------------------------------ */

export const fetchAssets = () =>
  read<Asset[]>("/api/v1/assets");

export const fetchLedger = () =>
  read<LedgerEntry[]>("/api/v1/forensics/ledger");

export const verifyLedgerIntegrity = () =>
  request<{
    valid: boolean;
    status: string;
    total_blocks: number;
    tampered_blocks: number;
    verification_at: string;
    algorithm: string;
  }>("/api/v1/forensics/ledger/verify");

/* ------------------------------------------------------------------ */
/* Administration                                                      */
/* ------------------------------------------------------------------ */

export const fetchOfficers = () =>
  read<OfficerProfile[]>("/api/v1/auth/officers");

export const onUpdateUserRole = (userId: string, role: TacticalRole) =>
  request<OfficerProfile>(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const onSaveEngineConfig = async (config: EngineConfig) => {
  try {
    await request<{ message: string; config: any }>("/api/v1/system/config", {
      method: "PATCH",
      body: JSON.stringify({
        ai_mode: config.mode === "ON_PREMISE" ? "OLLAMA_LOCAL" : "GEMINI_CLOUD",
        air_gapped: config.mode === "ON_PREMISE",
        local_endpoint_url: config.localEndpointUrl,
        model_name: config.modelName,
      }),
    });
  } catch (e) {
    console.warn("PATCH /api/v1/system/config notice:", e);
  }
  return request<EngineConfig>("/admin/engine", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};
