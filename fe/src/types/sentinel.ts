/**
 * OZIKRA — Core Domain Types
 * Single source of truth for every entity exchanged with the backend
 * (Supabase / Next.js API Routes / FastAPI).
 */

/* ------------------------------------------------------------------ */
/* Identity & Access                                                   */
/* ------------------------------------------------------------------ */

export type TacticalRole =
  | "SUPER_ADMIN"
  | "COMMANDER"
  | "LOGISTICS_OFFICER"
  | "FORENSIC_AUDITOR";

export const TACTICAL_ROLES: TacticalRole[] = [
  "SUPER_ADMIN",
  "COMMANDER",
  "LOGISTICS_OFFICER",
  "FORENSIC_AUDITOR",
];

export const ROLE_LABEL: Record<TacticalRole, string> = {
  SUPER_ADMIN: "Super Admin",
  COMMANDER: "Komandan",
  LOGISTICS_OFFICER: "Perwira Logistik",
  FORENSIC_AUDITOR: "Auditor Forensik",
};

export interface OfficerProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: TacticalRole;
  nrp?: string | null;
  unit?: string | null;
  rank?: string | null;
  status?: "APPROVED" | "PENDING" | "REJECTED" | string;
  approvedBy?: string | null;
  /** PEM / base64 encoded public key for digital signatures */
  publicKey?: string | null;
  createdAt?: string;
}

export type AuthProvider = "GOOGLE_OAUTH" | "SANDBOX" | "LDAP";

export interface Session {
  user: OfficerProfile;
  provider: AuthProvider;
  /** Role currently being simulated by the "Switch Role Simulator" */
  simulatedRole: TacticalRole;
  issuedAt: string;
  token?: string;
}

/* ------------------------------------------------------------------ */
/* Engine / Network configuration                                      */
/* ------------------------------------------------------------------ */

export type EngineMode = "CLOUD_SANDBOX" | "ON_PREMISE";

export interface EngineConfig {
  mode: EngineMode;
  /** Local LLM / vLLM / Ollama endpoint for air-gapped operation */
  localEndpointUrl: string;
  modelName: string;
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export type AssetClassification = "IT" | "OT";

export type AssetType = "IT_SERVER" | "OT_RADAR" | "TACTICAL_RADIO";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  IT_SERVER: "IT Server",
  OT_RADAR: "OT Radar",
  TACTICAL_RADIO: "Tactical Radio",
};

export type IntegrityState = "SECURE" | "MAINTENANCE" | "COMPROMISED" | "QUARANTINED";

export type QRWindowStatus = "CLOSED" | "OPEN" | "EXPIRED";

export interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  vendor: string;
  type: AssetType;
  classification: AssetClassification;
  /** 0 – 100 */
  trustScore: number | null;
  integrityState: IntegrityState;
  qrWindowStatus: QRWindowStatus;
  qrHash?: string | null;
  firmwareHash?: string | null;
  cveCount: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  lastAction?: string;
  lastActor?: string;
  lastActionRole?: string;
  registeredAt: string;
  updatedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Command Center                                                      */
/* ------------------------------------------------------------------ */

export interface DashboardMetrics {
  registeredAssets: number;
  quarantinedAssets: number;
  activeMaintenanceWindows: number;
  unverifiedAnomalies: number;
}

/* ------------------------------------------------------------------ */
/* Phase 1 — Supply-Chain Gatekeeper                                   */
/* ------------------------------------------------------------------ */

export interface ManifestSubmission {
  assetName: string;
  serialNumber: string;
  vendor: string;
  assetType: AssetType;
  manifestFile: File | null;
  sbomFile: File | null;
}

export type CVESeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CVEMatch {
  cveId: string;
  component: string;
  version: string;
  severity: CVESeverity;
  cvss: number;
  similarity: number;
  summary: string;
}

export interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
}

export interface TacticalQRPassport {
  assetId: string;
  qrPayload: string;
  /** HMAC-SHA256 signature of the payload */
  signature: string;
  /** data URL / SVG string of the rendered QR code */
  qrImage?: string | null;
  issuedAt: string;
  issuedBy: string;
}

export interface VerificationResult {
  submissionId: string;
  trustScore: number;
  verdict: "APPROVED" | "QUARANTINED" | "REJECTED";
  extractedFields: ExtractedField[];
  cveMatches: CVEMatch[];
  passport: TacticalQRPassport | null;
  reasoning: string;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Live SIEM & QR Check-In                                   */
/* ------------------------------------------------------------------ */

export interface QRCheckInRequest {
  assetQrHash: string;
  technicianId: string;
}

export interface MaintenanceWindow {
  id: string;
  assetId: string;
  technicianId: string;
  openedAt: string;
  expiresAt: string;
  status: QRWindowStatus;
}

export type TelemetrySource = "NETWORK" | "FIRMWARE" | "PHYSICAL_QR" | "SYSTEM";

export type TelemetrySeverity = "INFO" | "NOTICE" | "WARNING" | "CRITICAL";

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  assetId: string;
  source: TelemetrySource;
  severity: TelemetrySeverity;
  message: string;
  actor?: string | null;
}

export type AuthorizationStatus = "AUTHORIZED" | "UNAUTHORIZED" | "PENDING";

export interface TelemetryCorrelation {
  id: string;
  timestamp: string;
  assetId: string;
  networkEvent: string;
  physicalAuthorization: AuthorizationStatus;
  maintenanceWindowId?: string | null;
  verdict: "NOMINAL" | "ANOMALY";
}

export interface TopologyNode {
  id: string;
  label: string;
  classification: AssetClassification;
  integrityState: IntegrityState;
}

export interface TopologyEdge {
  source: string;
  target: string;
  label?: string;
}

export interface AssetTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

/* ------------------------------------------------------------------ */
/* Phase 3 — AI Digital Forensics                                      */
/* ------------------------------------------------------------------ */

export type TimelinePhase = "PHASE_1_SUPPLY_CHAIN" | "PHASE_2_QR_SIEM" | "PHASE_3_ANOMALY";

export interface ForensicTimelineEntry {
  id: string;
  timestamp: string;
  phase: TimelinePhase;
  title: string;
  detail: string;
  evidenceHash?: string | null;
}

export interface ForensicReport {
  investigationId: string;
  assetId: string;
  startedAt: string;
  completedAt?: string | null;
  timeline: ForensicTimelineEntry[];
  rootCauseMarkdown: string;
  confidence: number;
  recommendedActions: string[];
  isolated: boolean;
}

/* ------------------------------------------------------------------ */
/* Immutable Ledger                                                    */
/* ------------------------------------------------------------------ */

export interface LedgerEntry {
  index: number;
  timestamp: string;
  actor: string;
  actorRole?: string;
  action: string;
  assetId?: string | null;
  payloadHash: string;
  previousHash: string;
  hash: string;
}

/* ------------------------------------------------------------------ */
/* Generic async state                                                 */
/* ------------------------------------------------------------------ */

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}
