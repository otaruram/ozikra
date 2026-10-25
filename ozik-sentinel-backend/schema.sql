-- =============================================================================
-- OZIK-SENTINEL :: PostgreSQL & Supabase Database Migration Schema
-- Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra 2026
-- Compatible with PostgreSQL 14+, 17+, Supabase, and pgvector
-- =============================================================================

-- 0. Enable pgvector & UUID Extensions (Supabase Cloud & Supported PostgreSQL)
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- 1. Master IT/OT Asset Inventory Table
CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(128) NOT NULL,
    vendor VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'OT', -- IT, OT, IoT
    type VARCHAR(64) NOT NULL DEFAULT 'OT_RADAR', -- IT_SERVER, OT_RADAR, TACTICAL_RADIO
    classification VARCHAR(16) NOT NULL DEFAULT 'OT', -- IT, OT
    status VARCHAR(32) NOT NULL DEFAULT 'SECURE', -- SECURE, QUARANTINED, ISOLATED, MAINTENANCE, COMPROMISED
    integrity_state VARCHAR(32) NOT NULL DEFAULT 'SECURE', -- SECURE, MAINTENANCE, COMPROMISED, QUARANTINED
    trust_score INT DEFAULT 90,
    firmware_hash TEXT NOT NULL,
    qr_hash TEXT NOT NULL DEFAULT '',
    qr_window_status VARCHAR(32) NOT NULL DEFAULT 'CLOSED', -- CLOSED, OPEN, EXPIRED
    cve_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ensure all columns exist if table was previously created
ALTER TABLE assets ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'OT';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'SECURE';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 2. Cryptographic Hash-Chained Audit Ledger Table
CREATE TABLE IF NOT EXISTS audit_ledger (
    id SERIAL PRIMARY KEY,
    prev_hash TEXT NOT NULL,
    current_hash TEXT NOT NULL UNIQUE,
    action VARCHAR(128) NOT NULL,
    officer_id VARCHAR(128) NOT NULL,
    payload_json JSONB,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Legacy Ledger Compatibility Table
CREATE TABLE IF NOT EXISTS ledger_entries (
    index INT PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actor VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    asset_id VARCHAR(64),
    payload_hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE
);

-- 3. Telemetry Logs Table
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
    temperature_c NUMERIC(5,2),
    voltage_v NUMERIC(5,2),
    firmware_hash TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'NOMINAL',
    network_tx_kbps NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS network_tx_kbps NUMERIC(10,2) DEFAULT 0;

-- Complementary Telemetry Events & Correlations (Lightweight SIEM)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
    source VARCHAR(32) NOT NULL, -- NETWORK, FIRMWARE, PHYSICAL_QR, SYSTEM
    severity VARCHAR(32) NOT NULL, -- INFO, NOTICE, WARNING, CRITICAL
    message TEXT NOT NULL,
    actor VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS telemetry_correlations (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
    network_event TEXT NOT NULL,
    physical_authorization VARCHAR(32) NOT NULL, -- AUTHORIZED, UNAUTHORIZED, PENDING
    maintenance_window_id VARCHAR(64),
    verdict VARCHAR(32) NOT NULL DEFAULT 'NOMINAL' -- NOMINAL, ANOMALY
);

-- 4. CVE Vulnerabilities with pgvector Semantic Search (vector 1536)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
        CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
            id VARCHAR(64) PRIMARY KEY,
            cve_id VARCHAR(64) UNIQUE NOT NULL,
            description TEXT NOT NULL,
            severity VARCHAR(32) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
            embedding vector(1536),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ELSE
        CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
            id VARCHAR(64) PRIMARY KEY,
            cve_id VARCHAR(64) UNIQUE NOT NULL,
            description TEXT NOT NULL,
            severity VARCHAR(32) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
            embedding FLOAT4[],
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    END IF;
END $$;

-- 5. Officer Profiles & Tactical RBAC (officer_profiles & users_or_officers)
CREATE TABLE IF NOT EXISTS officer_profiles (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'COMMANDER', -- SUPER_ADMIN, COMMANDER, LOGISTICS_OFFICER, FORENSIC_AUDITOR, OT_TECHNICIAN
    nrp VARCHAR(64) NOT NULL,
    unit VARCHAR(128),
    rank VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- APPROVED, PENDING, REJECTED
    approved_by VARCHAR(128),
    public_key TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users_or_officers (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'COMMANDER',
    unit_id VARCHAR(128) DEFAULT 'PUSSANSERAD',
    nrp VARCHAR(64),
    rank VARCHAR(64),
    status VARCHAR(32) DEFAULT 'APPROVED',
    public_key TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE officer_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'PENDING';
ALTER TABLE officer_profiles ADD COLUMN IF NOT EXISTS approved_by VARCHAR(128);
ALTER TABLE officer_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 6. Active Maintenance Windows
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE CASCADE,
    officer_id VARCHAR(128) NOT NULL,
    technician_id VARCHAR(128),
    opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE maintenance_windows ADD COLUMN IF NOT EXISTS officer_id VARCHAR(128) DEFAULT 'Sgt. Pratama';
ALTER TABLE maintenance_windows ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 7. High-Speed Indexing
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_integrity ON assets(integrity_state);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_asset ON telemetry_logs(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_hash ON audit_ledger(current_hash);
CREATE INDEX IF NOT EXISTS idx_cve_vuln_cveid ON cve_vulnerabilities(cve_id);

-- 8. Pre-Seed Military Assets (Idempotent)
INSERT INTO assets (id, name, serial_number, vendor, category, type, classification, status, integrity_state, trust_score, firmware_hash, qr_hash)
VALUES
    ('AST-RADAR-01', 'Radar Avionik Paskhas Unit-A (OT Alutsista)', 'SN-RDR-2026-X9', 'PT Len Industri / Thales', 'OT', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 98, '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
    ('AST-SRV-TACTICAL', 'Server Komando Taktis Mobile (IT Rugged Node)', 'SN-SRV-MIL-8841', 'Crystal Group Taktis', 'IT', 'IT_SERVER', 'IT', 'MAINTENANCE', 'MAINTENANCE', 92, '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'),
    ('AST-RADIO-VHF', 'Radio Taktis VHF Harris Falcon (OT Manpack)', 'SN-RF-5800H-901', 'L3Harris Communications', 'OT', 'TACTICAL_RADIO', 'OT', 'COMPROMISED', 'COMPROMISED', 45, 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d', 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d'),
    ('ARMORY-ENV-02', 'Sensor Suhu & Kelembaban Gudang Amunisi (OT Safety)', 'SN-ARMORY-ENV-902', 'Schneider Electric Mil-Spec', 'OT', 'OT_RADAR', 'OT', 'SECURE', 'SECURE', 99, 'a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283', '3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    vendor = EXCLUDED.vendor,
    category = EXCLUDED.category,
    status = EXCLUDED.status,
    trust_score = EXCLUDED.trust_score,
    firmware_hash = EXCLUDED.firmware_hash;

-- 9. Pre-Seed Offline CVE Vulnerabilities
INSERT INTO cve_vulnerabilities (id, cve_id, description, severity)
VALUES
    ('cve-01', 'CVE-2024-38812', 'OT Bridge DCE/RPC protocol heap overflow remote code execution in tactical bridge', 'CRITICAL'),
    ('cve-02', 'CVE-2023-4863', 'Hardware Decoder libwebp buffer overflow allowing code execution during manifest rendering', 'HIGH'),
    ('cve-03', 'CVE-2024-21413', 'OT Signal Transceiver Firmware telemetry banner leak on high-frequency port', 'LOW'),
    ('cve-04', 'CVE-2023-34362', 'SQL Injection in tactical gateway telemetry pipe allowing unauthorized data extraction', 'CRITICAL')
ON CONFLICT (cve_id) DO NOTHING;

-- 10. Supabase & Prisma Row Level Security (RLS) Configuration
-- Disables RLS so incoming queries from Prisma, Go Backend, and Supabase client are never silently blocked.
ALTER TABLE IF EXISTS assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cve_vulnerabilities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ledger_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS maintenance_windows DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS officer_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telemetry_correlations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telemetry_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telemetry_logs DISABLE ROW LEVEL SECURITY;

-- Grant privileges for Supabase service_role, authenticated, and anon
DO $$
BEGIN
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role, authenticated, anon';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, authenticated, anon';
    EXECUTE 'GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role, authenticated, anon';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

