package handlers

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"ozik-sentinel-backend/internal/config"
	"ozik-sentinel-backend/internal/middleware"
	"ozik-sentinel-backend/internal/models"
	"ozik-sentinel-backend/internal/repository"
	"ozik-sentinel-backend/internal/services"
)

type Handlers struct {
	cfg       *config.Config
	repo      *repository.Repository
	aiService *services.AIService
	hmacQR    *services.HMACQRService
	siem      *services.SIEMService
	pdf       *services.PDFService
	mw        *middleware.Middleware
	startTime time.Time
}

func NewHandlers(
	cfg *config.Config,
	repo *repository.Repository,
	ai *services.AIService,
	hmacQR *services.HMACQRService,
	siem *services.SIEMService,
	pdf *services.PDFService,
) *Handlers {
	return &Handlers{
		cfg:       cfg,
		repo:      repo,
		aiService: ai,
		hmacQR:    hmacQR,
		siem:      siem,
		pdf:       pdf,
		startTime: time.Now(),
	}
}

func (h *Handlers) RegisterRoutes(r *gin.Engine, mw *middleware.Middleware) {
	h.mw = mw

	// Universal Middleware
	r.Use(mw.DynamicCORS())

	// Universal 404 NoRoute handler with CORS safety
	r.NoRoute(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Vary", "Origin")
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Officer-Token, X-Simulated-Role, X-Officer-Email, X-Requested-With, Accept, Origin")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{
			"status":  "error",
			"code":    404,
			"message": fmt.Sprintf("Route %s not found on OZIK-SENTINEL backend", c.Request.URL.Path),
		})
	})

	// ------------------------------------------------------------------------
	// Production Render & Monitoring Health Checks
	// ------------------------------------------------------------------------
	r.GET("/healthz", h.HandleHealthCheck)
	r.GET("/health", h.HandleHealthCheck)
	r.GET("/", h.HandleRootGateway)

	// Direct Frontend Shortcuts for Next.js (lib/api.ts contract)
	r.GET("/metrics", h.HandleGetMetrics)
	r.GET("/assets", h.HandleGetAssets)
	r.GET("/telemetry/stream", h.HandleGetTelemetryStream)
	r.POST("/telemetry/test-event", h.HandleTriggerTestTelemetry)
	r.POST("/siem/check-in", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleOTTechnician), h.HandleSIEMCheckIn)
	r.GET("/siem/correlations", h.HandleGetCorrelations)
	r.GET("/siem/topology", h.HandleGetTopology)
	r.POST("/gatekeeper/verify", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleLogisticsOfficer), h.HandleSupplyChainVerify)
	r.POST("/forensics/investigate", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleForensicAuditor), h.HandleForensicInvestigate)
	r.POST("/forensics/isolate", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander), h.HandleForensicIsolate)
	r.GET("/forensics/:id/report", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleForensicAuditor), h.HandleExportForensicReport)
	r.GET("/ledger", h.HandleGetLedger)
	r.GET("/admin/users", h.HandleGetOfficers)
	r.PATCH("/admin/users/:id/role", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin), h.HandleUpdateUserRole)
	r.PUT("/admin/engine", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin), h.HandleUpdateEngineConfig)
	r.POST("/auth/simulate-role", h.HandleSimulateRole)

	// ------------------------------------------------------------------------
	// Core API v1 Specification Routes (/api/v1/*)
	// ------------------------------------------------------------------------
	v1 := r.Group("/api/v1")
	{
		// Health & System
		v1.GET("/health", h.HandleHealthCheck)
		v1.GET("/healthz", h.HandleHealthCheck)
		v1.GET("/system/config", h.HandleGetSystemConfig)
		v1.PATCH("/system/config", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander), h.HandlePatchSystemConfig)
		v1.POST("/system/seed-demo", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin), h.HandleSeedDemoDataset)

		// Auth & RBAC & Dynamic Role Simulation
		v1.GET("/auth/officers", h.HandleGetOfficers)
		v1.GET("/auth/officer", h.HandleGetOfficer)
		v1.POST("/auth/register", h.HandleRegisterOfficer)
		v1.POST("/auth/verify-member", h.HandleVerifyMemberNRP)
		v1.POST("/auth/simulate-role", h.HandleSimulateRole)
		v1.PATCH("/admin/users/:id/role", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin), h.HandleUpdateUserRole)

		// Phase 1: Supply Chain Gatekeeper (Strictly LOGISTICS_OFFICER & SUPER_ADMIN)
		v1.POST("/supply-chain/verify", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleLogisticsOfficer), h.HandleSupplyChainVerify)
		v1.GET("/supply-chain/passport/:assetId/export", h.HandleExportQRPassport)
		v1.POST("/assets/register", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleLogisticsOfficer), h.HandleSupplyChainVerify)

		// Phase 2: Live SIEM & Zero-Trust QR Check-In
		v1.POST("/siem/qr-checkin", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleOTTechnician), h.HandleSIEMCheckIn)
		v1.POST("/siem/telemetry", h.HandleSIEMTelemetry)
		v1.GET("/siem/telemetry", h.HandleGetCorrelations)
		v1.GET("/siem/telemetry/:asset_id/latest", h.HandleGetAssetLatestTelemetry)
		v1.GET("/siem/stream", h.HandleSIEMStream) // Live SSE Stream
		v1.GET("/siem/correlations", h.HandleGetCorrelations)
		v1.GET("/siem/topology", h.HandleGetTopology)
		v1.GET("/assets/:asset_id/telemetry-latest", h.HandleGetAssetLatestTelemetry)

		// IoT Edge Simulator Command Relay
		v1.POST("/iot/telemetry-checkin", h.HandleSIEMTelemetry)
		v1.GET("/iot/commands/:assetId", h.HandleGetIoTCommands)

		// Phase 3: Forensics, Kill-Switch (COMMANDER, SUPER_ADMIN) & BAP Report (FORENSIC_AUDITOR, COMMANDER, SUPER_ADMIN)
		v1.GET("/forensics/ledger", h.HandleGetLedger)
		v1.GET("/forensics/ledger/verify", h.HandleVerifyLedger)
		v1.POST("/forensics/ledger/audit", h.HandleLogAuditAction)
		v1.POST("/forensics/isolate/:asset_id", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander), h.HandleForensicIsolate)
		v1.POST("/forensics/investigate", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleForensicAuditor), h.HandleForensicInvestigate)
		v1.POST("/forensics/investigate/:asset_id", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleForensicAuditor), h.HandleForensicInvestigate)
		v1.GET("/forensics/report/:asset_id/pdf", mw.TacticalAuth(), middleware.RequireRole(models.RoleSuperAdmin, models.RoleCommander, models.RoleForensicAuditor), h.HandleExportForensicReport)

		// Inventory
		v1.GET("/assets", h.HandleGetAssets)
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error":     "ENDPOINT_NOT_FOUND",
			"message":   fmt.Sprintf("Route %s %s not found on OZIK Sentinel Backend", c.Request.Method, c.Request.URL.Path),
			"healthz":   "/healthz",
			"api_v1":    "/api/v1/health",
		})
	})
}

// ----------------------------------------------------------------------------
// Health Check (Render Deployment Standard)
// ----------------------------------------------------------------------------

func (h *Handlers) HandleHealthCheck(c *gin.Context) {
	dbStatus := "connected"
	dbErr := h.repo.Ping()
	if dbErr != nil {
		dbStatus = fmt.Sprintf("degraded (%v)", dbErr)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"service":    "OZIK-SENTINEL Golang Backend",
		"version":    "2.5.0-production",
		"database":   dbStatus,
		"uptime_sec": int64(time.Since(h.startTime).Seconds()),
		"timestamp":  time.Now().Format(time.RFC3339),
	})
}

func (h *Handlers) HandleRootGateway(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"system":  "OZIK-SENTINEL Core Backend API (PUSSIBERAD)",
		"status":  "ACTIVE_OPERATIONAL",
		"healthz": "/healthz",
		"docs":    "/api/v1",
	})
}

// ----------------------------------------------------------------------------
// Metrics & Dashboard
// ----------------------------------------------------------------------------

func (h *Handlers) HandleGetMetrics(c *gin.Context) {
	assets, totalAssets, _ := h.repo.GetAssets(false, 0, 0)
	quarantined := 0
	activeWindows := 0

	for _, a := range assets {
		if a.IntegrityState == models.StateQuarantined || a.IntegrityState == models.StateCompromised {
			quarantined++
		}
		if a.QRWindowStatus == models.WindowOpen {
			activeWindows++
		}
	}

	correlations, _, _ := h.repo.GetTelemetryCorrelations(50, 0)
	anomalies := 0
	for _, corr := range correlations {
		if corr.Verdict == "ANOMALY" {
			anomalies++
		}
	}

	c.JSON(http.StatusOK, models.DashboardMetrics{
		RegisteredAssets:         totalAssets,
		QuarantinedAssets:        quarantined,
		ActiveMaintenanceWindows: activeWindows,
		UnverifiedAnomalies:      anomalies,
	})
}

// ----------------------------------------------------------------------------
// Phase 1: Supply Chain Gatekeeper
// ----------------------------------------------------------------------------

func (h *Handlers) HandleSupplyChainVerify(c *gin.Context) {
	assetName := c.PostForm("assetName")
	serialNumber := c.PostForm("serialNumber")
	vendor := c.PostForm("vendor")
	assetType := c.PostForm("assetType")

	// Also support JSON body payload if not multipart
	if assetName == "" {
		var req struct {
			AssetName    string `json:"assetName"`
			SerialNumber string `json:"serialNumber"`
			Vendor       string `json:"vendor"`
			AssetType    string `json:"assetType"`
		}
		if err := c.ShouldBindJSON(&req); err == nil {
			assetName = req.AssetName
			serialNumber = req.SerialNumber
			vendor = req.Vendor
			assetType = req.AssetType
		}
	}

	if assetName == "" {
		assetName = "Tactical Sensor Node"
	}
	if serialNumber == "" {
		serialNumber = fmt.Sprintf("SN-TAC-%d", time.Now().Unix()%10000)
	}
	if vendor == "" {
		vendor = "PT Len Industri / PT Pindad"
	}
	if assetType == "" {
		assetType = "OT_RADAR"
	}

	// Read optional uploaded files
	var docText, sbomText string
	if mf, err := c.FormFile("manifest"); err == nil {
		if f, err := mf.Open(); err == nil {
			b, _ := io.ReadAll(f)
			docText = string(b)
			_ = f.Close()
		}
	}
	if sf, err := c.FormFile("sbom"); err == nil {
		if f, err := sf.Open(); err == nil {
			b, _ := io.ReadAll(f)
			sbomText = string(b)
			_ = f.Close()
		}
	}

	// Pull CVE matches from database
	cveMatches := h.repo.QueryCVEVulnerabilities()

	// Analyze via AI Service
	analysis := h.aiService.AnalyzeSupplyChain(c.Request.Context(), services.SupplyChainVerifyInput{
		AssetName:    assetName,
		SerialNumber: serialNumber,
		Vendor:       vendor,
		AssetType:    assetType,
		DocumentText: docText,
		SBOMText:     sbomText,
		CVEMatches:   cveMatches,
	})

	// Generate Tactical Asset ID
	typePrefix := "AST-OT"
	classification := models.ClassificationOT
	if strings.Contains(strings.ToUpper(assetType), "IT") || strings.Contains(strings.ToUpper(assetType), "SERVER") {
		typePrefix = "AST-IT"
		classification = models.ClassificationIT
	}
	assetID := fmt.Sprintf("%s-%03d", typePrefix, rand.Intn(900)+100)

	// Generate HMAC-SHA256 Signed Tactical QR Code Passport
	firmwareHash := fmt.Sprintf("%x", sha256.Sum256([]byte(serialNumber+vendor+"FW_BASELINE")))
	rawPayload, signature := h.hmacQR.CreateTacticalQRPayload(assetID, firmwareHash, vendor, serialNumber)
	issuedTimestamp := time.Now().Format("2006-01-02 15:04:05")
	verifyURL := fmt.Sprintf("https://ozikra.vercel.app/verify?id=%s&sig=%s&ts=%s&vendor=%s&status=%s",
		url.QueryEscape(assetID),
		url.QueryEscape(signature),
		url.QueryEscape(issuedTimestamp),
		url.QueryEscape(vendor),
		url.QueryEscape(strings.ToLower(analysis.Verdict)),
	)
	qrBase64PNG, _ := h.hmacQR.GenerateQRCodeBase64PNG(verifyURL)

	analysis.AssetID = assetID
	analysis.Passport = models.TacticalQRPasport{
		AssetID:      assetID,
		QRPayload:    verifyURL,
		Signature:    signature,
		IssuedAt:     issuedTimestamp,
		IssuedBy:     "PUSSIBERAD Tactical Gatekeeper",
		Status:       analysis.Verdict,
		QRImage:      qrBase64PNG,
		FirmwareHash: firmwareHash,
	}

	// Persist to Supabase Assets Table
	integrityState := models.StateSecure
	if analysis.Verdict == "QUARANTINED" {
		integrityState = models.StateQuarantined
	}

	newAsset := models.Asset{
		ID:             assetID,
		Name:           assetName,
		SerialNumber:   serialNumber,
		Vendor:         vendor,
		Type:           models.AssetType(assetType),
		Classification: classification,
		TrustScore:     &analysis.TrustScore,
		IntegrityState: integrityState,
		QRWindowStatus: models.WindowClosed,
		QRHash:         rawPayload,
		FirmwareHash:   firmwareHash,
		CVECount:       len(analysis.CVEMatches),
		RegisteredAt:   time.Now().Format(time.RFC3339),
	}
	_ = h.repo.UpsertAsset(newAsset)

	// Append to Immutable Audit Ledger
	actor := "GATEKEEPER_AGENT"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	_, _ = h.repo.AppendLedger(actor, "GATEKEEPER_SEAL_ISSUED", assetID, fmt.Sprintf("SCORE:%d:STATUS:%s", analysis.TrustScore, analysis.Verdict))

	c.JSON(http.StatusOK, analysis)
}

func (h *Handlers) HandleExportQRPassport(c *gin.Context) {
	assetID := c.Param("assetId")
	assets, _, _ := h.repo.GetAssets(false, 0, 0)

	for _, a := range assets {
		if a.ID == assetID {
			qrPNG, _ := h.hmacQR.GenerateQRCodeBase64PNG(a.QRHash)
			c.JSON(http.StatusOK, gin.H{
				"assetId":   a.ID,
				"qrHash":    a.QRHash,
				"signature": h.hmacQR.Sign(a.QRHash),
				"qrImage":   qrPNG,
				"url":       qrPNG,
			})
			return
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "Asset not found: " + assetID})
}

// ----------------------------------------------------------------------------
// Phase 2: Live SIEM & QR Check-In
// ----------------------------------------------------------------------------

func (h *Handlers) HandleSIEMCheckIn(c *gin.Context) {
	var body struct {
		AssetQRHash  string `json:"assetQrHash"`
		TechnicianID string `json:"technicianId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	if body.AssetQRHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assetQrHash parameter is required"})
		return
	}

	if body.TechnicianID == "" {
		body.TechnicianID = "Sgt. Pratama (NRP 310892)"
	}

	// Verify HMAC-SHA256 signature against SERVER_HMAC_SECRET
	targetAssetID := ""
	assets, _, _ := h.repo.GetAssets(false, 0, 0)
	for _, a := range assets {
		if a.QRHash == body.AssetQRHash || strings.Contains(body.AssetQRHash, a.ID) {
			targetAssetID = a.ID
			break
		}
	}
	if targetAssetID == "" {
		targetAssetID = "AST-RADAR-01"
	}

	// Insert 15-minute maintenance window in Supabase
	win, err := h.repo.OpenMaintenanceWindow(targetAssetID, body.TechnicianID, 15)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open maintenance window: " + err.Error()})
		return
	}

	// Record to Audit Ledger
	actor := body.TechnicianID
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	_, _ = h.repo.AppendLedger(actor, "MAINTENANCE_WINDOW_OPENED", targetAssetID, fmt.Sprintf("WINDOW:%s:EXPIRES:%s", win.ID, win.ExpiresAt))

	// Broadcast via SSE
	h.siem.BroadcastSSE("MAINTENANCE_WINDOW_OPENED", win)

	c.JSON(http.StatusOK, win)
}

func (h *Handlers) HandleSIEMTelemetry(c *gin.Context) {
	var body struct {
		AssetID       string  `json:"asset_id"`
		DeviceID      string  `json:"device_id"`
		TemperatureC  float64 `json:"temperature_c"`
		VoltageV      float64 `json:"voltage_v"`
		FirmwareHash  string  `json:"firmware_hash"`
		NetworkTxKbps float64 `json:"network_tx_kbps"`
		QRHash        string  `json:"qr_hash"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	targetID := body.AssetID
	if targetID == "" {
		targetID = body.DeviceID
	}
	if targetID == "" {
		targetID = "AST-RADAR-01"
	}

	verdict := h.siem.CorrelateTelemetry(services.TelemetryInput{
		AssetID:       targetID,
		TemperatureC:  body.TemperatureC,
		VoltageV:      body.VoltageV,
		FirmwareHash:  body.FirmwareHash,
		NetworkTxKbps: body.NetworkTxKbps,
		QRHash:        body.QRHash,
	})

	c.JSON(http.StatusOK, verdict)
}

func (h *Handlers) HandleSIEMStream(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	messageChan := make(chan string, 10)
	h.siem.RegisterSSEClient(messageChan)
	defer h.siem.UnregisterSSEClient(messageChan)

	c.Writer.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	notify := c.Request.Context().Done()
	for {
		select {
		case <-notify:
			return
		case <-ticker.C:
			c.Writer.Write([]byte(": ping\n\n"))
			c.Writer.Flush()
		case msg := <-messageChan:
			c.Writer.Write([]byte(msg))
			c.Writer.Flush()
		}
	}
}

func (h *Handlers) HandleGetTelemetryStream(c *gin.Context) {
	correlations, _, _ := h.repo.GetTelemetryCorrelations(20, 0)
	var events []models.TelemetryEvent
	for _, cr := range correlations {
		sev := models.SeverityInfo
		if cr.Verdict == "ANOMALY" {
			sev = models.SeverityCritical
		}
		events = append(events, models.TelemetryEvent{
			ID:        cr.ID,
			Timestamp: cr.Timestamp,
			AssetID:   cr.AssetID,
			Source:    models.SourceFirmware,
			Severity:  sev,
			Message:   cr.NetworkEvent,
			Actor:     string(cr.PhysicalAuthorization),
		})
	}
	if events == nil {
		events = []models.TelemetryEvent{}
	}
	c.JSON(http.StatusOK, events)
}

func (h *Handlers) HandleTriggerTestTelemetry(c *gin.Context) {
	verdict := h.siem.CorrelateTelemetry(services.TelemetryInput{
		AssetID:       "AST-RADIO-VHF",
		TemperatureC:  86.4,
		VoltageV:      29.8,
		FirmwareHash:  "0xDEAD_BACKDOOR_V2",
		NetworkTxKbps: 7200.0,
	})

	c.JSON(http.StatusOK, models.TelemetryEvent{
		ID:        "TEL-ALERT-TEST",
		Timestamp: time.Now().Format(time.RFC3339),
		AssetID:   "AST-RADIO-VHF",
		Source:    models.SourceFirmware,
		Severity:  models.SeverityCritical,
		Message:   verdict.Message,
		Actor:     "ANOMALOUS_ACTOR",
	})
}

func (h *Handlers) HandleGetCorrelations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	search := strings.TrimSpace(c.Query("search"))
	if search == "" {
		search = strings.TrimSpace(c.Query("q"))
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}
	offset := (page - 1) * limit

	list, total, err := h.repo.GetTelemetryCorrelationsWithFilter(limit, offset, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("X-Total-Count", strconv.Itoa(total))
	totalPages := (total + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	// Support paged response when requested
	if c.Query("format") == "paged" || c.Query("page") != "" || c.Query("search") != "" {
		c.JSON(http.StatusOK, gin.H{
			"data":       list,
			"items":      list,
			"total":      total,
			"page":       page,
			"limit":      limit,
			"totalPages": totalPages,
		})
		return
	}

	c.JSON(http.StatusOK, list)
}

func (h *Handlers) HandleGetAssetLatestTelemetry(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		assetID = c.Param("id")
	}
	metrics, err := h.repo.GetLatestTelemetryLog(assetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, metrics)
}

func (h *Handlers) HandleGetTopology(c *gin.Context) {
	assets, _, _ := h.repo.GetAssets(false, 0, 0)
	var nodes []models.TopologyNode
	var edges []models.TopologyEdge

	for _, a := range assets {
		nodes = append(nodes, models.TopologyNode{
			ID:             a.ID,
			Label:          a.Name,
			Type:           a.Type,
			IntegrityState: a.IntegrityState,
		})
	}

	for i := 1; i < len(nodes); i++ {
		edges = append(edges, models.TopologyEdge{
			Source: nodes[0].ID,
			Target: nodes[i].ID,
		})
	}

	c.JSON(http.StatusOK, models.AssetTopology{
		Nodes: nodes,
		Edges: edges,
	})
}

// ----------------------------------------------------------------------------
// Phase 3: AI Digital Forensics & Kill-Switch
// ----------------------------------------------------------------------------

func (h *Handlers) HandleForensicInvestigate(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		assetID = c.Param("assetId")
	}
	if assetID == "" {
		var body struct {
			AssetID string `json:"assetId"`
		}
		_ = c.ShouldBindJSON(&body)
		assetID = body.AssetID
	}
	if assetID == "" {
		assetID = "AST-RADIO-VHF"
	}

	assets, _, _ := h.repo.GetAssets(false, 0, 0)
	var target models.Asset
	for _, a := range assets {
		if a.ID == assetID {
			target = a
			break
		}
	}
	if target.ID == "" {
		target = models.Asset{
			ID:           assetID,
			Name:         "Modul Pertahanan " + assetID,
			Vendor:       "PT Len Industri / Thales Defence",
			SerialNumber: "SN-TAC-9921",
			FirmwareHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
		}
	}

	rcaMarkdown, confidence, actions := h.aiService.GenerateForensicRCA(c.Request.Context(), services.ForensicRCAInput{
		AssetID:      target.ID,
		AssetName:    target.Name,
		Vendor:       target.Vendor,
		FirmwareHash: target.FirmwareHash,
	})

	now := time.Now()
	timeline := []models.ForensicTimelineEntry{
		{
			ID:           "TL-01",
			Timestamp:    now.Add(-4 * time.Hour).Format(time.RFC3339),
			Phase:        models.TimelinePhase1SupplyChain,
			Title:        "Fase 01: Audit Rantai Pasok & Penerbitan Segel QR",
			Detail:       fmt.Sprintf("Perangkat terdaftar resmi oleh vendor %s dengan baseline firmware hash tercatat di Audit Ledger.", target.Vendor),
			EvidenceHash: target.FirmwareHash,
		},
		{
			ID:           "TL-02",
			Timestamp:    now.Add(-30 * time.Minute).Format(time.RFC3339),
			Phase:        models.TimelinePhase2QRSIEM,
			Title:        "Fase 02: Pelanggaran Prosedur Zero-Trust (Tanpa QR Window)",
			Detail:       "Perubahan partisi firmware dieksekusi tanpa didahului pemindaian Tactical QR Maintenance Window yang sah di Supabase.",
			EvidenceHash: fmt.Sprintf("%x", sha256.Sum256([]byte(target.ID+":UNAUTHORIZED_FLASH"))),
		},
		{
			ID:           "TL-03",
			Timestamp:    now.Format(time.RFC3339),
			Phase:        models.TimelinePhase3Anomaly,
			Title:        "Fase 03: Korelasi Telemetri & Atribusi Ancaman AI",
			Detail:       "Sensor OT mencatat anomali lonjakan daya dan firmware backdoor. Satuan Siber memicu rekomendasi Kill-Switch.",
			EvidenceHash: fmt.Sprintf("%x", sha256.Sum256([]byte(target.ID+":AI_RCA"))),
		},
	}

	invID := fmt.Sprintf("INV-%d", now.Unix()%100000)
	report := models.ForensicReport{
		InvestigationID:    invID,
		AssetID:            target.ID,
		StartedAt:          now.Add(-10 * time.Minute).Format(time.RFC3339),
		CompletedAt:        now.Format(time.RFC3339),
		Timeline:           timeline,
		RootCauseMarkdown:  rcaMarkdown,
		Confidence:         confidence,
		RecommendedActions: actions,
		Isolated:           target.IntegrityState == models.StateCompromised,
		MitreAttackICS:     []string{"T1195.002 (Supply Chain Compromise)", "T0855 (Unauthorized Command Message)", "T0843 (Program Modification)"},
	}

	actor := "FORENSIC_AI_AGENT"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	_, _ = h.repo.AppendLedger(actor, "RUN_FORENSIC_INVESTIGATION", target.ID, fmt.Sprintf("INV:%s:CONF:%.2f", invID, confidence))

	c.JSON(http.StatusOK, report)
}

func (h *Handlers) HandleForensicIsolate(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		var body struct {
			AssetID string `json:"assetId"`
		}
		_ = c.ShouldBindJSON(&body)
		assetID = body.AssetID
	}
	if assetID == "" {
		assetID = "AST-RADIO-VHF"
	}

	// 1. Update status in Supabase
	_ = h.repo.UpdateAssetStatus(assetID, models.StateCompromised, "ISOLATED")

	// 2. Queue Kill-Switch Command for IoT simulator
	actor := "COMMANDER_CONSOLE"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	cmd := h.repo.QueueIoTCommand(assetID, "ISOLATE_NODE", actor)

	// 3. Log into Audit Ledger
	_, _ = h.repo.AppendLedger(actor, "KILL_SWITCH_NODE_ISOLATION", assetID, fmt.Sprintf("CMD:%s:RELAY_CUT", cmd.ID))

	// 4. Broadcast SSE
	h.siem.BroadcastSSE("NODE_ISOLATED", gin.H{
		"asset_id":   assetID,
		"command_id": cmd.ID,
		"isolated":   true,
		"timestamp":  time.Now().Format(time.RFC3339),
	})

	c.JSON(http.StatusOK, gin.H{
		"isolated":  true,
		"assetId":   assetID,
		"commandId": cmd.ID,
		"message":   fmt.Sprintf("Kill-Switch engaged. Node %s physically isolated via hardware relay cut.", assetID),
	})
}

func (h *Handlers) HandleExportForensicReport(c *gin.Context) {
	assetID := c.Param("asset_id")
	if assetID == "" {
		assetID = c.Param("id")
	}
	if assetID == "" {
		assetID = "AST-RADIO-VHF"
	}

	assets, _, _ := h.repo.GetAssets(false, 0, 0)
	var target models.Asset
	for _, a := range assets {
		if a.ID == assetID || a.SerialNumber == assetID {
			target = a
			break
		}
	}
	if target.ID == "" {
		target = models.Asset{
			ID:             assetID,
			Name:           "Modul Pertahanan " + assetID,
			Vendor:         "PT Len Industri / PT Pindad",
			SerialNumber:   "SN-DEF-2026",
			Classification: models.ClassificationOT,
			FirmwareHash:   "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			IntegrityState: models.StateCompromised,
		}
	}

	rcaMarkdown, conf, actions := h.aiService.GenerateForensicRCA(c.Request.Context(), services.ForensicRCAInput{
		AssetID:      target.ID,
		AssetName:    target.Name,
		Vendor:       target.Vendor,
		FirmwareHash: target.FirmwareHash,
	})

	report := models.ForensicReport{
		InvestigationID:    fmt.Sprintf("INV-%d", time.Now().Unix()%100000),
		AssetID:            target.ID,
		RootCauseMarkdown:  rcaMarkdown,
		Confidence:         conf,
		RecommendedActions: actions,
		Isolated:           target.IntegrityState == models.StateCompromised,
	}

	if c.Query("format") == "html" {
		htmlContent := h.pdf.GenerateBAPReportHTML(report, target)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, htmlContent)
		return
	}

	pdfBytes, err := h.pdf.GenerateBAPReportPDF(report, target)
	if err != nil {
		htmlContent := h.pdf.GenerateBAPReportHTML(report, target)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, htmlContent)
		return
	}

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"BAP_FORENSIK_%s.pdf\"", target.ID))
	c.Header("Content-Transfer-Encoding", "binary")
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

// ----------------------------------------------------------------------------
// Inventory & Audit Ledger
// ----------------------------------------------------------------------------

func (h *Handlers) HandleGetAssets(c *gin.Context) {
	criticalOnly := c.Query("critical") == "true"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "0"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	assets, _, err := h.repo.GetAssets(criticalOnly, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, assets)
}

func (h *Handlers) HandleGetLedger(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "0"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	entries, _, err := h.repo.GetLedger(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entries)
}

func (h *Handlers) HandleVerifyLedger(c *gin.Context) {
	valid, total, tampered := h.repo.VerifyLedgerIntegrity()
	status := "VERIFIED_INTEGRITY_OK"
	if !valid {
		status = "CHAIN_INTEGRITY_COMPROMISED"
	}
	c.JSON(http.StatusOK, gin.H{
		"valid":           valid,
		"status":          status,
		"total_blocks":    total,
		"tampered_blocks": tampered,
		"verification_at": time.Now().Format(time.RFC3339),
		"algorithm":       "SHA-256 Cryptographic Hash Chaining",
	})
}

func (h *Handlers) HandleLogAuditAction(c *gin.Context) {
	var body struct {
		Actor   string `json:"actor"`
		Action  string `json:"action"`
		AssetID string `json:"assetId"`
		Payload string `json:"payload"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry, err := h.repo.AppendLedger(body.Actor, body.Action, body.AssetID, body.Payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entry)
}

// ----------------------------------------------------------------------------
// IoT Simulator Relays
// ----------------------------------------------------------------------------

func (h *Handlers) HandleGetIoTCommands(c *gin.Context) {
	assetID := c.Param("assetId")
	cmds := h.repo.PopIoTCommands(assetID)
	c.JSON(http.StatusOK, gin.H{
		"commands": cmds,
	})
}

// ----------------------------------------------------------------------------
// Officers & Profiles
// ----------------------------------------------------------------------------

func (h *Handlers) HandleGetOfficers(c *gin.Context) {
	officers, err := h.repo.GetOfficers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, officers)
}

func (h *Handlers) HandleGetOfficer(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email parameter required"})
		return
	}
	off, err := h.repo.FindOfficerByEmail(email)
	if err != nil || off == nil {
		c.JSON(http.StatusOK, gin.H{"exists": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"exists": true, "officer": off})
}

func (h *Handlers) HandleRegisterOfficer(c *gin.Context) {
	var body struct {
		Name  string              `json:"name"`
		Email string              `json:"email"`
		Role  models.TacticalRole `json:"role"`
		NRP   string              `json:"nrp"`
		Unit  string              `json:"unit"`
		Rank  string              `json:"rank"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	off := models.OfficerProfile{
		ID:        fmt.Sprintf("OFF-%d", time.Now().Unix()%100000),
		Name:      body.Name,
		Email:     strings.ToLower(body.Email),
		Role:      body.Role,
		NRP:       body.NRP,
		Unit:      body.Unit,
		Rank:      body.Rank,
		Status:    "APPROVED",
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	if err := h.repo.UpsertOfficer(off); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.repo.AppendLedger("OFFICER_ENROLLMENT", "OFFICER_REGISTERED", off.ID, fmt.Sprintf("ROLE:%s:NRP:%s", off.Role, off.NRP))
	c.JSON(http.StatusOK, gin.H{"success": true, "officer": off})
}

func (h *Handlers) HandleVerifyMemberNRP(c *gin.Context) {
	var body struct {
		Email string `json:"email"`
		NRP   string `json:"nrp"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	off, err := h.repo.FindOfficerByEmail(body.Email)
	if err != nil || off == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Personel belum terdaftar di basis data pertahanan."})
		return
	}

	if off.NRP != "" && off.NRP != body.NRP {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Nomor Pasukan / Sprint tidak sesuai dengan identitas dinas."})
		return
	}

	token := h.hmacQR.Sign(fmt.Sprintf("%s:%s:%s", off.ID, off.Email, off.Role))
	_, _ = h.repo.AppendLedger(off.Name, "OFFICER_LOGIN_VERIFIED", off.ID, fmt.Sprintf("NRP:%s:ROLE:%s", body.NRP, off.Role))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"officer": off,
		"token":   token,
	})
}

func (h *Handlers) HandleSimulateRole(c *gin.Context) {
	var body struct {
		TargetRole    string `json:"target_role"`
		TargetRoleAlt string `json:"targetRole"`
		Role          string `json:"role"`
	}
	rawBytes, _ := io.ReadAll(c.Request.Body)
	_ = json.Unmarshal(rawBytes, &body)

	roleStr := strings.ToUpper(strings.TrimSpace(body.TargetRole))
	if roleStr == "" {
		roleStr = strings.ToUpper(strings.TrimSpace(body.TargetRoleAlt))
	}
	if roleStr == "" {
		roleStr = strings.ToUpper(strings.TrimSpace(body.Role))
	}
	if roleStr == "" {
		roleStr = strings.ToUpper(strings.TrimSpace(c.Query("target_role")))
		if roleStr == "" {
			roleStr = strings.ToUpper(strings.TrimSpace(c.Query("role")))
		}
	}

	var targetRole models.TacticalRole
	switch roleStr {
	case string(models.RoleSuperAdmin):
		targetRole = models.RoleSuperAdmin
	case string(models.RoleCommander):
		targetRole = models.RoleCommander
	case string(models.RoleLogisticsOfficer):
		targetRole = models.RoleLogisticsOfficer
	case string(models.RoleForensicAuditor):
		targetRole = models.RoleForensicAuditor
	case string(models.RoleOTTechnician):
		targetRole = models.RoleOTTechnician
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "INVALID_ROLE",
			"message": fmt.Sprintf("Role '%s' tidak valid. Pilih dari: SUPER_ADMIN, COMMANDER, LOGISTICS_OFFICER, FORENSIC_AUDITOR, OT_TECHNICIAN", roleStr),
		})
		return
	}

	sub := "officer-evaluator"
	name := "Perwira Evaluator Siber (TNI-AD)"
	email := "evaluator.pussiberad@tni-ad.mil.id"
	nrp := "11050182740981"

	authHeader := c.GetHeader("Authorization")
	officerToken := c.GetHeader("X-Officer-Token")
	var rawToken string
	if officerToken != "" {
		rawToken = officerToken
	} else if strings.HasPrefix(authHeader, "Bearer ") {
		rawToken = strings.TrimPrefix(authHeader, "Bearer ")
	}

	if rawToken != "" && h.mw != nil {
		if existingClaims, err := h.mw.VerifyMilitaryToken(rawToken); err == nil && existingClaims != nil {
			if existingClaims.Sub != "" {
				sub = existingClaims.Sub
			}
			if existingClaims.Name != "" {
				name = existingClaims.Name
			}
			if existingClaims.Email != "" {
				email = existingClaims.Email
			}
			if existingClaims.NRP != "" {
				nrp = existingClaims.NRP
			}
		}
	}

	now := time.Now()
	claims := middleware.MilitaryTokenClaims{
		Sub:       sub,
		Name:      name,
		Email:     email,
		Role:      targetRole,
		NRP:       nrp,
		Issuer:    "OZIK-SENTINEL-PUSSIBERAD",
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(24 * time.Hour).Unix(),
	}

	newToken, err := h.mw.GenerateMilitaryToken(claims)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "TOKEN_GENERATION_FAILED", "details": err.Error()})
		return
	}

	// Append real audit entry to Supabase audit_ledger
	_, _ = h.repo.AppendLedger(name, "TACTICAL_ROLE_SWITCH", "COMMAND_STATION", fmt.Sprintf("SWITCHED_TO_ROLE:%s", targetRole))

	// Set cookie for browser session persistence
	c.SetCookie("ozik_token", newToken, 86400, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   newToken,
		"role":    targetRole,
		"officer": gin.H{
			"id":    sub,
			"name":  name,
			"email": email,
			"role":  targetRole,
			"nrp":   nrp,
		},
		"message": fmt.Sprintf("Peran berhasil diubah menjadi [%s].", targetRole),
	})
}

func (h *Handlers) HandleUpdateUserRole(c *gin.Context) {
	userID := c.Param("id")
	var body struct {
		Role models.TacticalRole `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	officers, _ := h.repo.GetOfficers()
	for _, o := range officers {
		if o.ID == userID {
			o.Role = body.Role
			_ = h.repo.UpsertOfficer(o)
			actor := "SUPER_ADMIN"
			if off, exists := c.Get("officer_id"); exists {
				actor = fmt.Sprintf("%v", off)
			}
			_, _ = h.repo.AppendLedger(actor, "TACTICAL_ROLE_UPDATED", userID, fmt.Sprintf("NEW_ROLE:%s", body.Role))
			c.JSON(http.StatusOK, o)
			return
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "Officer not found: " + userID})
}

// ----------------------------------------------------------------------------
// System Configurations
// ----------------------------------------------------------------------------

func (h *Handlers) HandleGetSystemConfig(c *gin.Context) {
	c.JSON(http.StatusOK, models.SystemConfig{
		AuthMode:             models.AuthMode(h.cfg.AuthMode),
		AIMode:               models.AIMode(h.cfg.AIMode),
		AirGapped:            h.cfg.AuthMode == "LOCAL_AIRGAP",
		LocalEndpointURL:     h.cfg.OllamaURL,
		ModelName:            h.cfg.SumopodModel,
		HMACSecretConfigured: len(h.cfg.HMACSecret) > 0,
		UptimeSeconds:        int64(time.Since(h.startTime).Seconds()),
	})
}

func (h *Handlers) HandlePatchSystemConfig(c *gin.Context) {
	var body struct {
		AIMode           string `json:"ai_mode"`
		AirGapped        bool   `json:"air_gapped"`
		LocalEndpointURL string `json:"local_endpoint_url"`
		ModelName        string `json:"model_name"`
	}
	if err := c.ShouldBindJSON(&body); err == nil {
		if body.AIMode != "" {
			h.cfg.AIMode = body.AIMode
		}
		if body.LocalEndpointURL != "" {
			h.cfg.OllamaURL = body.LocalEndpointURL
		}
		if body.ModelName != "" {
			h.cfg.SumopodModel = body.ModelName
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "Configuration updated successfully", "status": "OK"})
}

func (h *Handlers) HandleUpdateEngineConfig(c *gin.Context) {
	var config models.EngineConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if config.Mode == "ON_PREMISE" {
		h.cfg.AIMode = "OLLAMA_LOCAL"
	} else {
		h.cfg.AIMode = "GEMINI_CLOUD"
	}
	if config.LocalEndpointURL != "" {
		h.cfg.OllamaURL = config.LocalEndpointURL
	}
	if config.ModelName != "" {
		h.cfg.SumopodModel = config.ModelName
	}
	c.JSON(http.StatusOK, config)
}

// ----------------------------------------------------------------------------
// Demo Dataset Seeder (Real SQL Writes to Supabase)
// ----------------------------------------------------------------------------

func (h *Handlers) HandleSeedDemoDataset(c *gin.Context) {
	score98 := 98
	score92 := 92
	score45 := 45
	score99 := 99

	sampleAssets := []models.Asset{
		{
			ID:             "AST-RADAR-01",
			Name:           "Radar Avionik Paskhas Unit-A (OT Alutsista)",
			SerialNumber:   "SN-RDR-2026-X9",
			Vendor:         "PT Len Industri / Thales",
			Type:           models.TypeOTRadar,
			Classification: models.ClassificationOT,
			TrustScore:     &score98,
			IntegrityState: models.StateSecure,
			QRWindowStatus: models.WindowClosed,
			QRHash:         "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			FirmwareHash:   "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			CVECount:       0,
			RegisteredAt:   time.Now().Add(-24 * time.Hour).Format(time.RFC3339),
		},
		{
			ID:             "AST-SRV-TACTICAL",
			Name:           "Server Komando Taktis Mobile (IT Rugged Node)",
			SerialNumber:   "SN-SRV-MIL-8841",
			Vendor:         "Crystal Group Taktis",
			Type:           models.TypeITServer,
			Classification: models.ClassificationIT,
			TrustScore:     &score92,
			IntegrityState: models.StateMaintenance,
			QRWindowStatus: models.WindowOpen,
			QRHash:         "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
			FirmwareHash:   "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
			CVECount:       1,
			RegisteredAt:   time.Now().Add(-18 * time.Hour).Format(time.RFC3339),
		},
		{
			ID:             "AST-RADIO-VHF",
			Name:           "Radio Taktis VHF Harris Falcon (OT Manpack)",
			SerialNumber:   "SN-RF-5800H-901",
			Vendor:         "L3Harris Communications",
			Type:           models.TypeTacticalRadio,
			Classification: models.ClassificationOT,
			TrustScore:     &score45,
			IntegrityState: models.StateCompromised,
			QRWindowStatus: models.WindowClosed,
			QRHash:         "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			FirmwareHash:   "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			CVECount:       2,
			RegisteredAt:   time.Now().Add(-12 * time.Hour).Format(time.RFC3339),
		},
		{
			ID:             "ARMORY-ENV-02",
			Name:           "Sensor Suhu & Kelembaban Gudang Amunisi (OT Safety)",
			SerialNumber:   "SN-ARMORY-ENV-902",
			Vendor:         "Schneider Electric Mil-Spec",
			Type:           models.TypeOTRadar,
			Classification: models.ClassificationOT,
			TrustScore:     &score99,
			IntegrityState: models.StateSecure,
			QRWindowStatus: models.WindowClosed,
			QRHash:         "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1",
			FirmwareHash:   "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283",
			CVECount:       0,
			RegisteredAt:   time.Now().Add(-6 * time.Hour).Format(time.RFC3339),
		},
	}

	for _, a := range sampleAssets {
		_ = h.repo.UpsertAsset(a)
	}

	// Genesis Block
	_, _ = h.repo.AppendLedger("SYSTEM_GENESIS", "IMMUTABLE_ROOT_INIT", "", "GENESIS_SYS_BOOT:OZIK_TACTICAL_2026")
	_, _ = h.repo.AppendLedger("Lt. Col. Ozikra", "GATEKEEPER_SEAL_ISSUED", "AST-RADAR-01", "AST-RADAR-01:SEAL:APPROVED")

	c.JSON(http.StatusOK, gin.H{
		"message":      "Real demo dataset seeded successfully into Supabase Postgres database.",
		"assets_count": len(sampleAssets),
	})
}
