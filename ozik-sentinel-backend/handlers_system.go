package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// System Configuration & Admin Handlers
// ============================================================================

func handleGetSystemConfig(c *gin.Context) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	activeWindows := 0
	for _, a := range store.Assets {
		if a.QRWindowStatus == WindowOpen {
			activeWindows++
		}
	}

	uptime := int64(time.Since(store.startTime).Seconds())
	cfg := store.SystemConfig
	cfg.ActiveMaintenanceWindows = activeWindows
	cfg.UptimeSeconds = uptime

	c.JSON(http.StatusOK, cfg)
}

func handlePatchSystemConfig(c *gin.Context) {
	var body struct {
		AuthMode         *AuthMode `json:"auth_mode"`
		AIMode           *AIMode   `json:"ai_mode"`
		AirGapped        *bool     `json:"air_gapped"`
		LocalEndpointURL *string   `json:"local_endpoint_url"`
		ModelName        *string   `json:"model_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	if body.AuthMode != nil {
		store.SystemConfig.AuthMode = *body.AuthMode
		store.SystemConfig.AirGapped = *body.AuthMode == AuthModeLocalAirgap
	}
	if body.AIMode != nil {
		store.SystemConfig.AIMode = *body.AIMode
	}
	if body.AirGapped != nil {
		store.SystemConfig.AirGapped = *body.AirGapped
		if *body.AirGapped {
			store.SystemConfig.AuthMode = AuthModeLocalAirgap
			store.SystemConfig.AIMode = AIModeOllamaLocal
		} else {
			store.SystemConfig.AuthMode = AuthModeGoogleSandbox
			store.SystemConfig.AIMode = AIModeGeminiCloud
		}
	}
	if body.LocalEndpointURL != nil {
		store.SystemConfig.LocalEndpointURL = *body.LocalEndpointURL
	}
	if body.ModelName != nil {
		store.SystemConfig.ModelName = *body.ModelName
	}
	cfg := store.SystemConfig
	store.mu.Unlock()

	actor := "SUPER_ADMIN"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	appendLedger(actor, "UPDATE_SYSTEM_CONFIG", "CORE_ENGINE", fmt.Sprintf("Auth:%s:AI:%s:Airgap:%v", cfg.AuthMode, cfg.AIMode, cfg.AirGapped))

	// Broadcast update to live frontend
	broadcastSSE("SYSTEM_CONFIG_UPDATED", cfg)

	c.JSON(http.StatusOK, gin.H{
		"message": "System configuration updated successfully",
		"config":  cfg,
	})
}

// handleUpdateEngineConfig handles PUT /admin/engine from Frontend Settings / Admin page
func handleUpdateEngineConfig(c *gin.Context) {
	var body EngineConfig
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	if body.Mode == "ON_PREMISE" {
		store.SystemConfig.AuthMode = AuthModeLocalAirgap
		store.SystemConfig.AIMode = AIModeOllamaLocal
		store.SystemConfig.AirGapped = true
	} else {
		store.SystemConfig.AuthMode = AuthModeGoogleSandbox
		store.SystemConfig.AIMode = AIModeGeminiCloud
		store.SystemConfig.AirGapped = false
	}

	if body.LocalEndpointURL != "" {
		store.SystemConfig.LocalEndpointURL = body.LocalEndpointURL
	}
	if body.ModelName != "" {
		store.SystemConfig.ModelName = body.ModelName
	}
	store.mu.Unlock()

	actor := "SUPER_ADMIN"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	appendLedger(actor, "UPDATE_ENGINE_CONFIG", "AI_ORCHESTRATOR", fmt.Sprintf("Mode:%s:Model:%s", body.Mode, body.ModelName))

	broadcastSSE("ENGINE_CONFIG_UPDATED", body)

	c.JSON(http.StatusOK, body)
}

func handleMetrics(c *gin.Context) {
	assets, _ := getAssetsWithTelemetryDB(false)

	total := len(assets)
	quarantined := 0
	activeMaint := 0
	anomalies := 0

	for _, a := range assets {
		if a.IntegrityState == StateQuarantined || a.IntegrityState == "QUARANTINED" {
			quarantined++
		}
		if a.QRWindowStatus == WindowOpen || a.QRWindowStatus == "OPEN" {
			activeMaint++
		}
		if a.IntegrityState == StateCompromised || a.IntegrityState == "COMPROMISED" {
			anomalies++
		}
	}

	c.JSON(http.StatusOK, DashboardMetrics{
		RegisteredAssets:         total,
		QuarantinedAssets:        quarantined,
		ActiveMaintenanceWindows: activeMaint,
		UnverifiedAnomalies:      anomalies,
	})
}

func handleGetAssets(c *gin.Context) {
	critOnly := c.Query("critical") == "true"
	assets, err := getAssetsWithTelemetryDB(critOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assets from tactical registry"})
		return
	}
	c.JSON(http.StatusOK, assets)
}

func handleGetUsers(c *gin.Context) {
	officers := getAllUsersAndOfficersDB()
	c.JSON(http.StatusOK, officers)
}

func handleUpdateUserRole(c *gin.Context) {
	userID := c.Param("id")
	var body struct {
		Role TacticalRole `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update in PostgreSQL
	if dbConn != nil {
		_, _ = dbConn.Exec(`
			UPDATE officer_profiles
			SET role = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 OR email = $2
		`, string(body.Role), userID)

		_, _ = dbConn.Exec(`
			UPDATE users_or_officers
			SET role = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 OR email = $2
		`, string(body.Role), userID)
	}

	store.mu.Lock()
	var updated *OfficerProfile
	for i := range store.Officers {
		if store.Officers[i].ID == userID || store.Officers[i].Email == userID {
			store.Officers[i].Role = body.Role
			updated = &store.Officers[i]
			break
		}
	}
	store.mu.Unlock()

	if updated == nil {
		c.JSON(http.StatusOK, gin.H{
			"id":      userID,
			"role":    body.Role,
			"status":  "ROLE_UPDATED_IN_DATABASE",
			"message": fmt.Sprintf("Role updated to %s in Supabase/PostgreSQL", body.Role),
		})
		appendLedger("SUPER_ADMIN", "UPDATE_OFFICER_ROLE", userID, string(body.Role))
		return
	}

	appendLedger("SUPER_ADMIN", "UPDATE_OFFICER_ROLE", userID, string(body.Role))
	c.JSON(http.StatusOK, updated)
}

// handleGetProfile handles GET /auth/profile & GET /api/v1/auth/profile
func handleGetProfile(c *gin.Context) {
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if email == "" {
		if val, exists := c.Get("email"); exists {
			email = fmt.Sprintf("%v", val)
		}
	}
	if email == "" {
		email = "okitr52@gmail.com"
	}

	off, err := findOfficerByEmailDB(email)
	if err == nil && off != nil {
		c.JSON(http.StatusOK, off)
		return
	}

	store.mu.RLock()
	for _, o := range store.Officers {
		if strings.EqualFold(o.Email, email) {
			store.mu.RUnlock()
			c.JSON(http.StatusOK, o)
			return
		}
	}
	store.mu.RUnlock()

	c.JSON(http.StatusNotFound, gin.H{"error": "Officer profile not found"})
}

// handleUpdateProfile handles PUT /auth/profile & PUT /api/v1/auth/profile
func handleUpdateProfile(c *gin.Context) {
	var body struct {
		Name      string       `json:"name"`
		Email     string       `json:"email"`
		Role      TacticalRole `json:"role"`
		NRP       string       `json:"nrp"`
		Unit      string       `json:"unit"`
		Rank      string       `json:"rank"`
		PublicKey string       `json:"publicKey"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email is required"})
		return
	}

	profile := OfficerProfile{
		ID:        fmt.Sprintf("usr-%d", time.Now().Unix()%100000),
		Name:      body.Name,
		Email:     email,
		Role:      body.Role,
		NRP:       body.NRP,
		Unit:      body.Unit,
		Rank:      body.Rank,
		Status:    "APPROVED",
		PublicKey: body.PublicKey,
	}
	if profile.Role == "" {
		profile.Role = RoleCommander
	}

	syncOfficerToDB(profile)

	store.mu.Lock()
	found := false
	for i := range store.Officers {
		if strings.EqualFold(store.Officers[i].Email, email) {
			store.Officers[i].Name = body.Name
			store.Officers[i].NRP = body.NRP
			store.Officers[i].Unit = body.Unit
			store.Officers[i].Rank = body.Rank
			if body.Role != "" {
				store.Officers[i].Role = body.Role
			}
			if body.PublicKey != "" {
				store.Officers[i].PublicKey = body.PublicKey
			}
			found = true
			profile = store.Officers[i]
			break
		}
	}
	if !found {
		store.Officers = append(store.Officers, profile)
	}
	store.mu.Unlock()
	go saveStoreToDisk()

	appendLedger(profile.Name, "UPDATE_OFFICER_PROFILE", profile.Email, fmt.Sprintf("NRP:%s:Unit:%s:Role:%s", profile.NRP, profile.Unit, profile.Role))

	c.JSON(http.StatusOK, gin.H{
		"message": "Officer profile updated successfully in Supabase / PostgreSQL",
		"profile": profile,
	})
}

func handleHealth(c *gin.Context) {
	store.mu.RLock()
	engine := GetCurrentAIEngine()
	cfg := store.SystemConfig
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"status":         "ONLINE",
		"system":         "OZIK-SENTINEL Lightweight SIEM & IoT Gateway",
		"auth_mode":      cfg.AuthMode,
		"ai_mode":        cfg.AIMode,
		"air_gapped":     cfg.AirGapped,
		"active_ai":      engine.Name(),
		"uptime_seconds": int64(time.Since(store.startTime).Seconds()),
		"timestamp":      time.Now().UTC(),
	})
}

func handleRootGateway(c *gin.Context) {
	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") {
		c.Header("Content-Type", "text/html; charset=utf-8")
		html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OZIK-SENTINEL :: Backend API Gateway</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #121214;
      border: 1px solid #27272a;
      max-width: 680px;
      width: 100%%;
      padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 4px 10px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.4);
      color: #4ade80;
      margin-bottom: 16px;
    }
    .dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%%; }
    h1 { font-size: 22px; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 8px; }
    p.sub { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin-bottom: 24px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%%;
      background: #ffffff;
      color: #000000;
      font-weight: 700;
      font-size: 14px;
      padding: 14px 20px;
      text-decoration: none;
      transition: all 0.15s ease;
      letter-spacing: 0.05em;
      margin-bottom: 24px;
      border-radius: 2px;
    }
    .btn:hover { background: #e4e4e7; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat { background: #18181b; border: 1px solid #27272a; padding: 12px; }
    .stat-label { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em; }
    .stat-val { font-size: 13px; font-weight: 600; margin-top: 4px; font-family: monospace; }
    .endpoints { border-top: 1px solid #27272a; padding-top: 20px; font-size: 12px; }
    .endpoints-title { font-size: 11px; text-transform: uppercase; color: #71717a; letter-spacing: 0.1em; margin-bottom: 10px; font-weight: 700; }
    .link-list { display: flex; flex-direction: column; gap: 8px; font-family: monospace; }
    .link-list a { color: #a1a1aa; text-decoration: none; }
    .link-list a:hover { color: #ffffff; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> BACKEND API GATEWAY ONLINE</div>
    <h1>OZIK-SENTINEL CORE BACKEND</h1>
    <p class="sub">Pusat Siber TNI Angkatan Darat (PUSSIBERAD) · Kartika Cyber Hackathon 2026<br>
    Port <strong>:8080</strong> adalah layanan backend API Golang & SIEM Engine. Untuk mengakses antarmuka pengguna (Web UI Command Center), silakan klik tombol di bawah ini:</p>
    
    <a href="http://localhost:5000" class="btn">
      BUKA FRONTEND COMMAND CENTER (PORT 5000) &rarr;
    </a>

    <div class="grid">
      <div class="stat">
        <div class="stat-label">System Health</div>
        <div class="stat-val" style="color: #4ade80;">OPERATIONAL / HEALTHY</div>
      </div>
      <div class="stat">
        <div class="stat-label">AI Engine Mode</div>
        <div class="stat-val">%s</div>
      </div>
      <div class="stat">
        <div class="stat-label">Frontend UI URL</div>
        <div class="stat-val"><a href="http://localhost:5000" style="color: #60a5fa; text-decoration: none;">http://localhost:5000</a></div>
      </div>
      <div class="stat">
        <div class="stat-label">Backend API URL</div>
        <div class="stat-val"><a href="/api/v1/health" style="color: #60a5fa; text-decoration: none;">http://localhost:8080/api/v1</a></div>
      </div>
    </div>

    <div class="endpoints">
      <div class="endpoints-title">Pintasan Endpoint API Taktis:</div>
      <div class="link-list">
        <a href="/api/v1/health">&rarr; /api/v1/health — System Status & Active AI</a>
        <a href="/api/v1/assets">&rarr; /api/v1/assets — Live IT/OT Master Inventory</a>
        <a href="/api/v1/forensics/ledger">&rarr; /api/v1/forensics/ledger — Cryptographic Audit Ledger</a>
        <a href="/api/v1/forensics/ledger/verify">&rarr; /api/v1/forensics/ledger/verify — SHA-256 Ledger Verification</a>
        <a href="/api/v1/siem/correlations">&rarr; /api/v1/siem/correlations — Real-Time SIEM Telemetry</a>
      </div>
    </div>
  </div>
</body>
</html>`, store.SystemConfig.AIMode)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
		return
	}

	handleHealth(c)
}
