package main

import (
	"time"
)

// ============================================================================
// Identity & Tactical RBAC Types
// ============================================================================

type TacticalRole string

const (
	RoleSuperAdmin       TacticalRole = "SUPER_ADMIN"
	RoleCommander        TacticalRole = "COMMANDER"
	RoleLogisticsOfficer TacticalRole = "LOGISTICS_OFFICER"
	RoleOTTechnician     TacticalRole = "OT_TECHNICIAN"
	RoleForensicAuditor  TacticalRole = "FORENSIC_AUDITOR"
)

type AuthMode string

const (
	AuthModeGoogleSandbox AuthMode = "GOOGLE_SANDBOX"
	AuthModeLocalAirgap   AuthMode = "LOCAL_AIRGAP"
)

type AIMode string

const (
	AIModeGeminiCloud AIMode = "GEMINI_CLOUD"
	AIModeOllamaLocal AIMode = "OLLAMA_LOCAL"
)

type OfficerProfile struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	Email      string       `json:"email"`
	Role       TacticalRole `json:"role"`
	NRP        string       `json:"nrp,omitempty"`
	Unit       string       `json:"unit,omitempty"`
	Rank       string       `json:"rank,omitempty"`
	Status     string       `json:"status,omitempty"` // APPROVED, PENDING, REJECTED
	ApprovedBy string       `json:"approved_by,omitempty"`
	PublicKey  string       `json:"publicKey,omitempty"`
	AvatarURL  string       `json:"avatarUrl,omitempty"`
	CreatedAt  string       `json:"createdAt,omitempty"`
}

// SystemConfig exposes live toggles for the frontend settings
type SystemConfig struct {
	AuthMode                 AuthMode `json:"auth_mode"`
	AIMode                   AIMode   `json:"ai_mode"`
	AirGapped                bool     `json:"air_gapped"`
	LocalEndpointURL         string   `json:"local_endpoint_url"`
	ModelName                string   `json:"model_name"`
	HMACSecretConfigured     bool     `json:"hmac_secret_configured"`
	ActiveMaintenanceWindows int      `json:"active_maintenance_windows"`
	UptimeSeconds            int64    `json:"uptime_seconds"`
}

type EngineConfig struct {
	Mode             string `json:"mode"`             // CLOUD_SANDBOX, ON_PREMISE
	LocalEndpointURL string `json:"localEndpointUrl"` // e.g. http://localhost:11434
	ModelName        string `json:"modelName"`        // e.g. gemini-2.5-flash / llama3
}

// ============================================================================
// Asset & Inventory Types
// ============================================================================

type AssetClassification string

const (
	ClassificationIT AssetClassification = "IT"
	ClassificationOT AssetClassification = "OT"
)

type AssetType string

const (
	TypeITServer      AssetType = "IT_SERVER"
	TypeOTRadar       AssetType = "OT_RADAR"
	TypeTacticalRadio AssetType = "TACTICAL_RADIO"
)

type IntegrityState string

const (
	StateSecure      IntegrityState = "SECURE"
	StateMaintenance IntegrityState = "MAINTENANCE"
	StateCompromised IntegrityState = "COMPROMISED"
	StateQuarantined IntegrityState = "QUARANTINED"
)

type QRWindowStatus string

const (
	WindowClosed  QRWindowStatus = "CLOSED"
	WindowOpen    QRWindowStatus = "OPEN"
	WindowExpired QRWindowStatus = "EXPIRED"
)

type Asset struct {
	ID             string              `json:"id"`
	Name           string              `json:"name"`
	SerialNumber   string              `json:"serialNumber"`
	Vendor         string              `json:"vendor"`
	Type           AssetType           `json:"type"`           // IT_SERVER, OT_RADAR, TACTICAL_RADIO
	Classification AssetClassification `json:"classification"` // IT, OT
	TrustScore     *int                `json:"trustScore"`
	IntegrityState IntegrityState      `json:"integrityState"`  // SECURE, MAINTENANCE, COMPROMISED, QUARANTINED
	QRWindowStatus QRWindowStatus      `json:"qrWindowStatus"`  // CLOSED, OPEN, EXPIRED
	QRHash         string              `json:"qrHash"`
	FirmwareHash   string              `json:"firmwareHash"`
	CVECount       int                 `json:"cveCount"`
	Latitude       *float64            `json:"latitude,omitempty"`
	Longitude      *float64            `json:"longitude,omitempty"`
	LocationName   string              `json:"locationName,omitempty"`
	RegisteredAt   string              `json:"registeredAt"`
	UpdatedAt      string              `json:"updatedAt,omitempty"`
}

type AssetRequest struct {
	AssetID      string    `json:"asset_id"`
	AssetName    string    `json:"asset_name"`
	SerialNumber string    `json:"serial_number"`
	Vendor       string    `json:"vendor"`
	AssetType    AssetType `json:"asset_type"`
}

// ============================================================================
// Phase 1: Supply Chain & QR Passport
// ============================================================================

type CVESeverity string

const (
	CVESeverityLow      CVESeverity = "LOW"
	CVESeverityMedium   CVESeverity = "MEDIUM"
	CVESeverityHigh     CVESeverity = "HIGH"
	CVESeverityCritical CVESeverity = "CRITICAL"
)

type CVEMatch struct {
	CVEID      string      `json:"cveId"`
	Component  string      `json:"component"`
	Version    string      `json:"version"`
	Severity   CVESeverity `json:"severity"`
	CVSS       float64     `json:"cvss"`
	Similarity float64     `json:"similarity"`
	Summary    string      `json:"summary"`
}

type ExtractedField struct {
	Key        string  `json:"key"`
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}

type TacticalQRPassport struct {
	AssetID      string `json:"assetId"`
	SerialNumber string `json:"serialNumber,omitempty"`
	FirmwareHash string `json:"firmwareHash,omitempty"`
	Vendor       string `json:"vendor,omitempty"`
	QRPayload    string `json:"qrPayload"`
	Signature    string `json:"signature"` // HMAC-SHA256 signature
	QRImage      string `json:"qrImage,omitempty"`
	IssuedAt     string `json:"issuedAt"`
	IssuedBy     string `json:"issuedBy"`
}

type VerificationResult struct {
	SubmissionID    string              `json:"submissionId"`
	TrustScore      int                 `json:"trustScore"`
	Verdict         string              `json:"verdict"` // APPROVED, QUARANTINED, REJECTED
	ExtractedFields []ExtractedField    `json:"extractedFields"`
	CVEMatches      []CVEMatch          `json:"cveMatches"`
	Passport        *TacticalQRPassport `json:"passport"`
	Reasoning       string              `json:"reasoning"`
}

// ============================================================================
// Phase 2: Lightweight SIEM & Telemetry
// ============================================================================

type QRCheckInRequest struct {
	AssetQRHash  string `json:"assetQrHash" binding:"required"`
	TechnicianID string `json:"technicianId" binding:"required"`
}

type MaintenanceWindow struct {
	ID           string         `json:"id"`
	AssetID      string         `json:"assetId"`
	TechnicianID string         `json:"technicianId"`
	OpenedAt     string         `json:"openedAt"`
	ExpiresAt    string         `json:"expiresAt"`
	Status       QRWindowStatus `json:"status"` // OPEN, CLOSED, EXPIRED
}

type TelemetrySource string

const (
	SourceNetwork    TelemetrySource = "NETWORK"
	SourceFirmware   TelemetrySource = "FIRMWARE"
	SourcePhysicalQR TelemetrySource = "PHYSICAL_QR"
	SourceSystem     TelemetrySource = "SYSTEM"
)

type TelemetrySeverity string

const (
	SeverityInfo     TelemetrySeverity = "INFO"
	SeverityNotice   TelemetrySeverity = "NOTICE"
	SeverityWarning  TelemetrySeverity = "WARNING"
	SeverityCritical TelemetrySeverity = "CRITICAL"
)

type TelemetryEvent struct {
	ID        string            `json:"id"`
	Timestamp string            `json:"timestamp"`
	AssetID   string            `json:"assetId"`
	Source    TelemetrySource   `json:"source"`   // NETWORK, FIRMWARE, PHYSICAL_QR, SYSTEM
	Severity  TelemetrySeverity `json:"severity"` // INFO, NOTICE, WARNING, CRITICAL
	Message   string            `json:"message"`
	Actor     string            `json:"actor,omitempty"`
}

type AuthorizationStatus string

const (
	AuthStatusAuthorized   AuthorizationStatus = "AUTHORIZED"
	AuthStatusUnauthorized AuthorizationStatus = "UNAUTHORIZED"
	AuthStatusPending      AuthorizationStatus = "PENDING"
)

type TelemetryCorrelation struct {
	ID                    string              `json:"id"`
	Timestamp             string              `json:"timestamp"`
	AssetID               string              `json:"assetId"`
	NetworkEvent          string              `json:"networkEvent"`
	PhysicalAuthorization AuthorizationStatus `json:"physicalAuthorization"` // AUTHORIZED, UNAUTHORIZED, PENDING
	MaintenanceWindowID   string              `json:"maintenanceWindowId,omitempty"`
	Verdict               string              `json:"verdict"` // NOMINAL, ANOMALY
}

// Ingest payload from tactical IoT sensors & simulators
type IoTTelemetryPayload struct {
	AssetID       string    `json:"asset_id"`
	DeviceID      string    `json:"device_id"` // Alias for asset_id
	Timestamp     time.Time `json:"timestamp"`
	TemperatureC  float64   `json:"temperature_c"`
	VoltageV      float64   `json:"voltage_v"`
	FirmwareHash  string    `json:"firmware_hash"`
	NetworkTxKbps float64   `json:"network_tx_kbps"`
	Status        string    `json:"status"`
	SignalPower   float64   `json:"signal_power"` // Legacy IoT agent support (mA)
	QRHash        string    `json:"qr_hash"`
	TechnicianID  string    `json:"technician_id"`
	Signature     string    `json:"signature"`
}

// Commands sent down to IoT devices (e.g. Kill-Switch)
type IoTCommand struct {
	ID        string `json:"id"`
	AssetID   string `json:"asset_id"`
	Action    string `json:"action"` // ISOLATE_NODE, RESUME_NODE, PING
	IssuedAt  string `json:"issued_at"`
	IssuedBy  string `json:"issued_by"`
	Executed  bool   `json:"executed"`
}

// ============================================================================
// Phase 3: Forensics & Ledger
// ============================================================================

type LedgerEntry struct {
	Index        int    `json:"index"`
	Timestamp    string `json:"timestamp"`
	Actor        string `json:"actor"`
	Action       string `json:"action"`
	AssetID      string `json:"assetId,omitempty"`
	PayloadHash  string `json:"payloadHash"`
	PreviousHash string `json:"previousHash"`
	Hash         string `json:"hash"`
}

type TimelinePhase string

const (
	TimelinePhase1SupplyChain TimelinePhase = "PHASE_1_SUPPLY_CHAIN"
	TimelinePhase2QRSIEM      TimelinePhase = "PHASE_2_QR_SIEM"
	TimelinePhase3Anomaly     TimelinePhase = "PHASE_3_ANOMALY"
)

type ForensicTimelineEntry struct {
	ID           string        `json:"id"`
	Timestamp    string        `json:"timestamp"`
	Phase        TimelinePhase `json:"phase"`
	Title        string        `json:"title"`
	Detail       string        `json:"detail"`
	EvidenceHash string        `json:"evidenceHash,omitempty"`
}

type ForensicReport struct {
	InvestigationID    string                  `json:"investigationId"`
	AssetID            string                  `json:"assetId"`
	StartedAt          string                  `json:"startedAt"`
	CompletedAt        string                  `json:"completedAt"`
	Timeline           []ForensicTimelineEntry `json:"timeline"`
	RootCauseMarkdown  string                  `json:"rootCauseMarkdown"`
	Confidence         float64                 `json:"confidence"`
	RecommendedActions []string                `json:"recommendedActions"`
	Isolated           bool                    `json:"isolated"`
	MitreAttackICS     []string                `json:"mitreAttackIcs,omitempty"`
}

type DashboardMetrics struct {
	RegisteredAssets         int `json:"registeredAssets"`
	QuarantinedAssets        int `json:"quarantinedAssets"`
	ActiveMaintenanceWindows int `json:"activeMaintenanceWindows"`
	UnverifiedAnomalies      int `json:"unverifiedAnomalies"`
}
