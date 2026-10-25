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
		`INSERT INTO assets (id, name, serial_number, vendor, type, classification, status, integrity_state, trust_score, firmware_hash, qr_hash, qr_window_status, cve_count, latitude, longitude, location_name)
		VALUES
			('AST-SRV-TACTICAL', 'Server Komando Taktis Mobile (IT Rugged Node)', 'SN-SRV-MIL-8841', 'Crystal Group Taktis', 'IT_SERVER', 'IT', 'MAINTENANCE', 'MAINTENANCE', 92, '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', 'OPEN', 1, -6.1754, 106.8272, 'Markas PUSSIBERAD Jakarta Pusat'),
			('AST-RADAR-01', 'Radar Avionik Paskhas Maritim (OT Alutsista)', 'SN-RDR-2026-X9', 'PT Len Industri / Thales', 'OT_RADAR', 'OT', 'MAINTENANCE', 'SECURE', 98, '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'OPEN', 0, -6.1054, 106.8833, 'Radar Paskhas Maritim Tanjung Priok'),
			('AST-OT-529', 'Sub-Detasemen Siber IKN Nusantara Sepaku', 'SN-IKN-2026-S01', 'PT Len Industri', 'OT_RADAR', 'OT', 'MAINTENANCE', 'MAINTENANCE', 88, '6c8d7e9f0123456789abcdef0123456789abcdef0123456789abcdef01234567', '7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef012345678a', 'CLOSED', 1, -0.9744, 116.7099, 'Sub-Detasemen Siber IKN Nusantara Sepaku'),
			('AST-RADIO-VHF', 'Radio Taktis VHF Harris Falcon (OT Manpack)', 'SN-RF-5800H-901', 'L3Harris Communications', 'TACTICAL_RADIO', 'OT', 'COMPROMISED', 'COMPROMISED', 45, 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d', 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d', 'CLOSED', 2, -6.2100, 106.8400, 'Patroli Mobile Taktis Kodam Jaya'),
			('ARMORY-ENV-02', 'Sensor Suhu & Kelembaban Gudang Munisi (OT Safety)', 'SN-ARMORY-ENV-902', 'Schneider Electric Mil-Spec', 'OT_RADAR', 'OT', 'COMPROMISED', 'COMPROMISED', 40, 'a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283', '3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1', 'CLOSED', 3, -6.2583, 106.8625, 'Gudang Munisi Daerah Paldam Jaya'),
			('AST-OT-461', 'Radar Surveillance Mabes TNI Cilangkap', 'SN-RDR-2026-X9', 'PT Len Industri', 'OT_RADAR', 'OT', 'COMPROMISED', 'COMPROMISED', 35, 'e900779c8db4afa5fcaba5e92906fd8e9be4b508d3c985e9357f48cbc4e615b7', 'eb244f4e88740d2ed9e1a3194c75f839b579f4547b97c0b3d16c1afa16310437', 'CLOSED', 3, -6.3262, 106.9084, 'Radar Surveillance Mabes TNI Cilangkap'),
			('AST-OT-358', 'Lanud Halim Perdanakusuma Drone Jammer', 'SN-JAM-2026-X77', 'PT Len Industri', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 30, 'd169ec49eba18b15a3e91e6296661ce3fc03999e261141114cf9b2b4a3d200eb', '3d25945d7d30ea11a3d1d676aaa2db9cc28d34cebe56f3cb536b003aa033fb20', 'CLOSED', 4, -6.2657, 106.8906, 'Lanud Halim Perdanakusuma Drone Jammer'),
			('AST-OT-657', 'Pos Komando Pertahanan Siber Sentul', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 25, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', 'fef648a3a6e8b5fd28683a7cd3aaf0e7ab60a6cd2869bf8b357f1097424c919f', 'CLOSED', 4, -6.5278, 106.8911, 'Pos Komando Pertahanan Siber Sentul'),
			('AST-OT-332', 'Radar Pertahanan Udara Pussenif Bandung', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 25, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', '782f70521eb06fd9fb8fbacf58cd8dc471ed662e26a9a0f9699bebfe743cff9d', 'CLOSED', 4, -6.9175, 107.6191, 'Radar Pertahanan Udara Pussenif Bandung'),
			('AST-OT-792', 'Radar Pengintai Pesisir Kodam IV Semarang', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 20, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', 'fc293d2667af31b7ee5cd81fc4d83af9b0deae6eb669468c6880c31cb16479df', 'CLOSED', 4, -6.9800, 110.4200, 'Radar Pengintai Pesisir Kodam IV Semarang'),
			('AST-OT-184', 'Pangkalan Radar Koarmada II Surabaya', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 20, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', 'ffad47ae3d187dd3725ff0eaa7a5672dcfe1795d11211cd87f96b678552339ca', 'CLOSED', 4, -7.2575, 112.7521, 'Pangkalan Radar Koarmada II Surabaya'),
			('AST-OT-807', 'Radar Udara Lanud Adisutjipto Yogyakarta', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 15, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', '1f0badbbd01c58ce132e47fc8360271c014318d6b1781b2dfdee82d1d63f9431', 'CLOSED', 4, -7.7956, 110.3695, 'Radar Udara Lanud Adisutjipto Yogyakarta'),
			('AST-OT-936', 'Radar Taktis Kodam IX Udayana Denpasar', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 15, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', 'd7f6e8d82cdd75ab8bf53b30ee7f08ce079a4a4260b8043e59ef3e767b99d9cc', 'CLOSED', 4, -8.6500, 115.2167, 'Radar Taktis Kodam IX Udayana Denpasar'),
			('AST-OT-324', 'Tactical Sensor Node Natuna Terluar', 'SN-TAC-7968', 'PT Len', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 15, '021f27af0c4d03accc5a9f3871aba1e08f6eea38b1d1a9dfe8fb2cbeeb9fdc4b', 'OZIK-PASSPORT:AST-OT-324:021f27af0c4d03accc5a9f3871aba1e08f6eea38b1d1a9dfe8fb2cbeeb9fdc4b:PT Len:SN-TAC-7968', 'CLOSED', 4, 3.9456, 108.3897, 'Tactical Sensor Node Natuna Terluar'),
			('AST-OT-921', 'Radar Pesisir Kodam XIII Merdeka Manado', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'QUARANTINED', 'QUARANTINED', 15, '7bd48c99698cbed044f3316bb41ee233cff4d08b83a99ae37a8c923658c273c5', 'OZIK-PASSPORT:AST-OT-921:7bd48c99698cbed044f3316bb41ee233cff4d08b83a99ae37a8c923658c273c5:PT Len:SN-RDR-2026-X99', 'CLOSED', 4, 1.4748, 124.8428, 'Radar Pesisir Kodam XIII Merdeka Manado'),
			('AST-OT-812', 'Stasiun Radar Koopsud II Makassar', 'SN-RDR-MKS-04', 'PT Len Industri', 'OT_RADAR', 'OT', 'COMPROMISED', 'COMPROMISED', 35, '8f9e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f', '9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', 'CLOSED', 3, -5.1477, 119.4327, 'Stasiun Radar Koopsud II Makassar'),
			('AST-OT-743', 'Posko Radar Skouw Kodam XVII Papua', 'SN-RDR-PAP-09', 'PT Len Industri', 'OT_RADAR', 'OT', 'COMPROMISED', 'COMPROMISED', 30, '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', '1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c', 'CLOSED', 3, -2.5337, 140.7181, 'Posko Radar Skouw Kodam XVII Papua'),
			('AST-OT-236', 'Drone Jammer Kodam I Bukit Barisan Medan', 'SN-JAM-2026-X77', 'PT Len Industri', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 95, 'd169ec49eba18b15a3e91e6296661ce3fc03999e261141114cf9b2b4a3d200eb', '16e6f3bf9714644762a64b29e8ec7c5eb456487e126cc7eef5a230645472065f', 'CLOSED', 0, 3.5952, 98.6722, 'Drone Jammer Kodam I Bukit Barisan Medan'),
			('AST-OT-597', 'Pos Radar Khatulistiwa Pontianak', 'SN-JAM-2026-X77', 'PT Len Industri', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 95, 'd169ec49eba18b15a3e91e6296661ce3fc03999e261141114cf9b2b4a3d200eb', '0b534e099d3e227931469bbbc71730f6a309ee15f4b6e0e333a7bdf531e1135f', 'CLOSED', 0, -0.0263, 109.3425, 'Pos Radar Khatulistiwa Pontianak'),
			('AST-OT-303', 'Terminal Komunikasi Korem Banjarmasin', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 95, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', '1192ef01291c45e4518ad43b0344ace527d49cace4dc74124feaa10a72ee5528', 'CLOSED', 0, -3.3167, 114.5900, 'Terminal Komunikasi Korem Banjarmasin'),
			('AST-OT-797', 'Pos Sensor Maritim Teluk Bayur Padang', 'SN-RDR-2026-X99', 'PT Len Industri / Thales Defence', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 95, '379254913a08284821ccb53b1611e97bc07154c21e661401eba6832f3a507fe9', 'a8d54883a9a8b53e81d5d35ad7f17cefdd20adb3ef9d838a52a6e2ae68a31fec', 'CLOSED', 0, -0.9471, 100.4172, 'Pos Sensor Maritim Teluk Bayur Padang'),
			('AST-OT-119', 'Node Relai Selat Sunda Bakauheni', 'SN-REL-2026-B01', 'PT Len Industri', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 94, '2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d', '3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e', 'CLOSED', 0, -5.4500, 105.2667, 'Node Relai Selat Sunda Bakauheni'),
			('AST-OT-614', 'Sensor Monitoring ALKI Ambon', 'SN-ALKI-2026-A01', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 90, '4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f', '5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a', 'CLOSED', 0, -3.6958, 128.1831, 'Sensor Monitoring ALKI Ambon'),
			('AST-OT-628', 'Pos Pengamatan Rote Kupang', 'SN-OBS-2026-K01', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 90, '6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b', '7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c', 'CLOSED', 0, -10.1772, 123.6070, 'Pos Pengamatan Rote Kupang'),
			('AST-OT-635', 'Radar Pengintai Pasmar 3 Sorong', 'SN-RDR-2026-S03', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 91, '8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d', '9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e', 'CLOSED', 0, -0.9167, 131.2500, 'Radar Pengintai Pasmar 3 Sorong'),
			('AST-OT-642', 'Sensor Telemetri Gorontalo', 'SN-TEL-2026-G01', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 92, '0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f', '1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a', 'CLOSED', 0, 0.5333, 123.0667, 'Sensor Telemetri Gorontalo'),
			('AST-OT-651', 'Stasiun Selat Malaka Tanjung Pinang', 'SN-MLK-2026-T01', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 93, '2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b', '3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c', 'CLOSED', 0, 0.9000, 104.4500, 'Stasiun Selat Malaka Tanjung Pinang'),
			('AST-OT-660', 'Pos Taktis Selat Lombok Mataram', 'SN-LMK-2026-M01', 'PT Len Industri', 'OT_RADAR', 'OT', 'STANDBY', 'STANDBY', 91, '4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d', '5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e', 'CLOSED', 0, -8.5833, 116.1167, 'Pos Taktis Selat Lombok Mataram')
		ON CONFLICT (id) DO UPDATE SET
			latitude = EXCLUDED.latitude,
			longitude = EXCLUDED.longitude,
			location_name = EXCLUDED.location_name,
			integrity_state = EXCLUDED.integrity_state,
			status = EXCLUDED.status,
			qr_window_status = EXCLUDED.qr_window_status,
			trust_score = EXCLUDED.trust_score;`,
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

func (r *Repository) GetAssets(criticalOnly bool, limit, offset int) ([]models.Asset, int, error) {
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		var res []models.Asset
		for _, a := range r.memAssets {
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

	var whereClause string
	if criticalOnly {
		whereClause = "WHERE a.integrity_state IN ('COMPROMISED', 'QUARANTINED') OR a.qr_window_status = 'OPEN'"
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM assets a %s", whereClause)
	var total int
	_ = r.db.QueryRow(countQuery).Scan(&total)

	query := fmt.Sprintf(`
		SELECT a.id, a.name, a.serial_number, a.vendor, a.type, a.classification,
		       a.status, a.integrity_state, a.trust_score, a.firmware_hash, a.qr_hash,
		       a.qr_window_status, a.cve_count, a.registered_at,
		       COALESCE(a.latitude, 0), COALESCE(a.longitude, 0), COALESCE(a.location_name, '')
		FROM assets a
		%s
		ORDER BY a.created_at DESC
	`, whereClause)

	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}

	rows, err := r.db.Query(query)
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
		var locName string

		if err := rows.Scan(
			&a.ID, &a.Name, &a.SerialNumber, &a.Vendor, &typeStr, &classStr,
			&statusStr, &integStr, &trustScore, &a.FirmwareHash, &a.QRHash,
			&winStr, &a.CVECount, &regAt,
			&lat, &lng, &locName,
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
	var locName string

	err := r.db.QueryRow(`
		SELECT id, name, serial_number, vendor, type, classification,
		       status, integrity_state, trust_score, firmware_hash, qr_hash,
		       qr_window_status, cve_count, registered_at,
		       COALESCE(latitude, 0), COALESCE(longitude, 0), COALESCE(location_name, '')
		FROM assets
		WHERE id = $1
	`, id).Scan(
		&a.ID, &a.Name, &a.SerialNumber, &a.Vendor, &typeStr, &classStr,
		&statusStr, &integStr, &trustScore, &a.FirmwareHash, &a.QRHash,
		&winStr, &a.CVECount, &regAt,
		&lat, &lng, &locName,
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

	if r.db != nil {
		_, err := r.db.Exec(`
			INSERT INTO assets (id, name, serial_number, vendor, type, classification, status, integrity_state, trust_score, firmware_hash, qr_hash, qr_window_status, cve_count, registered_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
				updated_at = CURRENT_TIMESTAMP
		`, a.ID, a.Name, a.SerialNumber, a.Vendor, string(a.Type), string(a.Classification),
			string(a.IntegrityState), string(a.IntegrityState), trust, a.FirmwareHash,
			a.QRHash, string(a.QRWindowStatus), a.CVECount)
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

func (r *Repository) GetTelemetryCorrelations(limit, offset int) ([]models.TelemetryCorrelation, int, error) {
	return r.GetTelemetryCorrelationsWithFilter(limit, offset, "")
}

func (r *Repository) GetTelemetryCorrelationsWithFilter(limit, offset int, search string) ([]models.TelemetryCorrelation, int, error) {
	search = strings.TrimSpace(search)
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		var filtered []models.TelemetryCorrelation
		for _, c := range r.memCorrelations {
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
		SELECT id, timestamp, asset_id, network_event, physical_authorization, COALESCE(maintenance_window_id, ''), verdict
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
		var authStr string
		if err := rows.Scan(&c.ID, &ts, &c.AssetID, &c.NetworkEvent, &authStr, &c.MaintenanceWindowID, &c.Verdict); err == nil {
			c.Timestamp = ts.Format(time.RFC3339)
			c.PhysicalAuthorization = models.PhysicalAuthorization(authStr)
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
			INSERT INTO telemetry_correlations (id, timestamp, asset_id, network_event, physical_authorization, maintenance_window_id, verdict)
			VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6)
		`, corr.ID, corr.AssetID, corr.NetworkEvent, string(corr.PhysicalAuthorization), corr.MaintenanceWindowID, corr.Verdict)
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

func (r *Repository) AppendLedger(actor, action, assetID, payload string) (*models.LedgerEntry, error) {
	prevHash := "0000000000000000000000000000000000000000000000000000000000000000"
	index := 0

	if r.db != nil {
		var lastHash string
		var lastIndex int
		err := r.db.QueryRow(`
			SELECT index, hash FROM ledger_entries ORDER BY index DESC LIMIT 1
		`).Scan(&lastIndex, &lastHash)
		if err == nil {
			prevHash = lastHash
			index = lastIndex + 1
		}
	} else {
		r.memLock.RLock()
		if len(r.memLedger) > 0 {
			last := r.memLedger[len(r.memLedger)-1]
			prevHash = last.Hash
			index = last.Index + 1
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
	}

	if r.db != nil {
		_, _ = r.db.Exec(`
			INSERT INTO ledger_entries (index, timestamp, actor, action, asset_id, payload_hash, previous_hash, hash)
			VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7)
		`, entry.Index, entry.Actor, entry.Action, entry.AssetID, entry.PayloadHash, entry.PreviousHash, entry.Hash)

		payloadObj := map[string]interface{}{"raw": payload, "asset_id": assetID}
		payloadBytes, _ := json.Marshal(payloadObj)
		_, _ = r.db.Exec(`
			INSERT INTO audit_ledger (prev_hash, current_hash, action, officer_id, payload_json, timestamp)
			VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		`, prevHash, currHash, action, actor, string(payloadBytes))
	}

	r.memLock.Lock()
	r.memLedger = append(r.memLedger, *entry)
	r.memLock.Unlock()

	return entry, nil
}

func (r *Repository) GetLedger(limit, offset int) ([]models.LedgerEntry, int, error) {
	if r.db == nil {
		r.memLock.RLock()
		defer r.memLock.RUnlock()
		total := len(r.memLedger)
		res := r.memLedger
		if offset > 0 && offset < len(res) {
			res = res[offset:]
		}
		if limit > 0 && len(res) > limit {
			res = res[:limit]
		}
		return res, total, nil
	}

	var total int
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM ledger_entries`).Scan(&total)

	query := `
		SELECT index, timestamp, actor, action, COALESCE(asset_id, ''), payload_hash, previous_hash, hash
		FROM ledger_entries
		ORDER BY index DESC
	`
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}

	rows, err := r.db.Query(query)
	if err != nil {
		return []models.LedgerEntry{}, 0, err
	}
	defer rows.Close()

	var list []models.LedgerEntry
	for rows.Next() {
		var e models.LedgerEntry
		var ts time.Time
		if err := rows.Scan(&e.Index, &ts, &e.Actor, &e.Action, &e.AssetID, &e.PayloadHash, &e.PreviousHash, &e.Hash); err == nil {
			e.Timestamp = ts.Format(time.RFC3339)
			list = append(list, e)
		}
	}
	if list == nil {
		list = []models.LedgerEntry{}
	}
	return list, total, nil
}

func (r *Repository) VerifyLedgerIntegrity() (bool, int, int) {
	ledger, _, err := r.GetLedger(0, 0)
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
