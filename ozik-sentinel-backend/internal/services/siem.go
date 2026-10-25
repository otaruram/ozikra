package services

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"ozik-sentinel-backend/internal/models"
	"ozik-sentinel-backend/internal/repository"
)

type SIEMService struct {
	repo       *repository.Repository
	clientsMu  sync.RWMutex
	sseClients map[chan string]bool
}

func NewSIEMService(repo *repository.Repository) *SIEMService {
	return &SIEMService{
		repo:       repo,
		sseClients: make(map[chan string]bool),
	}
}

func (s *SIEMService) RegisterSSEClient(ch chan string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	s.sseClients[ch] = true
}

func (s *SIEMService) UnregisterSSEClient(ch chan string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	delete(s.sseClients, ch)
	close(ch)
}

func (s *SIEMService) BroadcastSSE(eventType string, data interface{}) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(b))

	for ch := range s.sseClients {
		select {
		case ch <- msg:
		default:
		}
	}
}

type TelemetryInput struct {
	AssetID       string
	TemperatureC  float64
	VoltageV      float64
	FirmwareHash  string
	NetworkTxKbps float64
	QRHash        string
}

type CorrelationVerdict struct {
	Verdict       string
	Severity      string
	Authorization string
	Message       string
	WindowID      string
	Correlation   *models.TelemetryCorrelation
}

func (s *SIEMService) CorrelateTelemetry(in TelemetryInput) CorrelationVerdict {
	// 1. Check if active physical QR maintenance window exists in Supabase
	activeWindow, hasWindow := s.repo.CheckActiveMaintenanceWindow(in.AssetID)

	var auth models.PhysicalAuthorization
	var verdict string
	var severity string
	var msg string
	var windowID string

	// Lookup asset in Supabase to compare against baseline firmware hash
	asset, foundAsset := s.repo.GetAssetByID(in.AssetID)

	if hasWindow && activeWindow != nil {
		auth = models.AuthStatusAuthorized
		verdict = "NOMINAL"
		severity = "INFO"
		windowID = activeWindow.ID
		msg = fmt.Sprintf("Telemetry parameter nominal within active physical QR maintenance window (%s).", windowID)
	} else {
		// Zero-Trust Rule: Anomaly if firmware modification or anomalous packet occurs without maintenance window
		isRogueFW := false
		if in.FirmwareHash == "0xDEAD_BACKDOOR_V2" {
			isRogueFW = true
		} else if foundAsset && asset.FirmwareHash != "" && in.FirmwareHash != "" && in.FirmwareHash != asset.FirmwareHash {
			isRogueFW = true
		}
		isHighTx := in.NetworkTxKbps > 4000.0

		if isRogueFW || isHighTx {
			auth = models.AuthStatusUnauthorized
			verdict = "ANOMALY"
			severity = "CRITICAL"
			if isRogueFW {
				msg = fmt.Sprintf("Zero-Trust Rule Violation: Unauthorized firmware hash drift detected without physical QR maintenance window on node %s.", in.AssetID)
			} else {
				msg = fmt.Sprintf("Zero-Trust Rule Violation: Anomalous high network bandwidth (%.0f Kbps) detected without physical QR window.", in.NetworkTxKbps)
			}
		} else {
			auth = models.AuthStatusAuthorized
			verdict = "NOMINAL"
			severity = "INFO"
			msg = "Standard telemetry packet within expected operating thresholds."
		}
	}

	corrID := fmt.Sprintf("CORR-%d-%04d", time.Now().UnixNano(), rand.Intn(10000))
	corr := &models.TelemetryCorrelation{
		ID:                    corrID,
		Timestamp:             time.Now().Format(time.RFC3339),
		AssetID:               in.AssetID,
		NetworkEvent:          fmt.Sprintf("FW: %s | Tx: %.0f Kbps | Temp: %.1f C", in.FirmwareHash[:min(16, len(in.FirmwareHash))], in.NetworkTxKbps, in.TemperatureC),
		PhysicalAuthorization: auth,
		MaintenanceWindowID:   windowID,
		Verdict:               verdict,
	}

	// Persist to Supabase
	_ = s.repo.InsertTelemetryLog(in.AssetID, in.TemperatureC, in.VoltageV, in.NetworkTxKbps, in.FirmwareHash, verdict)
	_ = s.repo.InsertCorrelation(*corr)

	// Update asset status in Supabase if compromised or maintenance
	if verdict == "ANOMALY" {
		_ = s.repo.UpdateAssetStatus(in.AssetID, models.StateCompromised, "COMPROMISED")
		log.Printf("[SIEM-ALERT] Zero-Trust Anomaly on %s: %s", in.AssetID, msg)
	} else if hasWindow {
		_ = s.repo.UpdateAssetStatus(in.AssetID, models.StateMaintenance, "MAINTENANCE")
	}

	// Broadcast live SSE event to all connected SIEM dashboards
	s.BroadcastSSE("SIEM_TELEMETRY_ALERT", map[string]interface{}{
		"asset_id":    in.AssetID,
		"verdict":     verdict,
		"severity":    severity,
		"message":     msg,
		"correlation": corr,
	})

	return CorrelationVerdict{
		Verdict:       verdict,
		Severity:      severity,
		Authorization: string(auth),
		Message:       msg,
		WindowID:      windowID,
		Correlation:   corr,
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
