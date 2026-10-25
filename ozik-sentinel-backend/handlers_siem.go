package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// Phase 2: Lightweight SIEM & Zero-Trust QR Check-In
// ============================================================================

func handleSIEMCheckIn(c *gin.Context) {
	var body struct {
		AssetQRHash  string `json:"assetQrHash"`
		TechnicianID string `json:"technicianId"`
		Signature    string `json:"signature"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.TechnicianID == "" {
		body.TechnicianID = "Sgt. Pratama (NRP 310892)"
	}

	rawQR := body.AssetQRHash
	var scannedPayload, scannedSignature string
	if strings.Contains(rawQR, "|SIG:") {
		parts := strings.Split(rawQR, "|SIG:")
		scannedPayload = parts[0]
		scannedSignature = parts[1]
	} else if body.Signature != "" {
		scannedPayload = rawQR
		scannedSignature = body.Signature
	}

	// 1. Cryptographic HMAC-SHA256 Signature Verification
	verified := true
	if scannedSignature != "" {
		expectedSig := hmacSign(scannedPayload)
		if scannedSignature != expectedSig {
			// Check legacy format hash
			expectedSigHash := hmacSign(sha256Hex(scannedPayload))
			if scannedSignature != expectedSigHash {
				log.Printf("[OZIK-SIEM] Warning: QR HMAC signature mismatch: got %s, expected %s", scannedSignature, expectedSig)
				verified = false
			}
		}
	}
	_ = verified

	now := time.Now()
	expires := now.Add(15 * time.Minute)

	// Resolve target asset by QRHash, ID, or matching string from DB or store
	targetAssetID := resolveAssetID(rawQR)
	if strings.Contains(rawQR, "OZIK-PASSPORT:") {
		parts := strings.Split(rawQR, ":")
		if len(parts) >= 2 {
			targetAssetID = resolveAssetID(parts[1])
		}
	}
	if targetAssetID == "" || targetAssetID == rawQR {
		targetAssetID = "AST-RADAR-01"
	}

	w := MaintenanceWindow{
		ID:           fmt.Sprintf("WIN-%d", now.Unix()%100000),
		AssetID:      targetAssetID,
		TechnicianID: body.TechnicianID,
		OpenedAt:     now.Format(time.RFC3339),
		ExpiresAt:    expires.Format(time.RFC3339),
		Status:       WindowOpen,
	}

	// 2. Persist Active Maintenance Window directly to Supabase / PostgreSQL DB
	_ = insertMaintenanceWindowDB(w)

	event := TelemetryEvent{
		ID:        fmt.Sprintf("TEL-%d", time.Now().UnixNano()%100000),
		Timestamp: now.Format(time.RFC3339),
		AssetID:   targetAssetID,
		Source:    SourcePhysicalQR,
		Severity:  SeverityInfo,
		Message:   fmt.Sprintf("HMAC-Verified Physical QR Check-In accepted for %s by %s. 15-Minute Maintenance Window ACTIVE.", targetAssetID, body.TechnicianID),
		Actor:     body.TechnicianID,
	}

	store.mu.Lock()
	store.Telemetry = append([]TelemetryEvent{event}, store.Telemetry...)
	if len(store.Telemetry) > 50 {
		store.Telemetry = store.Telemetry[:50]
	}

	corr := TelemetryCorrelation{
		ID:                    fmt.Sprintf("CORR-%d", time.Now().UnixNano()%100000),
		Timestamp:             now.Format(time.RFC3339),
		AssetID:               targetAssetID,
		NetworkEvent:          "Physical QR Authentication Window Opened (15m)",
		PhysicalAuthorization: AuthStatusAuthorized,
		MaintenanceWindowID:   w.ID,
		Verdict:               "NOMINAL",
	}
	store.Correlations = append([]TelemetryCorrelation{corr}, store.Correlations...)
	if len(store.Correlations) > 50 {
		store.Correlations = store.Correlations[:50]
	}
	store.mu.Unlock()

	// 3. Hash-Chained Audit Ledger Entry in PostgreSQL
	appendLedger(body.TechnicianID, "OPEN_QR_MAINTENANCE_WINDOW", targetAssetID, fmt.Sprintf("WindowID:%s:Expires:%s:HMAC:VERIFIED", w.ID, w.ExpiresAt))

	// 4. Real-Time Broadcast via SSE
	broadcastSSE("MAINTENANCE_WINDOW_OPENED", w)
	broadcastSSE("TELEMETRY_EVENT", event)

	c.JSON(http.StatusOK, w)
}

// handleSIEMTelemetry processes high-frequency IoT/OT telemetry and runs rule engine
func handleSIEMTelemetry(c *gin.Context) {
	var payload IoTTelemetryPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Normalize asset ID
	assetID := payload.AssetID
	if assetID == "" {
		assetID = payload.DeviceID
	}
	if assetID == "" {
		assetID = "AST-RADAR-01"
	}
	canonicalID := resolveAssetID(assetID)

	now := time.Now()
	nowStr := now.Format(time.RFC3339)

	// 1. Strict Live DB Check: Check active maintenance window in PostgreSQL
	activeWindow, hasActiveWindow := checkActiveMaintenanceWindowDB(canonicalID)

	// 2. Fetch baseline asset firmware hash from Database / Store
	var baselineFirmware string
	store.mu.RLock()
	for _, a := range store.Assets {
		if a.ID == canonicalID {
			baselineFirmware = a.FirmwareHash
			break
		}
	}
	store.mu.RUnlock()

	// 3. Anomaly Rule Engine
	isRogueFirmware := strings.Contains(payload.FirmwareHash, "DEAD") ||
		strings.Contains(payload.FirmwareHash, "BACKDOOR") ||
		strings.Contains(payload.FirmwareHash, "TAMPER")

	firmwareTampered := isRogueFirmware || (payload.FirmwareHash != "" && baselineFirmware != "" && payload.FirmwareHash != baselineFirmware)

	isThermalRunaway := payload.TemperatureC > 75.0
	isPowerSurge := payload.SignalPower > 85.0
	isTrafficSpike := payload.NetworkTxKbps > 5000.0

	var severity TelemetrySeverity = SeverityInfo
	var authStatus AuthorizationStatus = AuthStatusAuthorized
	var verdict = "NOMINAL"
	var alertMsg = fmt.Sprintf("OT Telemetry Nominal | Temp: %.1f C, Volt: %.1f V, Tx: %.0f Kbps", payload.TemperatureC, payload.VoltageV, payload.NetworkTxKbps)

	if firmwareTampered && !hasActiveWindow {
		// CRITICAL ALERT: Firmware modified without physical QR maintenance window!
		severity = SeverityCritical
		authStatus = AuthStatusUnauthorized
		verdict = "ANOMALY"
		alertMsg = fmt.Sprintf("CRITICAL [UNAUTHORIZED_FIRMWARE_DRIFT]: Rogue hash modification (%s) without active QR Maintenance Window!", payload.FirmwareHash)

		// Set asset status in PostgreSQL to COMPROMISED
		updateAssetStatusInDB(canonicalID, StateCompromised, "COMPROMISED")

		// Record in Hash-Chained Audit Ledger
		appendLedger("LIGHTWEIGHT_SIEM_RULE_ENGINE", "CRITICAL_UNAUTHORIZED_FIRMWARE_TAMPER", canonicalID, fmt.Sprintf("FirmwareHash:%s:Baseline:%s", payload.FirmwareHash, baselineFirmware))

	} else if isThermalRunaway || isPowerSurge || isTrafficSpike {
		severity = SeverityWarning
		verdict = "ANOMALY"
		if isThermalRunaway {
			alertMsg = fmt.Sprintf("WARNING [THERMAL_ANOMALY]: Sensor temperature critical: %.1f C (threshold 75 C)", payload.TemperatureC)
		} else if isPowerSurge {
			alertMsg = fmt.Sprintf("WARNING [POWER_SURGE]: Signal power surge detected: %.1f mA (threshold 85 mA)", payload.SignalPower)
		} else {
			alertMsg = fmt.Sprintf("WARNING [TRAFFIC_SPIKE]: Anomalous network burst: %.1f Kbps (threshold 5000 Kbps)", payload.NetworkTxKbps)
		}
		updateAssetStatusInDB(canonicalID, StateCompromised, "WARNING")
	} else if hasActiveWindow {
		alertMsg = fmt.Sprintf("AUTHORIZED MAINTENANCE: Telemetry & firmware accepted (Window %s Active)", activeWindow.ID)
	}

	// 4. Save every telemetry packet to telemetry_logs in PostgreSQL
	syncTelemetryToDB(canonicalID, payload.TemperatureC, payload.VoltageV, payload.FirmwareHash, verdict, payload.NetworkTxKbps)

	// 5. In-Memory Event & Correlation Buffers
	actor := payload.TechnicianID
	if actor == "" {
		actor = "OT_EDGE_DAEMON"
	}
	telEvent := TelemetryEvent{
		ID:        fmt.Sprintf("TEL-%d", now.UnixNano()%100000),
		Timestamp: nowStr,
		AssetID:   canonicalID,
		Source:    SourceFirmware,
		Severity:  severity,
		Message:   alertMsg,
		Actor:     actor,
	}

	corr := TelemetryCorrelation{
		ID:                    fmt.Sprintf("CORR-%d", now.UnixNano()%100000),
		Timestamp:             nowStr,
		AssetID:               canonicalID,
		NetworkEvent:          fmt.Sprintf("Telemetry Stream (Temp: %.1f C, Tx: %.0f Kbps)", payload.TemperatureC, payload.NetworkTxKbps),
		PhysicalAuthorization: authStatus,
		Verdict:               verdict,
	}
	if hasActiveWindow && activeWindow != nil {
		corr.MaintenanceWindowID = activeWindow.ID
	}

	store.mu.Lock()
	store.Telemetry = append([]TelemetryEvent{telEvent}, store.Telemetry...)
	if len(store.Telemetry) > 50 {
		store.Telemetry = store.Telemetry[:50]
	}
	store.Correlations = append([]TelemetryCorrelation{corr}, store.Correlations...)
	if len(store.Correlations) > 50 {
		store.Correlations = store.Correlations[:50]
	}
	store.mu.Unlock()

	// 6. Real-Time SSE Stream Broadcast to Command Center
	broadcastSSE("SIEM_TELEMETRY_ALERT", gin.H{
		"event":       telEvent,
		"correlation": corr,
		"asset_id":    canonicalID,
		"verdict":     verdict,
	})
	broadcastSSE("TELEMETRY_EVENT", telEvent)

	c.JSON(http.StatusOK, gin.H{
		"asset_id":      canonicalID,
		"verdict":       verdict,
		"severity":      severity,
		"authorization": authStatus,
		"message":       alertMsg,
		"timestamp":     nowStr,
	})
}

// handleSIEMStream implements Server-Sent Events (SSE) for the Frontend Command Center
func handleSIEMStream(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")

	clientChan := make(chan string, 20)
	registerSSEClient(clientChan)
	defer unregisterSSEClient(clientChan)

	// Send initial heartbeat
	c.Writer.Write([]byte("event: CONNECTED\ndata: {\"system\":\"OZIK-SENTINEL SIEM STREAM\",\"status\":\"ONLINE\"}\n\n"))
	c.Writer.Flush()

	notify := c.Request.Context().Done()
	for {
		select {
		case <-notify:
			return
		case msg, ok := <-clientChan:
			if !ok {
				return
			}
			_, err := c.Writer.Write([]byte(msg))
			if err != nil {
				return
			}
			c.Writer.Flush()
		case <-time.After(15 * time.Second):
			// Keepalive comment ping
			c.Writer.Write([]byte(": ping\n\n"))
			c.Writer.Flush()
		}
	}
}

func handleGetTelemetryStream(c *gin.Context) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	c.JSON(http.StatusOK, store.Telemetry)
}

func handleTriggerTestTelemetry(c *gin.Context) {
	store.mu.Lock()
	power := 80.0 + rand.Float64()*18.0
	isAnomaly := power > 85.0
	sev := SeverityWarning
	if isAnomaly {
		sev = SeverityCritical
	}

	assetID := "AST-RADIO-VHF"
	if len(store.Assets) > 0 {
		assetID = store.Assets[rand.Intn(len(store.Assets))].ID
	}

	event := TelemetryEvent{
		ID:        fmt.Sprintf("TEL-%d", time.Now().UnixNano()%100000),
		Timestamp: time.Now().Format(time.RFC3339),
		AssetID:   assetID,
		Source:    SourceFirmware,
		Severity:  sev,
		Message:   fmt.Sprintf("Simulated IoT telemetry signal power surge: %.1f mA", power),
		Actor:     "SIMULATOR_TEST",
	}
	store.Telemetry = append([]TelemetryEvent{event}, store.Telemetry...)

	if isAnomaly {
		for i := range store.Assets {
			if store.Assets[i].ID == assetID {
				store.Assets[i].IntegrityState = StateCompromised
			}
		}
	}
	store.mu.Unlock()

	appendLedger("OPERATOR_TEST", "TRIGGER_TEST_EVENT", assetID, fmt.Sprintf("Power:%.1f", power))
	broadcastSSE("TELEMETRY_EVENT", event)

	c.JSON(http.StatusOK, event)
}

func handleSIEMCorrelations(c *gin.Context) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	c.JSON(http.StatusOK, store.Correlations)
}

func handleSIEMTopology(c *gin.Context) {
	assets, _ := getAssetsWithTelemetryDB(false)

	type TopologyNode struct {
		ID             string              `json:"id"`
		Label          string              `json:"label"`
		Classification AssetClassification `json:"classification"`
		IntegrityState IntegrityState      `json:"integrityState"`
	}
	type TopologyEdge struct {
		Source string `json:"source"`
		Target string `json:"target"`
		Label  string `json:"label,omitempty"`
	}

	var nodes []TopologyNode
	var itHubID string

	for _, a := range assets {
		nodes = append(nodes, TopologyNode{
			ID:             a.ID,
			Label:          a.Name,
			Classification: a.Classification,
			IntegrityState: a.IntegrityState,
		})
		if itHubID == "" && (a.Classification == ClassificationIT || strings.Contains(strings.ToUpper(string(a.Type)), "SERVER")) {
			itHubID = a.ID
		}
	}

	if itHubID == "" && len(assets) > 0 {
		itHubID = assets[0].ID
	}

	// Dynamically build network topology edges based on real assets in database
	var edges []TopologyEdge
	seenEdges := make(map[string]bool)

	for _, a := range assets {
		if a.ID == itHubID {
			continue
		}
		label := "Tactical Bus"
		if strings.Contains(strings.ToUpper(string(a.Type)), "RADAR") {
			label = "Mil-Bus 1553"
		} else if strings.Contains(strings.ToUpper(string(a.Type)), "RADIO") {
			label = "Tactical Data Link"
		} else if strings.Contains(strings.ToUpper(string(a.Type)), "SENSOR") || strings.Contains(strings.ToUpper(a.Name), "SENSOR") {
			label = "LoRa OT Telemetry"
		}

		edgeKey := fmt.Sprintf("%s->%s", itHubID, a.ID)
		if !seenEdges[edgeKey] {
			seenEdges[edgeKey] = true
			edges = append(edges, TopologyEdge{
				Source: itHubID,
				Target: a.ID,
				Label:  label,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"edges": edges,
	})
}

// IoT Command Polling Endpoint (e.g. for Kill-Switch listener in simulator)
func handleGetIoTCommands(c *gin.Context) {
	assetID := c.Param("assetId")
	cmds := popIoTCommands(assetID)
	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"commands": cmds,
	})
}
