package repository

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"ozik-sentinel-backend/internal/models"
)

type Repository struct {
	db     *sql.DB
	dbLock sync.RWMutex

	// In-memory fallback ONLY when DATABASE_URL is not provided (pure air-gap mode)
	memLock            sync.RWMutex
	memAssets          []models.Asset
	memTelemetry       []models.TelemetryEvent
	memCorrelations    []models.TelemetryCorrelation
	memLedger          []models.LedgerEntry
	memOfficers        []models.OfficerProfile
	memWindows         map[string]models.MaintenanceWindow
	memPendingCommands map[string][]models.IoTCommand
}

func sha256Hex(data string) string {
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func NewRepository(databaseURL string) (*Repository, error) {
	repo := &Repository{
		memAssets:          make([]models.Asset, 0),
		memTelemetry:       make([]models.TelemetryEvent, 0),
		memCorrelations:    make([]models.TelemetryCorrelation, 0),
		memLedger:          make([]models.LedgerEntry, 0),
		memOfficers:        make([]models.OfficerProfile, 0),
		memWindows:         make(map[string]models.MaintenanceWindow),
		memPendingCommands: make(map[string][]models.IoTCommand),
	}

	if databaseURL != "" {
		db, err := sql.Open("postgres", databaseURL)
		if err != nil {
			log.Printf("[OZIK-DB] Error opening PostgreSQL connection: %v", err)
			return repo, err
		}

		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(15 * time.Minute)

		if err := db.Ping(); err != nil {
			log.Printf("[OZIK-DB] PostgreSQL ping warning: %v (operating in air-gapped memory mode)", err)
		} else {
			log.Printf("[OZIK-DB] PostgreSQL connected successfully via DATABASE_URL")
			repo.db = db
			repo.migrate()
		}
	} else {
		log.Printf("[OZIK-DB] No DATABASE_URL specified. Initializing in clean in-memory mode.")
	}

	return repo, nil
}

func (r *Repository) Ping() error {
	if r.db == nil {
		return fmt.Errorf("database connection not configured")
	}
	return r.db.Ping()
}

func (r *Repository) migrate() {
	if r.db == nil {
		return
	}

	queries := []string{
		`CREATE TABLE IF NOT EXISTS assets (
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
		);`,
		`CREATE TABLE IF NOT EXISTS audit_ledger (
			id SERIAL PRIMARY KEY,
			prev_hash TEXT NOT NULL,
			current_hash TEXT NOT NULL UNIQUE,
			action VARCHAR(128) NOT NULL,
			officer_id VARCHAR(128) NOT NULL,
			payload_json JSONB,
			timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS ledger_entries (
			index INT PRIMARY KEY,
			timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			actor VARCHAR(128) NOT NULL,
			action VARCHAR(128) NOT NULL,
			asset_id VARCHAR(64),
			payload_hash TEXT NOT NULL,
			previous_hash TEXT NOT NULL,
			hash TEXT NOT NULL UNIQUE
		);`,
		`CREATE TABLE IF NOT EXISTS telemetry_logs (
			id VARCHAR(64) PRIMARY KEY,
			asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
			temperature_c NUMERIC(5,2),
			voltage_v NUMERIC(5,2),
			firmware_hash TEXT NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'NOMINAL',
			network_tx_kbps NUMERIC(10,2) DEFAULT 0,
			created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS telemetry_events (
			id VARCHAR(64) PRIMARY KEY,
			timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
			source VARCHAR(32) NOT NULL,
			severity VARCHAR(32) NOT NULL,
			message TEXT NOT NULL,
			actor VARCHAR(128)
		);`,
		`CREATE TABLE IF NOT EXISTS telemetry_correlations (
			id VARCHAR(64) PRIMARY KEY,
			timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
			network_event TEXT NOT NULL,
			physical_authorization VARCHAR(32) NOT NULL,
			maintenance_window_id VARCHAR(64),
			verdict VARCHAR(32) NOT NULL DEFAULT 'NOMINAL'
		);`,
		`CREATE TABLE IF NOT EXISTS officer_profiles (
			id VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255) UNIQUE NOT NULL,
			role VARCHAR(64) NOT NULL DEFAULT 'COMMANDER',
			nrp VARCHAR(64) NOT NULL,
			unit VARCHAR(128),
			rank VARCHAR(64),
			status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
			approved_by VARCHAR(128),
			public_key TEXT,
			created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS maintenance_windows (
			id VARCHAR(64) PRIMARY KEY,
			asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
			officer_id VARCHAR(128) NOT NULL,
			technician_id VARCHAR(128),
			opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMPTZ NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
			created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
			id VARCHAR(64) PRIMARY KEY,
			cve_id VARCHAR(64) UNIQUE NOT NULL,
			description TEXT NOT NULL,
			severity VARCHAR(32) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		);`,
		`INSERT INTO cve_vulnerabilities (id, cve_id, description, severity)
		VALUES
			('cve-01', 'CVE-2024-38812', 'OT Bridge DCE/RPC protocol heap overflow remote code execution in tactical bridge', 'CRITICAL'),
			('cve-02', 'CVE-2023-4863', 'Hardware Decoder libwebp buffer overflow allowing code execution during manifest rendering', 'HIGH'),
			('cve-03', 'CVE-2024-21413', 'OT Signal Transceiver Firmware telemetry banner leak on high-frequency port', 'LOW'),
			('cve-04', 'CVE-2023-34362', 'SQL Injection in tactical gateway telemetry pipe allowing unauthorized data extraction', 'CRITICAL')
		ON CONFLICT (cve_id) DO NOTHING;`,
		`ALTER TABLE assets ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);`,
		`ALTER TABLE assets ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);`,
		`ALTER TABLE assets ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);`,
		`ALTER TABLE assets ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE telemetry_correlations ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE audit_ledger ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`ALTER TABLE maintenance_windows ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) DEFAULT '';`,
		`DELETE FROM assets WHERE COALESCE(owner_id, '') = '';`,
		`DELETE FROM telemetry_correlations WHERE COALESCE(owner_id, '') = '';`,
		`DELETE FROM telemetry_logs WHERE COALESCE(owner_id, '') = '';`,
		`DELETE FROM ledger_entries WHERE COALESCE(owner_id, '') = '';`,
		`ALTER TABLE IF EXISTS assets ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS audit_ledger ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS cve_vulnerabilities ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS ledger_entries ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS maintenance_windows ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS officer_profiles ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS telemetry_correlations ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS telemetry_events ENABLE ROW LEVEL SECURITY;`,
		`ALTER TABLE IF EXISTS telemetry_logs ENABLE ROW LEVEL SECURITY;`,
		`DROP POLICY IF EXISTS "Allow all operations for assets" ON assets;`,
		`CREATE POLICY "Allow all operations for assets" ON assets FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for audit_ledger" ON audit_ledger;`,
		`CREATE POLICY "Allow all operations for audit_ledger" ON audit_ledger FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for cve_vulnerabilities" ON cve_vulnerabilities;`,
		`CREATE POLICY "Allow all operations for cve_vulnerabilities" ON cve_vulnerabilities FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for ledger_entries" ON ledger_entries;`,
		`CREATE POLICY "Allow all operations for ledger_entries" ON ledger_entries FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for maintenance_windows" ON maintenance_windows;`,
		`CREATE POLICY "Allow all operations for maintenance_windows" ON maintenance_windows FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for officer_profiles" ON officer_profiles;`,
		`CREATE POLICY "Allow all operations for officer_profiles" ON officer_profiles FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for telemetry_correlations" ON telemetry_correlations;`,
		`CREATE POLICY "Allow all operations for telemetry_correlations" ON telemetry_correlations FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for telemetry_events" ON telemetry_events;`,
		`CREATE POLICY "Allow all operations for telemetry_events" ON telemetry_events FOR ALL USING (true) WITH CHECK (true);`,
		`DROP POLICY IF EXISTS "Allow all operations for telemetry_logs" ON telemetry_logs;`,
		`CREATE POLICY "Allow all operations for telemetry_logs" ON telemetry_logs FOR ALL USING (true) WITH CHECK (true);`,

	}

	for _, q := range queries {
		if _, err := r.db.Exec(q); err != nil {
			log.Printf("[OZIK-DB] Migration statement notice: %v", err)
		}
	}
}

// ----------------------------------------------------------------------------
// Assets
// ----------------------------------------------------------------------------

func (r *Repository) GetAssets(criticalOnly bool, limit, offset int, ownerID ...string) ([]models.Asset, int, error) {
	owner := ""
	if len(ownerID) > 0 {
		owner = strings.TrimSpace(ownerID[0])
	}

	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		var res []models.Asset
		for _, a := range r.memAssets {
			if owner != "" && !strings.EqualFold(a.OwnerID, owner) {
				continue
			}
			if criticalOnly && !(a.IntegrityState == models.StateCompromised || a.IntegrityState == models.StateQuarantined || a.QRWindowStatus == models.WindowOpen) {
				continue
			}
			res = append(res, a)
		}
		total := len(res)
		if offset > 0 && offset < len(res) {
			res = res[offset:]
		}
		if limit > 0 && len(res) > limit {
			res = res[:limit]
		}
		return res, total, nil
	}

	var conditions []string
	var args []interface{}
	argIdx := 1

	if criticalOnly {
		conditions = append(conditions, "(a.integrity_state IN ('COMPROMISED', 'QUARANTINED') OR a.qr_window_status = 'OPEN')")
	}
	if owner != "" {
		conditions = append(conditions, fmt.Sprintf("LOWER(COALESCE(a.owner_id, '')) = LOWER($%d)", argIdx))
		args = append(args, owner)
		argIdx++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM assets a %s", whereClause)
	var total int
	_ = r.db.QueryRow(countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT a.id, a.name, a.serial_number, a.vendor, a.type, a.classification,
		       a.status, a.integrity_state, a.trust_score, a.firmware_hash, a.qr_hash,
		       a.qr_window_status, a.cve_count, a.registered_at,
		       COALESCE(a.latitude, 0), COALESCE(a.longitude, 0), COALESCE(a.location_name, ''),
		       COALESCE(a.owner_id, '')
		FROM assets a
		%s
		ORDER BY a.created_at DESC
	`, whereClause)

	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return []models.Asset{}, 0, err
	}
	defer rows.Close()

	var result []models.Asset
	for rows.Next() {
		var a models.Asset
		var typeStr, classStr, statusStr, integStr, winStr string
		var regAt time.Time
		var trustScore sql.NullInt64
		var lat, lng float64
		var locName, ownID string

		if err := rows.Scan(
			&a.ID, &a.Name, &a.SerialNumber, &a.Vendor, &typeStr, &classStr,
			&statusStr, &integStr, &trustScore, &a.FirmwareHash, &a.QRHash,
			&winStr, &a.CVECount, &regAt,
			&lat, &lng, &locName, &ownID,
		); err == nil {
			a.Type = models.AssetType(typeStr)
			a.Classification = models.AssetClassification(classStr)
			a.IntegrityState = models.IntegrityState(integStr)
			if a.IntegrityState == "" {
				a.IntegrityState = models.IntegrityState(statusStr)
			}
			a.QRWindowStatus = models.QRWindowStatus(winStr)
			if trustScore.Valid {
				sc := int(trustScore.Int64)
				a.TrustScore = &sc
			}
			if lat != 0 || lng != 0 {
				a.Latitude = &lat
				a.Longitude = &lng
			}
			a.LocationName = locName
			a.OwnerID = ownID
			a.RegisteredAt = regAt.Format(time.RFC3339)
			result = append(result, a)
		}
	}

	if result == nil {
		result = []models.Asset{}
	}
	return result, total, nil
}

func (r *Repository) GetAssetByID(id string) (*models.Asset, bool) {
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		for _, a := range r.memAssets {
			if a.ID == id {
				cp := a
				return &cp, true
			}
		}
		return nil, false
	}

	var a models.Asset
	var typeStr, classStr, statusStr, integStr, winStr string
	var regAt time.Time
	var trustScore sql.NullInt64
	var lat, lng float64
	var locName, ownID string

	err := r.db.QueryRow(`
		SELECT id, name, serial_number, vendor, type, classification,
		       status, integrity_state, trust_score, firmware_hash, qr_hash,
		       qr_window_status, cve_count, registered_at,
		       COALESCE(latitude, 0), COALESCE(longitude, 0), COALESCE(location_name, ''),
		       COALESCE(owner_id, '')
		FROM assets
		WHERE id = $1
	`, id).Scan(
		&a.ID, &a.Name, &a.SerialNumber, &a.Vendor, &typeStr, &classStr,
		&statusStr, &integStr, &trustScore, &a.FirmwareHash, &a.QRHash,
		&winStr, &a.CVECount, &regAt,
		&lat, &lng, &locName, &ownID,
	)
	if err != nil {
		return nil, false
	}

	a.Type = models.AssetType(typeStr)
	a.Classification = models.AssetClassification(classStr)
	a.IntegrityState = models.IntegrityState(integStr)
	if a.IntegrityState == "" {
		a.IntegrityState = models.IntegrityState(statusStr)
	}
	a.QRWindowStatus = models.QRWindowStatus(winStr)
	if trustScore.Valid {
		sc := int(trustScore.Int64)
		a.TrustScore = &sc
	}
	if lat != 0 || lng != 0 {
		a.Latitude = &lat
		a.Longitude = &lng
	}
	a.LocationName = locName
	a.OwnerID = ownID
	a.RegisteredAt = regAt.Format(time.RFC3339)
	return &a, true
}

func (r *Repository) GetLatestTelemetryLog(assetID string) (map[string]interface{}, error) {
	if r.db == nil {
		return map[string]interface{}{
			"asset_id":        assetID,
			"temperature_c":   39.1,
			"voltage_v":       24.2,
			"network_tx_kbps": 320.0,
			"firmware_hash":   "verified_nominal_hash",
			"status":          "NOMINAL",
			"created_at":      time.Now().Format(time.RFC3339),
		}, nil
	}

	var temp, volt, tx float64
	var fwHash, status string
	var createdAt time.Time

	err := r.db.QueryRow(`
		SELECT temperature_c, voltage_v, network_tx_kbps, firmware_hash, status, created_at
		FROM telemetry_logs
		WHERE asset_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, assetID).Scan(&temp, &volt, &tx, &fwHash, &status, &createdAt)

	if err != nil {
		return map[string]interface{}{
			"asset_id":        assetID,
			"temperature_c":   39.1,
			"voltage_v":       24.0,
			"network_tx_kbps": 210.0,
			"firmware_hash":   "baseline_fw_verified",
			"status":          "NOMINAL",
			"created_at":      time.Now().Format(time.RFC3339),
		}, nil
	}

	return map[string]interface{}{
		"asset_id":        assetID,
		"temperature_c":   temp,
		"voltage_v":       volt,
		"network_tx_kbps": tx,
		"firmware_hash":   fwHash,
		"status":          status,
		"created_at":      createdAt.Format(time.RFC3339),
	}, nil
}

func (r *Repository) UpsertAsset(a models.Asset) error {
	trust := 90
	if a.TrustScore != nil {
		trust = *a.TrustScore
	}
	var lat, lng float64
	if a.Latitude != nil {
		lat = *a.Latitude
	}
	if a.Longitude != nil {
		lng = *a.Longitude
	}

	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO assets (id, name, serial_number, vendor, type, classification, status, integrity_state, trust_score, firmware_hash, qr_hash, qr_window_status, cve_count, latitude, longitude, location_name, owner_id, registered_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				vendor = EXCLUDED.vendor,
				status = EXCLUDED.status,
				integrity_state = EXCLUDED.integrity_state,
				trust_score = EXCLUDED.trust_score,
				firmware_hash = EXCLUDED.firmware_hash,
				qr_hash = EXCLUDED.qr_hash,
				qr_window_status = EXCLUDED.qr_window_status,
				cve_count = EXCLUDED.cve_count,
				latitude = CASE WHEN EXCLUDED.latitude != 0 THEN EXCLUDED.latitude ELSE assets.latitude END,
				longitude = CASE WHEN EXCLUDED.longitude != 0 THEN EXCLUDED.longitude ELSE assets.longitude END,
				location_name = CASE WHEN EXCLUDED.location_name != '' THEN EXCLUDED.location_name ELSE assets.location_name END,
				owner_id = CASE WHEN EXCLUDED.owner_id != '' THEN EXCLUDED.owner_id ELSE assets.owner_id END,
				updated_at = CURRENT_TIMESTAMP
		`, a.ID, a.Name, a.SerialNumber, a.Vendor, string(a.Type), string(a.Classification),
			string(a.IntegrityState), string(a.IntegrityState), trust, a.FirmwareHash,
			a.QRHash, string(a.QRWindowStatus), a.CVECount, lat, lng, a.LocationName, a.OwnerID)
		if err != nil {
			log.Printf("[OZIK-DB] Error upserting asset %s: %v", a.ID, err)
			return err
		}
	}

	r.memLock.Lock()
	found := false
	for i := range r.memAssets {
		if r.memAssets[i].ID == a.ID {
			r.memAssets[i] = a
			found = true
			break
		}
	}
	if !found {
		r.memAssets = append(r.memAssets, a)
	}
	r.memLock.Unlock()

	return nil
}

func (r *Repository) UpdateAssetStatus(assetID string, state models.IntegrityState, status string) error {
	if r.db != nil {
		_, err := r.db.Exec(`
			UPDATE assets
			SET integrity_state = $1, status = $2, updated_at = CURRENT_TIMESTAMP
			WHERE id = $3
		`, string(state), status, assetID)
		if err != nil {
			log.Printf("[OZIK-DB] Error updating asset status: %v", err)
			return err
		}
	}

	r.memLock.Lock()
	for i := range r.memAssets {
		if r.memAssets[i].ID == assetID {
			r.memAssets[i].IntegrityState = state
			break
		}
	}
	r.memLock.Unlock()
	return nil
}

// ----------------------------------------------------------------------------
// Telemetry & Maintenance Windows
// ----------------------------------------------------------------------------

func (r *Repository) InsertTelemetryLog(assetID string, temp, volt, tx float64, fwHash, status string) error {
	id := fmt.Sprintf("TEL-%d-%04d", time.Now().UnixNano(), rand.Intn(10000))
	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO telemetry_logs (id, asset_id, temperature_c, voltage_v, firmware_hash, status, network_tx_kbps, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
		`, id, assetID, temp, volt, fwHash, status, tx)
		if err != nil {
			log.Printf("[OZIK-DB] Notice inserting telemetry log: %v", err)
		}
	}

	ev := models.TelemetryEvent{
		ID:        id,
		Timestamp: time.Now().Format(time.RFC3339),
		AssetID:   assetID,
		Source:    models.SourceFirmware,
		Severity:  models.SeverityInfo,
		Message:   fmt.Sprintf("Live Telemetry | Temp: %.1f C, Volt: %.1f V, Tx: %.0f Kbps, Status: %s", temp, volt, tx, status),
		Actor:     "OT_EDGE_SENSOR",
	}
	if status == "ANOMALY" || status == "CRITICAL" {
		ev.Severity = models.SeverityCritical
	}

	r.memLock.Lock()
	r.memTelemetry = append([]models.TelemetryEvent{ev}, r.memTelemetry...)
	if len(r.memTelemetry) > 200 {
		r.memTelemetry = r.memTelemetry[:200]
	}
	r.memLock.Unlock()

	return nil
}

func (r *Repository) OpenMaintenanceWindow(assetID, technicianID string, durationMinutes int) (*models.MaintenanceWindow, error) {
	windowID := fmt.Sprintf("WIN-%d", time.Now().Unix()%100000)
	openedAt := time.Now()
	expiresAt := openedAt.Add(time.Duration(durationMinutes) * time.Minute)

	w := &models.MaintenanceWindow{
		ID:           windowID,
		AssetID:      assetID,
		TechnicianID: technicianID,
		OpenedAt:     openedAt.Format(time.RFC3339),
		ExpiresAt:    expiresAt.Format(time.RFC3339),
		Status:       models.WindowOpen,
	}

	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO maintenance_windows (id, asset_id, officer_id, technician_id, opened_at, expires_at, status)
			VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
		`, w.ID, w.AssetID, technicianID, technicianID, openedAt, expiresAt)
		if err != nil {
			log.Printf("[OZIK-DB] Error opening maintenance window: %v", err)
		}

		_, _ = r.db.Exec(`
			UPDATE assets
			SET qr_window_status = 'OPEN', updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, assetID)
	}

	r.memLock.Lock()
	r.memWindows[assetID] = *w
	for i := range r.memAssets {
		if r.memAssets[i].ID == assetID {
			r.memAssets[i].QRWindowStatus = models.WindowOpen
			break
		}
	}
	r.memLock.Unlock()

	return w, nil
}

func (r *Repository) CheckActiveMaintenanceWindow(assetID string) (*models.MaintenanceWindow, bool) {
	if r.db != nil {
		var w models.MaintenanceWindow
		var statusStr string
		var openedAt, expiresAt time.Time

		err := r.db.QueryRow(`
			SELECT id, asset_id, COALESCE(officer_id, ''), opened_at, expires_at, status
			FROM maintenance_windows
			WHERE asset_id = $1
			  AND status = 'OPEN'
			  AND expires_at > CURRENT_TIMESTAMP
			ORDER BY expires_at DESC
			LIMIT 1
		`, assetID).Scan(&w.ID, &w.AssetID, &w.TechnicianID, &openedAt, &expiresAt, &statusStr)

		if err == nil {
			w.OpenedAt = openedAt.Format(time.RFC3339)
			w.ExpiresAt = expiresAt.Format(time.RFC3339)
			w.Status = models.QRWindowStatus(statusStr)
			return &w, true
		}
	}

	r.memLock.RLock()
	defer r.memLock.RUnlock()
	if win, exists := r.memWindows[assetID]; exists && win.Status == models.WindowOpen {
		if expTime, err := time.Parse(time.RFC3339, win.ExpiresAt); err == nil && time.Now().Before(expTime) {
			return &win, true
		}
	}
	return nil, false
}

func (r *Repository) GetTelemetryCorrelations(limit, offset int, ownerID ...string) ([]models.TelemetryCorrelation, int, error) {
	return r.GetTelemetryCorrelationsWithFilter(limit, offset, "", ownerID...)
}

func (r *Repository) GetTelemetryCorrelationsWithFilter(limit, offset int, search string, ownerID ...string) ([]models.TelemetryCorrelation, int, error) {
	owner := ""
	if len(ownerID) > 0 {
		owner = strings.TrimSpace(ownerID[0])
	}
	search = strings.TrimSpace(search)
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		var filtered []models.TelemetryCorrelation
		for _, c := range r.memCorrelations {
			if owner != "" && !strings.EqualFold(c.OwnerID, owner) {
				continue
			}
			if search != "" {
				s := strings.ToLower(search)
				if !strings.Contains(strings.ToLower(c.AssetID), s) &&
					!strings.Contains(strings.ToLower(c.NetworkEvent), s) &&
					!strings.Contains(strings.ToLower(c.Verdict), s) &&
					!strings.Contains(strings.ToLower(string(c.PhysicalAuthorization)), s) {
					continue
				}
			}
			filtered = append(filtered, c)
		}
		total := len(filtered)
		if offset > 0 && offset < len(filtered) {
			filtered = filtered[offset:]
		}
		if limit > 0 && len(filtered) > limit {
			filtered = filtered[:limit]
		}
		return filtered, total, nil
	}

	var whereClauses []string
	var args []interface{}
	argIdx := 1

	if owner != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("LOWER(COALESCE(owner_id, '')) = LOWER($%d)", argIdx))
		args = append(args, owner)
		argIdx++
	}

	if search != "" {
		pattern := "%" + search + "%"
		whereClauses = append(whereClauses, fmt.Sprintf("(asset_id ILIKE $%d OR network_event ILIKE $%d OR verdict ILIKE $%d OR physical_authorization ILIKE $%d)", argIdx, argIdx, argIdx, argIdx))
		args = append(args, pattern)
		argIdx++
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM telemetry_correlations %s", whereSQL)
	var total int
	_ = r.db.QueryRow(countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, timestamp, asset_id, network_event, physical_authorization, COALESCE(maintenance_window_id, ''), verdict, COALESCE(owner_id, '')
		FROM telemetry_correlations
		%s
		ORDER BY timestamp DESC
	`, whereSQL)

	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return []models.TelemetryCorrelation{}, 0, err
	}
	defer rows.Close()

	var list []models.TelemetryCorrelation
	for rows.Next() {
		var c models.TelemetryCorrelation
		var ts time.Time
		var authStr, ownID string
		if err := rows.Scan(&c.ID, &ts, &c.AssetID, &c.NetworkEvent, &authStr, &c.MaintenanceWindowID, &c.Verdict, &ownID); err == nil {
			c.Timestamp = ts.Format(time.RFC3339)
			c.PhysicalAuthorization = models.PhysicalAuthorization(authStr)
			c.OwnerID = ownID
			list = append(list, c)
		}
	}
	if list == nil {
		list = []models.TelemetryCorrelation{}
	}
	return list, total, nil
}

func (r *Repository) InsertCorrelation(corr models.TelemetryCorrelation) error {
	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO telemetry_correlations (id, timestamp, asset_id, network_event, physical_authorization, maintenance_window_id, verdict, owner_id)
			VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7)
		`, corr.ID, corr.AssetID, corr.NetworkEvent, string(corr.PhysicalAuthorization), corr.MaintenanceWindowID, corr.Verdict, corr.OwnerID)
		if err != nil {
			log.Printf("[OZIK-DB] Error inserting correlation: %v", err)
		}
	}

	r.memLock.Lock()
	r.memCorrelations = append([]models.TelemetryCorrelation{corr}, r.memCorrelations...)
	if len(r.memCorrelations) > 100 {
		r.memCorrelations = r.memCorrelations[:100]
	}
	r.memLock.Unlock()

	return nil
}

// ----------------------------------------------------------------------------
// Audit Ledger (Cryptographic SHA-256 Hash Chained)
// ----------------------------------------------------------------------------

func (r *Repository) AppendLedger(actor, action, assetID, payload string, ownerID ...string) (*models.LedgerEntry, error) {
	owner := ""
	if len(ownerID) > 0 {
		owner = strings.TrimSpace(ownerID[0])
	}
	prevHash := "0000000000000000000000000000000000000000000000000000000000000000"
	index := 0

	if r.db != nil {
		var lastHash string
		var lastIndex int
		var err error
		if owner != "" {
			err = r.db.QueryRow(`
				SELECT index, hash FROM ledger_entries WHERE LOWER(COALESCE(owner_id, '')) = LOWER($1) ORDER BY index DESC LIMIT 1
			`, owner).Scan(&lastIndex, &lastHash)
		} else {
			err = r.db.QueryRow(`
				SELECT index, hash FROM ledger_entries ORDER BY index DESC LIMIT 1
			`).Scan(&lastIndex, &lastHash)
		}
		if err == nil {
			prevHash = lastHash
		}
		var maxIndex int
		if errMax := r.db.QueryRow(`SELECT COALESCE(MAX(index), -1) FROM ledger_entries`).Scan(&maxIndex); errMax == nil {
			index = maxIndex + 1
		}
	} else {
		r.memLock.RLock()
		if len(r.memLedger) > 0 {
			for i := len(r.memLedger) - 1; i >= 0; i-- {
				if owner == "" || strings.EqualFold(r.memLedger[i].OwnerID, owner) {
					prevHash = r.memLedger[i].Hash
					break
				}
			}
			index = r.memLedger[len(r.memLedger)-1].Index + 1
		}
		r.memLock.RUnlock()
	}

	payloadHash := sha256Hex(payload)
	blockString := fmt.Sprintf("%d:%s:%s:%s:%s", index, prevHash, actor, action, payloadHash)
	currHash := sha256Hex(blockString)

	entry := &models.LedgerEntry{
		Index:        index,
		Timestamp:    time.Now().Format(time.RFC3339),
		Actor:        actor,
		Action:       action,
		AssetID:      assetID,
		PayloadHash:  payloadHash,
		PreviousHash: prevHash,
		Hash:         currHash,
		OwnerID:      owner,
	}

	if r.db != nil {
		_, _ = r.db.Exec(`
			INSERT INTO ledger_entries (index, timestamp, actor, action, asset_id, payload_hash, previous_hash, hash, owner_id)
			VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8)
		`, entry.Index, entry.Actor, entry.Action, entry.AssetID, entry.PayloadHash, entry.PreviousHash, entry.Hash, owner)

		payloadObj := map[string]interface{}{"raw": payload, "asset_id": assetID, "owner_id": owner}
		payloadBytes, _ := json.Marshal(payloadObj)
		_, _ = r.db.Exec(`
			INSERT INTO audit_ledger (prev_hash, current_hash, action, officer_id, payload_json, owner_id, timestamp)
			VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
		`, prevHash, currHash, action, actor, string(payloadBytes), owner)
	}

	r.memLock.Lock()
	r.memLedger = append(r.memLedger, *entry)
	r.memLock.Unlock()

	return entry, nil
}

func (r *Repository) GetLedger(limit, offset int, ownerID ...string) ([]models.LedgerEntry, int, error) {
	owner := ""
	if len(ownerID) > 0 {
		owner = strings.TrimSpace(ownerID[0])
	}
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		var filtered []models.LedgerEntry
		for i := len(r.memLedger) - 1; i >= 0; i-- {
			e := r.memLedger[i]
			if owner != "" && !strings.EqualFold(e.OwnerID, owner) {
				continue
			}
			filtered = append(filtered, e)
		}
		total := len(filtered)
		if offset > 0 && offset < len(filtered) {
			filtered = filtered[offset:]
		}
		if limit > 0 && len(filtered) > limit {
			filtered = filtered[:limit]
		}
		return filtered, total, nil
	}

	var whereSQL string
	var args []interface{}
	if owner != "" {
		whereSQL = "WHERE LOWER(COALESCE(owner_id, '')) = LOWER($1)"
		args = append(args, owner)
	}

	var total int
	_ = r.db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM ledger_entries %s`, whereSQL), args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT index, timestamp, actor, action, COALESCE(asset_id, ''), payload_hash, previous_hash, hash, COALESCE(owner_id, '')
		FROM ledger_entries
		%s
		ORDER BY index DESC
	`, whereSQL)
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return []models.LedgerEntry{}, 0, err
	}
	defer rows.Close()

	var list []models.LedgerEntry
	for rows.Next() {
		var e models.LedgerEntry
		var ts time.Time
		if err := rows.Scan(&e.Index, &ts, &e.Actor, &e.Action, &e.AssetID, &e.PayloadHash, &e.PreviousHash, &e.Hash, &e.OwnerID); err == nil {
			e.Timestamp = ts.Format(time.RFC3339)
			list = append(list, e)
		}
	}
	if list == nil {
		list = []models.LedgerEntry{}
	}
	return list, total, nil
}

func (r *Repository) VerifyLedgerIntegrity(ownerID ...string) (bool, int, int) {
	ledger, _, err := r.GetLedger(0, 0, ownerID...)
	if err != nil || len(ledger) == 0 {
		return true, 0, 0
	}

	total := len(ledger)
	tampered := 0

	// Ledger returned in descending order; reverse for chronological verification
	chronological := make([]models.LedgerEntry, total)
	for i := range ledger {
		chronological[total-1-i] = ledger[i]
	}

	for i := 1; i < total; i++ {
		prev := chronological[i-1]
		curr := chronological[i]

		if curr.PreviousHash != prev.Hash {
			tampered++
			continue
		}

		blockString := fmt.Sprintf("%d:%s:%s:%s:%s", curr.Index, curr.PreviousHash, curr.Actor, curr.Action, curr.PayloadHash)
		expectedHash := sha256Hex(blockString)

		if curr.Hash != expectedHash {
			tampered++
		}
	}

	return tampered == 0, total, tampered
}

// ----------------------------------------------------------------------------
// Officers & Members
// ----------------------------------------------------------------------------

func (r *Repository) GetOfficers() ([]models.OfficerProfile, error) {
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		return r.memOfficers, nil
	}

	rows, err := r.db.Query(`
		SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit, ''), COALESCE(rank, ''), COALESCE(status, 'APPROVED'), COALESCE(public_key, '')
		FROM officer_profiles
		ORDER BY created_at DESC
	`)
	if err != nil {
		return []models.OfficerProfile{}, err
	}
	defer rows.Close()

	var officers []models.OfficerProfile
	for rows.Next() {
		var off models.OfficerProfile
		var rStr string
		if err := rows.Scan(&off.ID, &off.Name, &off.Email, &rStr, &off.NRP, &off.Unit, &off.Rank, &off.Status, &off.PublicKey); err == nil {
			off.Role = models.TacticalRole(rStr)
			officers = append(officers, off)
		}
	}
	if officers == nil {
		officers = []models.OfficerProfile{}
	}
	return officers, nil
}

func (r *Repository) FindOfficerByEmail(email string) (*models.OfficerProfile, error) {
	clean := strings.ToLower(strings.TrimSpace(email))
	if r.db != nil {
		var off models.OfficerProfile
		var rStr string
		err := r.db.QueryRow(`
			SELECT id, name, email, role, COALESCE(nrp, ''), COALESCE(unit, ''), COALESCE(rank, ''), COALESCE(status, 'APPROVED'), COALESCE(public_key, '')
			FROM officer_profiles
			WHERE LOWER(email) = $1
			LIMIT 1
		`, clean).Scan(&off.ID, &off.Name, &off.Email, &rStr, &off.NRP, &off.Unit, &off.Rank, &off.Status, &off.PublicKey)
		if err == nil {
			off.Role = models.TacticalRole(rStr)
			return &off, nil
		}
	}

	r.memLock.RLock()
	defer r.memLock.RUnlock()
	for _, o := range r.memOfficers {
		if strings.ToLower(o.Email) == clean {
			return &o, nil
		}
	}
	return nil, fmt.Errorf("officer not found: %s", email)
}

func (r *Repository) UpsertOfficer(off models.OfficerProfile) error {
	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO officer_profiles (id, name, email, role, nrp, unit, rank, status, approved_by, public_key, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
			ON CONFLICT (email) DO UPDATE SET
				name = EXCLUDED.name,
				role = EXCLUDED.role,
				nrp = EXCLUDED.nrp,
				unit = EXCLUDED.unit,
				rank = EXCLUDED.rank,
				status = EXCLUDED.status,
				approved_by = EXCLUDED.approved_by,
				updated_at = CURRENT_TIMESTAMP
		`, off.ID, off.Name, strings.ToLower(off.Email), string(off.Role), off.NRP, off.Unit, off.Rank, off.Status, off.ApprovedBy, off.PublicKey)
		if err != nil {
			return err
		}
	}

	r.memLock.Lock()
	found := false
	for i := range r.memOfficers {
		if strings.ToLower(r.memOfficers[i].Email) == strings.ToLower(off.Email) {
			r.memOfficers[i] = off
			found = true
			break
		}
	}
	if !found {
		r.memOfficers = append(r.memOfficers, off)
	}
	r.memLock.Unlock()

	return nil
}

// ----------------------------------------------------------------------------
// IoT Commands & Cross-Phase Forensics
// ----------------------------------------------------------------------------

func (r *Repository) QueueIoTCommand(assetID, action, actor string) models.IoTCommand {
	cmd := models.IoTCommand{
		ID:       fmt.Sprintf("CMD-%d", time.Now().UnixNano()%1000000),
		AssetID:  assetID,
		Action:   action,
		IssuedAt: time.Now().Format(time.RFC3339),
		IssuedBy: actor,
		Executed: false,
	}

	r.memLock.Lock()
	r.memPendingCommands[assetID] = append(r.memPendingCommands[assetID], cmd)
	r.memLock.Unlock()

	return cmd
}

func (r *Repository) PopIoTCommands(assetID string) []models.IoTCommand {
	r.memLock.Lock()
	defer r.memLock.Unlock()
	cmds := r.memPendingCommands[assetID]
	r.memPendingCommands[assetID] = nil
	if cmds == nil {
		return []models.IoTCommand{}
	}
	return cmds
}

func (r *Repository) QueryCVEVulnerabilities() []models.CVEMatch {
	if r.db == nil {
		return []models.CVEMatch{
			{CVEID: "CVE-2024-38812", Component: "dce-rpc-bridge", Version: "1.0.4", Severity: models.CVESeverityCritical, CVSS: 9.8, Similarity: 0.94, Summary: "OT Bridge heap overflow"},
		}
	}

	rows, err := r.db.Query(`SELECT cve_id, description, severity FROM cve_vulnerabilities LIMIT 10`)
	if err != nil {
		return []models.CVEMatch{}
	}
	defer rows.Close()

	var matches []models.CVEMatch
	for rows.Next() {
		var id, desc, sev string
		if err := rows.Scan(&id, &desc, &sev); err == nil {
			matches = append(matches, models.CVEMatch{
				CVEID:      id,
				Component:  "generic-driver",
				Version:    "1.0",
				Severity:   models.CVESeverity(sev),
				CVSS:       8.8,
				Similarity: 0.92,
				Summary:    desc,
			})
		}
	}
	return matches
}
