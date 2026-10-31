import type { TacticalRole } from "@/types/sentinel";

export type RouteKey =
  | "command"
  | "gatekeeper"
  | "siem"
  | "forensics"
  | "assets"
  | "ledger"
  | "admin";

/**
 * Role-Based Access Control matrix.
 * Mirror this policy in Supabase Row-Level Security for real enforcement.
 */
export const ACCESS_MATRIX: Record<RouteKey, TacticalRole[]> = {
  command: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
  gatekeeper: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
  siem: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
  forensics: ["SUPER_ADMIN", "COMMANDER", "FORENSIC_AUDITOR"],
  assets: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
  ledger: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
  admin: ["SUPER_ADMIN", "COMMANDER", "LOGISTICS_OFFICER", "FORENSIC_AUDITOR"],
};

export const canAccess = (route: RouteKey, role: TacticalRole) =>
  ACCESS_MATRIX[route].includes(role);

/** Only Super Admin may change other officers' roles. */
export const canManageRoles = (role: TacticalRole) => role === "SUPER_ADMIN";

/** Engine configuration is limited to Super Admin & Commander. */
export const canConfigureEngine = (role: TacticalRole) =>
  role === "SUPER_ADMIN" || role === "COMMANDER";

/** Tactical Kill-Switch isolation is restricted to Commander & Super Admin. */
export const canKillSwitch = (role: TacticalRole) =>
  role === "SUPER_ADMIN" || role === "COMMANDER";

/** Physical maintenance window check-in simulator: field/ops officers, not auditors. */
export const canTriggerMaintenanceWindow = (role: TacticalRole) =>
  role === "SUPER_ADMIN" || role === "COMMANDER" || role === "LOGISTICS_OFFICER";

/** SIEM live feed and anomaly monitoring. */
export const canViewSiemFeed = (role: TacticalRole) =>
  role === "SUPER_ADMIN" || role === "COMMANDER" || role === "FORENSIC_AUDITOR";

/** Telemetry test anomaly injection is restricted to Super Admin. */
export const canInjectTelemetryAnomaly = (role: TacticalRole) =>
  role === "SUPER_ADMIN";

/** Asset intake and manifest scanning: logistics & super admin. */
export const canIntakeAssets = (role: TacticalRole) =>
  role === "SUPER_ADMIN" || role === "LOGISTICS_OFFICER";
