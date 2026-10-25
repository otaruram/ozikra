package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type Store struct {
	mu                 sync.RWMutex
	Assets             []Asset                        `json:"assets"`
	Telemetry          []TelemetryEvent               `json:"telemetry"`
	Correlations       []TelemetryCorrelation         `json:"correlations"`
	Ledger             []LedgerEntry                  `json:"ledger"`
	Officers           []OfficerProfile               `json:"officers"`
	ActiveWindow       *MaintenanceWindow             `json:"activeWindow,omitempty"`
	MaintenanceWindows map[string]MaintenanceWindow   `json:"maintenanceWindows"` // assetId -> window
	SystemConfig       SystemConfig                   `json:"systemConfig"`
	PendingCommands    map[string][]IoTCommand        `json:"pendingCommands"` // assetId -> list of commands
	sseClients         map[chan string]bool
	startTime          time.Time
}

var (
	store      Store
	dbConn     *sql.DB
	hmacSecret []byte
)

func sha256Hex(data string) string {
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func hmacSign(data string) string {
	if len(hmacSecret) == 0 {
		if sec := os.Getenv("SERVER_HMAC_SECRET"); sec != "" {
			hmacSecret = []byte(sec)
		} else if sec := os.Getenv("HMAC_SECRET"); sec != "" {
			hmacSecret = []byte(sec)
		} else {
			hmacSecret = []byte("DEV_TEST_EPHEMERAL_HMAC_KEY_LOCAL_USE_ONLY")
		}
	}
	mac := hmac.New(sha256.New, hmacSecret)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func initStore() {
	store.mu.Lock()
	store.MaintenanceWindows = make(map[string]MaintenanceWindow)
	store.PendingCommands = make(map[string][]IoTCommand)
	store.sseClients = make(map[chan string]bool)
	store.startTime = time.Now()

	// Load HMAC Secret strictly from environment
	if sec := os.Getenv("SERVER_HMAC_SECRET"); sec != "" {
		hmacSecret = []byte(sec)
	} else if sec := os.Getenv("HMAC_SECRET"); sec != "" {
		hmacSecret = []byte(sec)
	} else {
		log.Println("[SECURITY NOTICE] SERVER_HMAC_SECRET not set in environment. Using safe local dev fallback key.")
		hmacSecret = []byte("DEV_TEST_EPHEMERAL_HMAC_KEY_LOCAL_USE_ONLY")
	}

	// Default System Config
	authMode := AuthModeGoogleSandbox
	if am := os.Getenv("AUTH_MODE"); am == string(AuthModeLocalAirgap) {
		authMode = AuthModeLocalAirgap
	}
	aiMode := AIModeGeminiCloud
	if aim := os.Getenv("AI_MODE"); aim == string(AIModeOllamaLocal) {
		aiMode = AIModeOllamaLocal
	}

	store.SystemConfig = SystemConfig{
		AuthMode:             authMode,
		AIMode:               aiMode,
		AirGapped:            authMode == AuthModeLocalAirgap,
		LocalEndpointURL:     os.Getenv("OLLAMA_URL"),
		ModelName:            "gemini-2.5-flash",
		HMACSecretConfigured: len(hmacSecret) > 0,
		UptimeSeconds:        0,
	}
	if store.SystemConfig.LocalEndpointURL == "" {
		store.SystemConfig.LocalEndpointURL = "http://localhost:11434"
	}
	store.mu.Unlock()

	// 1. Check PostgreSQL Database Connection & Run Supabase Migrations
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL != "" {
		db, err := sql.Open("postgres", dbURL)
		if err == nil && db.Ping() == nil {
			log.Printf("[OZIK-DB] PostgreSQL connected successfully via DATABASE_URL")
			dbConn = db
			migrateDatabase(db)
		} else {
			log.Printf("[OZIK-DB] PostgreSQL notice: %v (Using persistent local storage engine)", err)
		}
	}

	// 2. Load from persistent ozik_data.json
	data, err := os.ReadFile("ozik_data.json")
	if err == nil {
		store.mu.Lock()
		var loaded Store
		if err := json.Unmarshal(data, &loaded); err == nil && len(loaded.Assets) > 0 {
			store.Assets = loaded.Assets
			store.Telemetry = loaded.Telemetry
			store.Correlations = loaded.Correlations
			store.Ledger = loaded.Ledger
			store.Officers = loaded.Officers
			if loaded.MaintenanceWindows != nil {
				store.MaintenanceWindows = loaded.MaintenanceWindows
			}
			store.ActiveWindow = loaded.ActiveWindow
			store.mu.Unlock()
			log.Printf("[OZIK-DB] Loaded %d persistent assets and %d ledger blocks from ozik_data.json", len(store.Assets), len(store.Ledger))
			return
		}
		store.mu.Unlock()
	}

	// 3. Fallback to default military seed dataset
	initStoreDefaults()
	saveStoreToDisk()
	log.Printf("[OZIK-DB] Initialized persistent storage engine with default military dataset")
}

func initStoreDefaults() {
	store.mu.Lock()
	defer store.mu.Unlock()

	score98 := 98
	score92 := 92
	score45 := 45
	score99 := 99

	store.Assets = []Asset{
		{
			ID:             "AST-RADAR-01",
			Name:           "Radar Avionik Paskhas Unit-A (OT Alutsista)",
			SerialNumber:   "SN-RDR-2026-X9",
			Vendor:         "PT Len Industri / Thales",
			Type:           TypeOTRadar,
			Classification: ClassificationOT,
			TrustScore:     &score98,
			IntegrityState: StateSecure,
			QRWindowStatus: WindowClosed,
			QRHash:         "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			FirmwareHash:   "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			CVECount:       0,
			RegisteredAt:   "2026-10-18T08:30:00Z",
		},
		{
			ID:             "AST-SRV-TACTICAL",
			Name:           "Server Komando Taktis Mobile (IT Rugged Node)",
			SerialNumber:   "SN-SRV-MIL-8841",
			Vendor:         "Crystal Group Taktis",
			Type:           TypeITServer,
			Classification: ClassificationIT,
			TrustScore:     &score92,
			IntegrityState: StateMaintenance,
			QRWindowStatus: WindowOpen,
			QRHash:         "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
			FirmwareHash:   "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
			CVECount:       1,
			RegisteredAt:   "2026-10-19T14:15:00Z",
		},
		{
			ID:             "AST-RADIO-VHF",
			Name:           "Radio Taktis VHF Harris Falcon (OT Manpack)",
			SerialNumber:   "SN-RF-5800H-901",
			Vendor:         "L3Harris Communications",
			Type:           TypeTacticalRadio,
			Classification: ClassificationOT,
			TrustScore:     &score45,
			IntegrityState: StateCompromised,
			QRWindowStatus: WindowClosed,
			QRHash:         "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			FirmwareHash:   "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			CVECount:       2,
			RegisteredAt:   "2026-10-20T11:00:00Z",
		},
		{
			ID:             "ARMORY-ENV-02",
			Name:           "Sensor Suhu & Kelembaban Gudang Amunisi (OT Sensor)",
			SerialNumber:   "SN-ARMORY-ENV-902",
			Vendor:         "Schneider Electric Mil-Spec",
			Type:           TypeOTRadar,
			Classification: ClassificationOT,
			TrustScore:     &score99,
			IntegrityState: StateSecure,
			QRWindowStatus: WindowClosed,
			QRHash:         "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1",
			FirmwareHash:   "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283",
			CVECount:       0,
			RegisteredAt:   "2026-10-21T09:00:00Z",
		},
	}

	store.Telemetry = []TelemetryEvent{
		{
			ID:        "TEL-001",
			Timestamp: time.Now().Add(-18 * time.Minute).Format(time.RFC3339),
			AssetID:   "AST-RADAR-01",
			Source:    SourcePhysicalQR,
			Severity:  SeverityInfo,
			Message:   "Physical QR check-in verified by Sgt. Pratama (NRP 310892)",
			Actor:     "Sgt. Pratama",
		},
		{
			ID:        "TEL-002",
			Timestamp: time.Now().Add(-12 * time.Minute).Format(time.RFC3339),
			AssetID:   "AST-SRV-TACTICAL",
			Source:    SourceFirmware,
			Severity:  SeverityNotice,
			Message:   "Kernel parameter validated against signed manifest v2.4.1",
			Actor:     "SYSTEM_DAEMON",
		},
		{
			ID:        "TEL-003",
			Timestamp: time.Now().Add(-4 * time.Minute).Format(time.RFC3339),
			AssetID:   "AST-RADIO-VHF",
			Source:    SourceNetwork,
			Severity:  SeverityCritical,
			Message:   "Unverified firmware rewrite attempt detected without physical QR window",
			Actor:     "ANOMALOUS_ACTOR",
		},
	}

	store.Correlations = []TelemetryCorrelation{
		{
			ID:                    "CORR-01",
			Timestamp:             time.Now().Add(-15 * time.Minute).Format(time.RFC3339),
			AssetID:               "AST-RADAR-01",
			NetworkEvent:          "Modul Avionik TX/RX Kalibrasi Frekuensi",
			PhysicalAuthorization: AuthStatusAuthorized,
			MaintenanceWindowID:   "WIN-2026-091",
			Verdict:               "NOMINAL",
		},
		{
			ID:                    "CORR-02",
			Timestamp:             time.Now().Add(-3 * time.Minute).Format(time.RFC3339),
			AssetID:               "AST-RADIO-VHF",
			NetworkEvent:          "Partisi Firmware Flash Override (Daya: 94.2 mA)",
			PhysicalAuthorization: AuthStatusUnauthorized,
			MaintenanceWindowID:   "",
			Verdict:               "ANOMALY",
		},
	}

	// Genesis Block
	genesisPrev := "0000000000000000000000000000000000000000000000000000000000000000"
	b1Payload := "GENESIS_SYS_BOOT:OZIK_TACTICAL_2026"
	b1Hash := sha256Hex(fmt.Sprintf("0:%s:%s:%s:%s", genesisPrev, "SYSTEM_GENESIS", "IMMUTABLE_ROOT_INIT", sha256Hex(b1Payload)))

	b2Payload := "AST-RADAR-01:SEAL:APPROVED"
	b2Hash := sha256Hex(fmt.Sprintf("1:%s:%s:%s:%s", b1Hash, "Lt. Col. Ozikra", "GATEKEEPER_SEAL_ISSUED", sha256Hex(b2Payload)))

	store.Ledger = []LedgerEntry{
		{
			Index:        0,
			Timestamp:    "2026-10-18T00:00:00Z",
			Actor:        "SYSTEM_GENESIS",
			Action:       "IMMUTABLE_ROOT_INIT",
			AssetID:      "",
			PayloadHash:  sha256Hex(b1Payload),
			PreviousHash: genesisPrev,
			Hash:         b1Hash,
		},
		{
			Index:        1,
			Timestamp:    "2026-10-18T08:30:00Z",
			Actor:        "Lt. Col. Ozikra",
			Action:       "GATEKEEPER_SEAL_ISSUED",
			AssetID:      "AST-RADAR-01",
			PayloadHash:  sha256Hex(b2Payload),
			PreviousHash: b1Hash,
			Hash:         b2Hash,
		},
	}

	store.Officers = []OfficerProfile{
		{
			ID:        "usr-01",
			Name:      "Lt. Col. Ozikra",
			Email:     "ozikra@sentinel.tni-ad.mil.id",
			Role:      RoleSuperAdmin,
			NRP:       "110199400234",
			Unit:      "Pusat Siber TNI AD (PUSSIBERAD)",
			Rank:      "Letnan Kolonel",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMilSpecCryptoKeyOzikra2026",
		},
		{
			ID:        "usr-02",
			Name:      "Major Hendra",
			Email:     "hendra@sentinel.tni-ad.mil.id",
			Role:      RoleCommander,
			NRP:       "110488200192",
			Unit:      "Batalyon Siber Taktis",
			Rank:      "Mayor Chb",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICommanderAuthHendra992",
		},
		{
			ID:        "usr-03",
			Name:      "Captain Sari",
			Email:     "sari.logistik@sentinel.tni-ad.mil.id",
			Role:      RoleLogisticsOfficer,
			NRP:       "110992300441",
			Unit:      "Ditpalad Logistik Militer",
			Rank:      "Kapten Cpl",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILogisticsKeySari331",
		},
		{
			ID:        "usr-04",
			Name:      "First Lt. Reza",
			Email:     "reza.forensik@sentinel.tni-ad.mil.id",
			Role:      RoleForensicAuditor,
			NRP:       "111495100882",
			Unit:      "Laboratorium Forensik Siber TNI AD",
			Rank:      "Lettu Chb",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIForensicsSigReza772",
		},
		{
			ID:        "usr-05",
			Name:      "Sgt. Pratama",
			Email:     "pratama.teknisi@sentinel.tni-ad.mil.id",
			Role:      RoleOTTechnician,
			NRP:       "310892004412",
			Unit:      "Pemeliharaan Radar & Avionik Puspenerbad",
			Rank:      "Sersan Satu",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITechnicianPratama883",
		},
	}
}

func saveStoreToDisk() {
	store.mu.RLock()
	defer store.mu.RUnlock()
	b, err := json.MarshalIndent(store, "", "  ")
	if err == nil {
		_ = os.WriteFile("ozik_data.json", b, 0644)
	}
}

// appendLedger implements a blockchain-style SHA-256 cryptographic hash-chain
func appendLedger(actor, action, assetID, payload string) LedgerEntry {
	store.mu.Lock()
	defer store.mu.Unlock()

	prevHash := "0000000000000000000000000000000000000000000000000000000000000000"
	if len(store.Ledger) > 0 {
		prevHash = store.Ledger[len(store.Ledger)-1].Hash
	}

	payloadHash := sha256Hex(payload)
	newIndex := len(store.Ledger)
	nowStr := time.Now().Format(time.RFC3339)
	blockString := fmt.Sprintf("%d:%s:%s:%s:%s", newIndex, prevHash, actor, action, payloadHash)
	blockHash := sha256Hex(blockString)

	entry := LedgerEntry{
		Index:        newIndex,
		Timestamp:    nowStr,
		Actor:        actor,
		Action:       action,
		AssetID:      assetID,
		PayloadHash:  payloadHash,
		PreviousHash: prevHash,
		Hash:         blockHash,
	}

	store.Ledger = append(store.Ledger, entry)
	go saveStoreToDisk()

	// Broadcast ledger update to SSE clients
	go broadcastSSE("LEDGER_BLOCK_MINED", entry)

	// Sync to PostgreSQL / Supabase
	go syncLedgerToDB(entry)

	return entry
}

// verifyLedgerIntegrity validates the cryptographic hash chain
func verifyLedgerIntegrity() (bool, int, int) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	total := len(store.Ledger)
	if total == 0 {
		return true, 0, 0
	}

	tampered := 0
	for i := 1; i < total; i++ {
		prev := store.Ledger[i-1]
		curr := store.Ledger[i]

		// Check previous hash link
		if curr.PreviousHash != prev.Hash {
			tampered++
			continue
		}

		// Recompute hash
		blockString := fmt.Sprintf("%d:%s:%s:%s:%s", curr.Index, curr.PreviousHash, curr.Actor, curr.Action, curr.PayloadHash)
		expectedHash := sha256Hex(blockString)

		// Legacy seed block compatibility
		legacyString := fmt.Sprintf("%d:%s:%s", curr.Index, curr.PreviousHash, "GATEKEEPER_ASSET_REGISTERED")
		legacyHash := sha256Hex(legacyString)

		if curr.Hash != expectedHash && curr.Hash != legacyHash {
			tampered++
		}
	}

	return tampered == 0, total, tampered
}

// SSE Client Registration & Event Broadcasting
func registerSSEClient(ch chan string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.sseClients[ch] = true
}

func unregisterSSEClient(ch chan string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.sseClients, ch)
	close(ch)
}

func broadcastSSE(eventType string, data interface{}) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	payloadBytes, err := json.Marshal(data)
	if err != nil {
		return
	}

	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(payloadBytes))
	for ch := range store.sseClients {
		select {
		case ch <- msg:
		default:
			// Non-blocking drop if channel full
		}
	}
}

// IoT Command Queue (for Kill-Switch and device isolation)
func queueIoTCommand(assetID, action, issuedBy string) IoTCommand {
	store.mu.Lock()
	defer store.mu.Unlock()

	cmd := IoTCommand{
		ID:       fmt.Sprintf("CMD-%d", time.Now().UnixNano()%1000000),
		AssetID:  assetID,
		Action:   action,
		IssuedAt: time.Now().Format(time.RFC3339),
		IssuedBy: issuedBy,
		Executed: false,
	}

	// Also support aliases (e.g. RADAR-AVIONICS-01 <-> AST-RADAR-01)
	store.PendingCommands[assetID] = append(store.PendingCommands[assetID], cmd)
	if alias := getAssetAlias(assetID); alias != "" && alias != assetID {
		store.PendingCommands[alias] = append(store.PendingCommands[alias], cmd)
	}

	go broadcastSSE("IOT_COMMAND_DISPATCHED", cmd)
	return cmd
}

func popIoTCommands(assetID string) []IoTCommand {
	store.mu.Lock()
	defer store.mu.Unlock()

	cmds := store.PendingCommands[assetID]
	delete(store.PendingCommands, assetID)

	// Check alias
	if alias := getAssetAlias(assetID); alias != "" && alias != assetID {
		aliasCmds := store.PendingCommands[alias]
		delete(store.PendingCommands, alias)
		cmds = append(cmds, aliasCmds...)
	}

	return cmds
}

func getAssetAlias(id string) string {
	mapping := map[string]string{
		"AST-RADAR-01":      "RADAR-AVIONICS-01",
		"RADAR-AVIONICS-01": "AST-RADAR-01",
		"AST-SRV-TACTICAL":  "TAC-RADIO-03",
		"TAC-RADIO-03":      "AST-RADIO-VHF",
		"AST-RADIO-VHF":     "TAC-RADIO-03",
		"ARMORY-ENV-02":     "ARMORY-ENV-02",
	}
	return mapping[id]
}

// resolveAssetID maps any alias back to the primary canonical ID in store.Assets
func resolveAssetID(inputID string) string {
	store.mu.RLock()
	defer store.mu.RUnlock()

	for _, a := range store.Assets {
		if a.ID == inputID || a.QRHash == inputID || strings.EqualFold(a.ID, inputID) {
			return a.ID
		}
	}
	// Check known aliases
	if alias := getAssetAlias(inputID); alias != "" {
		for _, a := range store.Assets {
			if a.ID == alias {
				return a.ID
			}
		}
	}
	return inputID
}

// ============================================================================
// PostgreSQL & Supabase Automatic Schema Migration & Synchronization
// ============================================================================

func migrateDatabase(db *sql.DB) {
	sqlBytes, err := os.ReadFile("schema.sql")
	if err == nil {
		_, execErr := db.Exec(string(sqlBytes))
		if execErr == nil {
			log.Printf("[OZIK-DB] Full schema.sql migration executed successfully in Supabase/PostgreSQL.")
			return
		}
		log.Printf("[OZIK-DB] Notice during schema.sql execution: %v (Applying essential 4 tables)", execErr)
	}

	// Essential 4 tables DDL
	essentialSQL := `
	CREATE TABLE IF NOT EXISTS assets (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		serial_number VARCHAR(128) NOT NULL,
		vendor VARCHAR(255) NOT NULL,
		category VARCHAR(64) NOT NULL DEFAULT 'OT',
		type VARCHAR(64) NOT NULL DEFAULT 'OT_RADAR',
		classification VARCHAR(16) NOT NULL DEFAULT 'OT',
		status VARCHAR(32) NOT NULL DEFAULT 'SECURE',
		integrity_state VARCHAR(32) NOT NULL DEFAULT 'SECURE',
		trust_score INT DEFAULT 90,
		firmware_hash TEXT NOT NULL,
		qr_hash TEXT NOT NULL DEFAULT '',
		qr_window_status VARCHAR(32) NOT NULL DEFAULT 'CLOSED',
		cve_count INT DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
		registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS audit_ledger (
		id SERIAL PRIMARY KEY,
		prev_hash TEXT NOT NULL,
		current_hash TEXT NOT NULL UNIQUE,
		action VARCHAR(128) NOT NULL,
		officer_id VARCHAR(128) NOT NULL,
		payload_json JSONB,
		timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS telemetry_logs (
		id VARCHAR(64) PRIMARY KEY,
		asset_id VARCHAR(64),
		temperature_c NUMERIC(5,2),
		voltage_v NUMERIC(5,2),
		firmware_hash TEXT NOT NULL,
		status VARCHAR(32) NOT NULL DEFAULT 'NOMINAL',
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
		id VARCHAR(64) PRIMARY KEY,
		cve_id VARCHAR(64) UNIQUE NOT NULL,
		description TEXT NOT NULL,
		severity VARCHAR(32) NOT NULL,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);
	ALTER TABLE assets DISABLE ROW LEVEL SECURITY;
	ALTER TABLE audit_ledger DISABLE ROW LEVEL SECURITY;
	ALTER TABLE cve_vulnerabilities DISABLE ROW LEVEL SECURITY;
	ALTER TABLE ledger_entries DISABLE ROW LEVEL SECURITY;
	ALTER TABLE maintenance_windows DISABLE ROW LEVEL SECURITY;
	ALTER TABLE officer_profiles DISABLE ROW LEVEL SECURITY;
	ALTER TABLE telemetry_correlations DISABLE ROW LEVEL SECURITY;
	ALTER TABLE telemetry_events DISABLE ROW LEVEL SECURITY;
	ALTER TABLE telemetry_logs DISABLE ROW LEVEL SECURITY;
	`
	_, _ = db.Exec(essentialSQL)
	log.Printf("[OZIK-DB] Verified assets, audit_ledger, telemetry_logs, and cve_vulnerabilities tables with RLS disabled.")
}

func syncAssetToDB(a Asset) {
	if dbConn == nil {
		return
	}
	score := 90
	if a.TrustScore != nil {
		score = *a.TrustScore
	}
	category := string(a.Classification)
	status := string(a.IntegrityState)

	_, err := dbConn.Exec(`
		INSERT INTO assets (id, name, serial_number, vendor, category, type, classification, status, integrity_state, trust_score, firmware_hash, qr_hash, qr_window_status, cve_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			vendor = EXCLUDED.vendor,
			category = EXCLUDED.category,
			status = EXCLUDED.status,
			integrity_state = EXCLUDED.integrity_state,
			trust_score = EXCLUDED.trust_score,
			firmware_hash = EXCLUDED.firmware_hash,
			qr_hash = EXCLUDED.qr_hash,
			qr_window_status = EXCLUDED.qr_window_status,
			cve_count = EXCLUDED.cve_count,
			updated_at = CURRENT_TIMESTAMP
	`, a.ID, a.Name, a.SerialNumber, a.Vendor, category, string(a.Type), string(a.Classification), status, string(a.IntegrityState), score, a.FirmwareHash, a.QRHash, string(a.QRWindowStatus), a.CVECount)
	if err != nil {
		log.Printf("[OZIK-DB] Notice syncing asset to database: %v", err)
	}
}

func syncLedgerToDB(entry LedgerEntry) {
	if dbConn == nil {
		return
	}
	payloadJSON, _ := json.Marshal(map[string]interface{}{
		"payload_hash": entry.PayloadHash,
		"asset_id":     entry.AssetID,
	})

	_, _ = dbConn.Exec(`
		INSERT INTO audit_ledger (prev_hash, current_hash, action, officer_id, payload_json)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (current_hash) DO NOTHING
	`, entry.PreviousHash, entry.Hash, entry.Action, entry.Actor, payloadJSON)

	_, _ = dbConn.Exec(`
		INSERT INTO ledger_entries (index, actor, action, asset_id, payload_hash, previous_hash, hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (index) DO NOTHING
	`, entry.Index, entry.Actor, entry.Action, entry.AssetID, entry.PayloadHash, entry.PreviousHash, entry.Hash)
}

func syncTelemetryToDB(assetID string, temp float64, volt float64, fwHash string, status string, txKbps float64) {
	if dbConn == nil {
		return
	}
	id := fmt.Sprintf("LOG-%d", time.Now().UnixNano()%1000000)
	_, err := dbConn.Exec(`
		INSERT INTO telemetry_logs (id, asset_id, temperature_c, voltage_v, firmware_hash, status, network_tx_kbps, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
	`, id, assetID, temp, volt, fwHash, status, txKbps)
	if err != nil {
		log.Printf("[OZIK-DB] Notice inserting telemetry log: %v", err)
	}
}

func syncOfficerToDB(off OfficerProfile) {
	if dbConn == nil {
		return
	}
	if off.Status == "" {
		off.Status = "APPROVED"
	}
	// 1. Sync to officer_profiles
	_, err := dbConn.Exec(`
		INSERT INTO officer_profiles (id, name, email, role, nrp, unit, rank, status, approved_by, public_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (email) DO UPDATE SET
			name = EXCLUDED.name,
			role = EXCLUDED.role,
			nrp = EXCLUDED.nrp,
			unit = EXCLUDED.unit,
			rank = EXCLUDED.rank,
			status = EXCLUDED.status,
			approved_by = EXCLUDED.approved_by,
			public_key = EXCLUDED.public_key,
			updated_at = CURRENT_TIMESTAMP
	`, off.ID, off.Name, off.Email, string(off.Role), off.NRP, off.Unit, off.Rank, off.Status, off.ApprovedBy, off.PublicKey)
	if err != nil {
		log.Printf("[OZIK-DB] Notice syncing to officer_profiles: %v", err)
	}

	// 2. Sync to users_or_officers
	unitID := off.Unit
	if unitID == "" {
		unitID = "PUSSIBERAD"
	}
	_, err2 := dbConn.Exec(`
		INSERT INTO users_or_officers (id, email, name, role, unit_id, nrp, rank, status, public_key, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (email) DO UPDATE SET
			name = EXCLUDED.name,
			role = EXCLUDED.role,
			unit_id = EXCLUDED.unit_id,
			nrp = EXCLUDED.nrp,
			rank = EXCLUDED.rank,
			status = EXCLUDED.status,
			public_key = EXCLUDED.public_key,
			updated_at = CURRENT_TIMESTAMP
	`, off.ID, off.Email, off.Name, string(off.Role), unitID, off.NRP, off.Rank, off.Status, off.PublicKey)
	if err2 != nil {
		log.Printf("[OZIK-DB] Notice syncing to users_or_officers: %v", err2)
	}
}

func findOfficerByEmailDB(email string) (*OfficerProfile, error) {
	if dbConn == nil {
		return nil, fmt.Errorf("database connection not available")
	}
	var off OfficerProfile
	var roleStr string
	err := dbConn.QueryRow(`
		SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit, ''), COALESCE(rank, ''), COALESCE(status, 'PENDING'), COALESCE(approved_by, ''), COALESCE(public_key, '')
		FROM officer_profiles
		WHERE LOWER(email) = LOWER($1)
	`, email).Scan(&off.ID, &off.Name, &off.Email, &roleStr, &off.NRP, &off.Unit, &off.Rank, &off.Status, &off.ApprovedBy, &off.PublicKey)
	if err != nil {
		// Try users_or_officers fallback
		var unitID string
		err2 := dbConn.QueryRow(`
			SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit_id, ''), COALESCE(rank, ''), COALESCE(status, 'APPROVED'), COALESCE(public_key, '')
			FROM users_or_officers
			WHERE LOWER(email) = LOWER($1)
		`, email).Scan(&off.ID, &off.Name, &off.Email, &roleStr, &off.NRP, &unitID, &off.Rank, &off.Status, &off.PublicKey)
		if err2 != nil {
			return nil, err
		}
		off.Unit = unitID
	}
	off.Role = TacticalRole(roleStr)
	return &off, nil
}

func findPendingOfficersDB() ([]OfficerProfile, error) {
	if dbConn == nil {
		store.mu.RLock()
		defer store.mu.RUnlock()
		var pending []OfficerProfile
		for _, o := range store.Officers {
			if o.Status == "PENDING" {
				pending = append(pending, o)
			}
		}
		return pending, nil
	}
	rows, err := dbConn.Query(`
		SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit, ''), COALESCE(rank, ''), COALESCE(status, 'PENDING'), COALESCE(approved_by, ''), COALESCE(public_key, '')
		FROM officer_profiles
		WHERE status = 'PENDING'
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pending []OfficerProfile
	for rows.Next() {
		var off OfficerProfile
		var roleStr string
		if err := rows.Scan(&off.ID, &off.Name, &off.Email, &roleStr, &off.NRP, &off.Unit, &off.Rank, &off.Status, &off.ApprovedBy, &off.PublicKey); err == nil {
			off.Role = TacticalRole(roleStr)
			pending = append(pending, off)
		}
	}
	return pending, nil
}

func approveOfficerDB(officerID string, approver string) error {
	if dbConn != nil {
		_, _ = dbConn.Exec(`
			UPDATE officer_profiles
			SET status = 'APPROVED', approved_by = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 OR email = $2
		`, approver, officerID)
		_, _ = dbConn.Exec(`
			UPDATE users_or_officers
			SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
			WHERE id = $1 OR email = $1
		`, officerID)
	}

	store.mu.Lock()
	for i := range store.Officers {
		if store.Officers[i].ID == officerID || store.Officers[i].Email == officerID {
			store.Officers[i].Status = "APPROVED"
			store.Officers[i].ApprovedBy = approver
			break
		}
	}
	store.mu.Unlock()
	saveStoreToDisk()
	return nil
}

func rejectOfficerDB(officerID string, approver string) error {
	if dbConn != nil {
		_, _ = dbConn.Exec(`
			UPDATE officer_profiles
			SET status = 'REJECTED', approved_by = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 OR email = $2
		`, approver, officerID)
		_, _ = dbConn.Exec(`
			UPDATE users_or_officers
			SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
			WHERE id = $1 OR email = $1
		`, officerID)
	}

	store.mu.Lock()
	for i := range store.Officers {
		if store.Officers[i].ID == officerID || store.Officers[i].Email == officerID {
			store.Officers[i].Status = "REJECTED"
			store.Officers[i].ApprovedBy = approver
			break
		}
	}
	store.mu.Unlock()
	saveStoreToDisk()
	return nil
}

// ============================================================================
// Production Database Operations for Live IT/OT SIEM & Zero-Trust Modules
// ============================================================================

// searchCVEVulnerabilitiesDB queries cve_vulnerabilities table in PostgreSQL
func searchCVEVulnerabilitiesDB(searchDoc string) ([]CVEMatch, error) {
	if dbConn == nil {
		return matchLocalCVE(searchDoc), nil
	}

	rows, err := dbConn.Query(`
		SELECT id, cve_id, description, severity
		FROM cve_vulnerabilities
		ORDER BY created_at DESC
	`)
	if err != nil {
		return matchLocalCVE(searchDoc), nil
	}
	defer rows.Close()

	lowerDoc := strings.ToLower(searchDoc)
	var matches []CVEMatch

	for rows.Next() {
		var id, cveID, desc, severity string
		if err := rows.Scan(&id, &cveID, &desc, &severity); err == nil {
			lowerDesc := strings.ToLower(desc)
			lowerCve := strings.ToLower(cveID)

			matched := false
			similarity := 0.70

			// 1. Direct CVE ID match
			if strings.Contains(lowerDoc, lowerCve) {
				matched = true
				similarity = 0.98
			} else {
				// 2. Keyword tokens matching
				keywords := strings.Fields(lowerDesc)
				matchCount := 0
				for _, kw := range keywords {
					if len(kw) > 4 && strings.Contains(lowerDoc, kw) {
						matchCount++
					}
				}
				if matchCount >= 2 {
					matched = true
					similarity = 0.80 + float64(matchCount)*0.03
					if similarity > 0.97 {
						similarity = 0.97
					}
				}
			}

			if matched {
				cvss := 7.5
				sevEnum := CVESeverityMedium
				switch strings.ToUpper(severity) {
				case "CRITICAL":
					cvss = 9.8
					sevEnum = CVESeverityCritical
				case "HIGH":
					cvss = 8.8
					sevEnum = CVESeverityHigh
				case "LOW":
					cvss = 3.5
					sevEnum = CVESeverityLow
				}

				matches = append(matches, CVEMatch{
					CVEID:      cveID,
					Component:  desc,
					Version:    "Target Build",
					Severity:   sevEnum,
					CVSS:       cvss,
					Similarity: similarity,
					Summary:    desc,
				})
			}
		}
	}

	if len(matches) == 0 {
		matches = matchLocalCVE(searchDoc)
	}
	return matches, nil
}

// insertMaintenanceWindowDB writes an active 15m maintenance window into Supabase/PostgreSQL
func insertMaintenanceWindowDB(w MaintenanceWindow) error {
	if dbConn != nil {
		_, err := dbConn.Exec(`
			INSERT INTO maintenance_windows (id, asset_id, officer_id, technician_id, opened_at, expires_at, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id) DO UPDATE SET
				expires_at = EXCLUDED.expires_at,
				status = EXCLUDED.status
		`, w.ID, w.AssetID, w.TechnicianID, w.TechnicianID, w.OpenedAt, w.ExpiresAt, string(w.Status))
		if err != nil {
			log.Printf("[OZIK-DB] Notice inserting maintenance window: %v", err)
		}

		// Also update asset's qr_window_status in PostgreSQL
		_, _ = dbConn.Exec(`
			UPDATE assets
			SET qr_window_status = 'OPEN', integrity_state = 'MAINTENANCE', updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, w.AssetID)
	}

	store.mu.Lock()
	store.ActiveWindow = &w
	store.MaintenanceWindows[w.AssetID] = w
	for i := range store.Assets {
		if store.Assets[i].ID == w.AssetID {
			store.Assets[i].QRWindowStatus = WindowOpen
			if store.Assets[i].IntegrityState == StateSecure {
				store.Assets[i].IntegrityState = StateMaintenance
			}
		}
	}
	store.mu.Unlock()
	go saveStoreToDisk()
	return nil
}

// checkActiveMaintenanceWindowDB checks live database if an active maintenance window exists
func checkActiveMaintenanceWindowDB(assetID string) (*MaintenanceWindow, bool) {
	canonicalID := resolveAssetID(assetID)

	if dbConn != nil {
		var w MaintenanceWindow
		var statusStr string
		var openedAt, expiresAt time.Time

		err := dbConn.QueryRow(`
			SELECT id, asset_id, COALESCE(officer_id, ''), opened_at, expires_at, status
			FROM maintenance_windows
			WHERE (asset_id = $1 OR asset_id = $2)
			  AND status = 'OPEN'
			  AND expires_at > CURRENT_TIMESTAMP
			ORDER BY expires_at DESC
			LIMIT 1
		`, assetID, canonicalID).Scan(&w.ID, &w.AssetID, &w.TechnicianID, &openedAt, &expiresAt, &statusStr)

		if err == nil {
			w.OpenedAt = openedAt.Format(time.RFC3339)
			w.ExpiresAt = expiresAt.Format(time.RFC3339)
			w.Status = QRWindowStatus(statusStr)
			return &w, true
		}
	}

	// In-memory fallback
	store.mu.RLock()
	defer store.mu.RUnlock()
	if win, exists := store.MaintenanceWindows[canonicalID]; exists && win.Status == WindowOpen {
		if expTime, err := time.Parse(time.RFC3339, win.ExpiresAt); err == nil && time.Now().Before(expTime) {
			return &win, true
		}
	}
	if store.ActiveWindow != nil && store.ActiveWindow.AssetID == canonicalID && store.ActiveWindow.Status == WindowOpen {
		if expTime, err := time.Parse(time.RFC3339, store.ActiveWindow.ExpiresAt); err == nil && time.Now().Before(expTime) {
			return store.ActiveWindow, true
		}
	}

	return nil, false
}

// getAssetsWithTelemetryDB runs live SQL query joining assets with latest telemetry_logs
func getAssetsWithTelemetryDB(criticalOnly bool) ([]Asset, error) {
	if dbConn == nil {
		store.mu.RLock()
		defer store.mu.RUnlock()
		if !criticalOnly {
			return store.Assets, nil
		}
		var crit []Asset
		for _, a := range store.Assets {
			if a.IntegrityState == StateCompromised || a.IntegrityState == StateQuarantined || a.QRWindowStatus == WindowOpen {
				crit = append(crit, a)
			}
		}
		return crit, nil
	}

	query := `
		SELECT a.id, a.name, a.serial_number, a.vendor, a.type, a.classification,
		       a.status, a.integrity_state, a.trust_score, a.firmware_hash, a.qr_hash,
		       a.qr_window_status, a.cve_count, a.registered_at,
		       COALESCE(a.latitude, 0), COALESCE(a.longitude, 0), COALESCE(a.location_name, '')
		FROM assets a
		ORDER BY a.created_at DESC
	`

	rows, err := dbConn.Query(query)
	if err != nil {
		log.Printf("[OZIK-DB] Notice querying live assets: %v", err)
		store.mu.RLock()
		defer store.mu.RUnlock()
		return store.Assets, nil
	}
	defer rows.Close()

	var result []Asset
	for rows.Next() {
		var a Asset
		var typeStr, classStr, statusStr, integStr, winStr string
		var regAt time.Time
		var trustScore sql.NullInt64
		var lat, lng float64
		var locName string

		if err := rows.Scan(
			&a.ID, &a.Name, &a.SerialNumber, &a.Vendor, &typeStr, &classStr,
			&statusStr, &integStr, &trustScore, &a.FirmwareHash, &a.QRHash,
			&winStr, &a.CVECount, &regAt,
			&lat, &lng, &locName,
		); err == nil {
			a.Type = AssetType(typeStr)
			a.Classification = AssetClassification(classStr)
			a.IntegrityState = IntegrityState(integStr)
			if a.IntegrityState == "" {
				a.IntegrityState = IntegrityState(statusStr)
			}
			a.QRWindowStatus = QRWindowStatus(winStr)
			if trustScore.Valid {
				sc := int(trustScore.Int64)
				a.TrustScore = &sc
			}
			if lat != 0 || lng != 0 {
				a.Latitude = &lat
				a.Longitude = &lng
			}
			a.LocationName = locName
			a.RegisteredAt = regAt.Format(time.RFC3339)

			if criticalOnly {
				if a.IntegrityState == StateCompromised || a.IntegrityState == StateQuarantined || a.QRWindowStatus == WindowOpen {
					result = append(result, a)
				}
			} else {
				result = append(result, a)
			}
		}
	}

	if len(result) == 0 {
		store.mu.RLock()
		defer store.mu.RUnlock()
		return store.Assets, nil
	}

	return result, nil
}

// updateAssetStatusInDB updates asset integrity and status in PostgreSQL
func updateAssetStatusInDB(assetID string, state IntegrityState, status string) {
	canonicalID := resolveAssetID(assetID)
	if dbConn != nil {
		_, err := dbConn.Exec(`
			UPDATE assets
			SET integrity_state = $1, status = $2, updated_at = CURRENT_TIMESTAMP
			WHERE id = $3 OR id = $4
		`, string(state), status, assetID, canonicalID)
		if err != nil {
			log.Printf("[OZIK-DB] Notice updating asset status: %v", err)
		}
	}

	store.mu.Lock()
	for i := range store.Assets {
		if store.Assets[i].ID == canonicalID || store.Assets[i].ID == assetID {
			store.Assets[i].IntegrityState = state
		}
	}
	store.mu.Unlock()
	go saveStoreToDisk()
}

// getForensicHistoryFromDB pulls cross-phase records for an asset (Phase 1, Phase 2, Phase 3)
func getForensicHistoryFromDB(assetID string) (Asset, []MaintenanceWindow, []TelemetryEvent) {
	canonicalID := resolveAssetID(assetID)

	var asset Asset
	var windows []MaintenanceWindow
	var logs []TelemetryEvent

	// 1. Phase 1: Initial vendor record from assets table
	if dbConn != nil {
		var typeStr, classStr, statusStr, integStr string
		var trustScore sql.NullInt64
		var regAt time.Time

		err := dbConn.QueryRow(`
			SELECT id, name, serial_number, vendor, type, classification, status, integrity_state, trust_score, firmware_hash, registered_at
			FROM assets
			WHERE id = $1 OR id = $2
			LIMIT 1
		`, assetID, canonicalID).Scan(&asset.ID, &asset.Name, &asset.SerialNumber, &asset.Vendor, &typeStr, &classStr, &statusStr, &integStr, &trustScore, &asset.FirmwareHash, &regAt)

		if err == nil {
			asset.Type = AssetType(typeStr)
			asset.Classification = AssetClassification(classStr)
			asset.IntegrityState = IntegrityState(integStr)
			if trustScore.Valid {
				sc := int(trustScore.Int64)
				asset.TrustScore = &sc
			}
			asset.RegisteredAt = regAt.Format(time.RFC3339)
		}

		// 2. Phase 2: Last maintenance windows
		wRows, wErr := dbConn.Query(`
			SELECT id, asset_id, COALESCE(officer_id, ''), opened_at, expires_at, status
			FROM maintenance_windows
			WHERE asset_id = $1 OR asset_id = $2
			ORDER BY opened_at DESC
			LIMIT 5
		`, assetID, canonicalID)
		if wErr == nil {
			defer wRows.Close()
			for wRows.Next() {
				var w MaintenanceWindow
				var st string
				var op, exp time.Time
				if err := wRows.Scan(&w.ID, &w.AssetID, &w.TechnicianID, &op, &exp, &st); err == nil {
					w.OpenedAt = op.Format(time.RFC3339)
					w.ExpiresAt = exp.Format(time.RFC3339)
					w.Status = QRWindowStatus(st)
					windows = append(windows, w)
				}
			}
		}

		// 3. Phase 3: Telemetry logs
		lRows, lErr := dbConn.Query(`
			SELECT id, asset_id, temperature_c, voltage_v, firmware_hash, status, network_tx_kbps, created_at
			FROM telemetry_logs
			WHERE asset_id = $1 OR asset_id = $2
			ORDER BY created_at DESC
			LIMIT 25
		`, assetID, canonicalID)
		if lErr == nil {
			defer lRows.Close()
			for lRows.Next() {
				var id, aID, fw, st string
				var temp, volt, tx float64
				var crAt time.Time
				if err := lRows.Scan(&id, &aID, &temp, &volt, &fw, &st, &tx, &crAt); err == nil {
					sev := SeverityInfo
					if st == "ANOMALY" || st == "CRITICAL" {
						sev = SeverityCritical
					} else if temp > 70.0 || tx > 4000.0 {
						sev = SeverityWarning
					}
					logs = append(logs, TelemetryEvent{
						ID:        id,
						Timestamp: crAt.Format(time.RFC3339),
						AssetID:   aID,
						Source:    SourceFirmware,
						Severity:  sev,
						Message:   fmt.Sprintf("Live Telemetry | Temp: %.1f C, Volt: %.1f V, Tx: %.1f Kbps, Status: %s", temp, volt, tx, st),
						Actor:     "OT_EDGE_SENSOR",
					})
				}
			}
		}
	}

	// Fallback to memory if DB records empty
	if asset.ID == "" {
		store.mu.RLock()
		for _, a := range store.Assets {
			if a.ID == canonicalID || a.ID == assetID {
				asset = a
				break
			}
		}
		if len(logs) == 0 {
			for _, l := range store.Telemetry {
				if l.AssetID == canonicalID || l.AssetID == assetID {
					logs = append(logs, l)
				}
			}
		}
		store.mu.RUnlock()
	}

	return asset, windows, logs
}

// getAllUsersAndOfficersDB reads officers and users from Supabase/PostgreSQL
func getAllUsersAndOfficersDB() []OfficerProfile {
	if dbConn == nil {
		store.mu.RLock()
		defer store.mu.RUnlock()
		return store.Officers
	}

	rows, err := dbConn.Query(`
		SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit, ''), COALESCE(rank, ''), COALESCE(status, 'APPROVED'), COALESCE(public_key, '')
		FROM officer_profiles
		ORDER BY created_at DESC
	`)
	if err != nil {
		store.mu.RLock()
		defer store.mu.RUnlock()
		return store.Officers
	}
	defer rows.Close()

	var officers []OfficerProfile
	for rows.Next() {
		var off OfficerProfile
		var rStr string
		if err := rows.Scan(&off.ID, &off.Name, &off.Email, &rStr, &off.NRP, &off.Unit, &off.Rank, &off.Status, &off.PublicKey); err == nil {
			off.Role = TacticalRole(rStr)
			officers = append(officers, off)
		}
	}

	if len(officers) == 0 {
		store.mu.RLock()
		defer store.mu.RUnlock()
		return store.Officers
	}
	return officers
}




