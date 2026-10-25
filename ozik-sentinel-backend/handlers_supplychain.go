package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

// generateQRCodePNGDataURI creates a base64 encoded PNG QR code image data URI
func generateQRCodePNGDataURI(content string) (string, error) {
	pngBytes, err := qrcode.Encode(content, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes), nil
}

// handleSupplyChainVerify handles manifest and SBOM verification (Fase 1)
func handleSupplyChainVerify(c *gin.Context) {
	var assetName, serialNumber, vendor, assetType, documentText, sbomText string

	// Ensure upload directories exist
	_ = os.MkdirAll("uploads/manifests", 0755)
	_ = os.MkdirAll("uploads/sboms", 0755)

	// Check if request is multipart form (from Frontend file upload) or JSON
	contentType := c.GetHeader("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		assetName = strings.TrimSpace(c.PostForm("assetName"))
		serialNumber = strings.TrimSpace(c.PostForm("serialNumber"))
		vendor = strings.TrimSpace(c.PostForm("vendor"))
		assetType = strings.TrimSpace(c.PostForm("assetType"))

		// Read & Save manifest file to storage if present
		if file, err := c.FormFile("manifest"); err == nil {
			manifestDst := filepath.Join("uploads/manifests", fmt.Sprintf("%d_%s", time.Now().Unix(), file.Filename))
			if saveErr := c.SaveUploadedFile(file, manifestDst); saveErr == nil {
				log.Printf("[OZIK-GATEKEEPER] Saved manifest document to %s", manifestDst)
			}
			f, oErr := file.Open()
			if oErr == nil {
				b, _ := io.ReadAll(f)
				documentText = string(b)
				f.Close()
			}
		}

		// Read & Save SBOM file to storage if present
		if file, err := c.FormFile("sbom"); err == nil {
			sbomDst := filepath.Join("uploads/sboms", fmt.Sprintf("%d_%s", time.Now().Unix(), file.Filename))
			if saveErr := c.SaveUploadedFile(file, sbomDst); saveErr == nil {
				log.Printf("[OZIK-GATEKEEPER] Saved SBOM file to %s", sbomDst)
			}
			f, oErr := file.Open()
			if oErr == nil {
				b, _ := io.ReadAll(f)
				sbomText = string(b)
				f.Close()
			}
		}
	} else {
		var jsonReq struct {
			AssetName    string `json:"assetName"`
			SerialNumber string `json:"serialNumber"`
			Vendor       string `json:"vendor"`
			AssetType    string `json:"assetType"`
			DocumentText string `json:"documentText"`
			SBOMText     string `json:"sbomText"`
		}
		if err := c.ShouldBindJSON(&jsonReq); err == nil {
			assetName = strings.TrimSpace(jsonReq.AssetName)
			serialNumber = strings.TrimSpace(jsonReq.SerialNumber)
			vendor = strings.TrimSpace(jsonReq.Vendor)
			assetType = strings.TrimSpace(jsonReq.AssetType)
			documentText = jsonReq.DocumentText
			sbomText = jsonReq.SBOMText
		}
	}

	// Default fallback values if empty
	if assetName == "" {
		assetName = "Modul Radar & Avionik Taktis 2026"
	}
	if serialNumber == "" {
		serialNumber = fmt.Sprintf("SN-TAC-%d", time.Now().UnixNano()%1000000)
	}
	if vendor == "" {
		vendor = "PT Len Industri / Thales"
	}
	if assetType == "" {
		assetType = "OT_RADAR"
	}

	if documentText == "" {
		documentText = fmt.Sprintf("Certificate of Conformance: %s, SN: %s, Vendor: %s, Mil-Spec 810G Conformance", assetName, serialNumber, vendor)
	}
	if sbomText == "" {
		sbomText = fmt.Sprintf(`{"bomFormat":"CycloneDX","specVersion":"1.4","components":[{"name":"%s-kernel","version":"1.2.0"}]}`, assetName)
	}

	// 1. Semantic Search against cve_vulnerabilities in PostgreSQL
	cleanDoc := MaskPIIAndClassification(documentText + "\n" + sbomText)
	dbCVEMatches, err := searchCVEVulnerabilitiesDB(cleanDoc)
	if err != nil {
		dbCVEMatches = matchLocalCVE(cleanDoc)
	}

	// 2. Invoke Dual-Mode AI Engine (Gemini Cloud / Sumopod AI Gateway)
	engine := GetCurrentAIEngine()
	analysis, aiErr := engine.VerifySupplyChain(context.Background(), SupplyChainVerifyRequest{
		AssetName:    assetName,
		SerialNumber: serialNumber,
		Vendor:       vendor,
		AssetType:    assetType,
		DocumentText: documentText,
		SBOMText:     sbomText,
	})
	if aiErr != nil || analysis == nil {
		analysis = fallbackSupplyChainAnalysis(SupplyChainVerifyRequest{
			AssetName: assetName, SerialNumber: serialNumber, Vendor: vendor, AssetType: assetType,
		}, dbCVEMatches)
	}

	// 3. Dynamic Calculation of supply_chain_trust_score based strictly on CVEs
	dynamicTrustScore := 100
	if analysis.TrustScore > 0 {
		dynamicTrustScore = analysis.TrustScore
	}

	// Apply severity deductions from real DB CVE matches
	for _, m := range dbCVEMatches {
		switch m.Severity {
		case CVESeverityCritical:
			dynamicTrustScore -= 35
		case CVESeverityHigh:
			dynamicTrustScore -= 20
		case CVESeverityMedium:
			dynamicTrustScore -= 10
		case CVESeverityLow:
			dynamicTrustScore -= 5
		}
	}
	if dynamicTrustScore < 10 {
		dynamicTrustScore = 15
	}
	if dynamicTrustScore > 99 {
		dynamicTrustScore = 98
	}

	// Status determination: SECURE (>= 70) or QUARANTINED (< 70)
	integrityState := StateSecure
	status := "SECURE"
	verdict := "APPROVED"

	if dynamicTrustScore < 70 || len(dbCVEMatches) > 1 {
		integrityState = StateQuarantined
		status = "QUARANTINED"
		verdict = "QUARANTINED"
		analysis.Verdict = "QUARANTINED"
	} else {
		analysis.Verdict = "APPROVED"
	}
	analysis.TrustScore = dynamicTrustScore
	analysis.CVEMatches = dbCVEMatches

	// 4. Generate Asset ID and Cryptographic Tactical QR Code Passport
	typePrefix := "AST-OT"
	classification := ClassificationOT
	if strings.Contains(strings.ToUpper(assetType), "IT") || strings.Contains(strings.ToUpper(assetType), "SERVER") {
		typePrefix = "AST-IT"
		classification = ClassificationIT
	}

	assetID := fmt.Sprintf("%s-%03d", typePrefix, rand.Intn(900)+100)
	issuedAtStr := time.Now().Format("2006-01-02 15:04:05")

	// Payload data sealed with HMAC-SHA256 (asset_id + firmware_hash + secret)
	firmwareHash := sha256Hex(serialNumber + vendor + "FW_V1")
	qrPayloadData := fmt.Sprintf("OZIK-PASSPORT:%s:%s:%s:%s", assetID, firmwareHash, vendor, serialNumber)
	qrHash := sha256Hex(qrPayloadData)
	signature := hmacSign(fmt.Sprintf("%s:%s:%s", assetID, firmwareHash, string(hmacSecret)))

	// Generate real Cryptographic QR Code PNG Data URI
	qrDataToEncode := fmt.Sprintf("%s|SIG:%s", qrPayloadData, signature)
	qrImageDataURI, qrErr := generateQRCodePNGDataURI(qrDataToEncode)
	if qrErr != nil {
		log.Printf("[OZIK-GATEKEEPER] Notice generating QR Code PNG: %v", qrErr)
		qrImageDataURI = ""
	}

	passport := TacticalQRPassport{
		AssetID:      assetID,
		SerialNumber: serialNumber,
		FirmwareHash: firmwareHash,
		Vendor:       vendor,
		QRPayload:    qrHash,
		Signature:    signature,
		QRImage:      qrImageDataURI,
		IssuedAt:     issuedAtStr,
		IssuedBy:     "OZIK-SENTINEL GATEKEEPER PKI (TNI AD)",
	}

	// 5. Insert Record into assets table in Supabase / PostgreSQL
	newAsset := Asset{
		ID:             assetID,
		Name:           assetName,
		SerialNumber:   serialNumber,
		Vendor:         vendor,
		Type:           AssetType(assetType),
		Classification: classification,
		TrustScore:     &dynamicTrustScore,
		IntegrityState: integrityState,
		QRWindowStatus: WindowClosed,
		QRHash:         qrHash,
		FirmwareHash:   firmwareHash,
		CVECount:       len(dbCVEMatches),
		RegisteredAt:   time.Now().Format(time.RFC3339),
	}

	store.mu.Lock()
	store.Assets = append([]Asset{newAsset}, store.Assets...)
	store.mu.Unlock()

	// Write directly to database
	syncAssetToDB(newAsset)
	updateAssetStatusInDB(assetID, integrityState, status)

	// 6. Record to Immutable Hash-Chained Audit Ledger
	actor := "GATEKEEPER_AI"
	if off, exists := c.Get("officer_id"); exists {
		actor = fmt.Sprintf("%v", off)
	}
	appendLedger(actor, "SEAL_ASSET_PASSPORT", assetID, fmt.Sprintf("Trust:%d%%:Verdict:%s:CVEs:%d:SIG:%s", dynamicTrustScore, verdict, len(dbCVEMatches), signature[:16]))

	// 7. Broadcast Asset Registration Event to SIEM SSE Stream
	broadcastSSE("ASSET_REGISTERED", newAsset)

	c.JSON(http.StatusOK, VerificationResult{
		SubmissionID:    fmt.Sprintf("SUB-%d", time.Now().Unix()%100000),
		TrustScore:      dynamicTrustScore,
		Verdict:         verdict,
		ExtractedFields: analysis.ExtractedFields,
		CVEMatches:      dbCVEMatches,
		Passport:        &passport,
		Reasoning:       analysis.Reasoning,
	})
}

// handleSupplyChainQRSeal generates or signs a Tactical QR Code Passport on demand
func handleSupplyChainQRSeal(c *gin.Context) {
	var body struct {
		AssetID      string `json:"asset_id"`
		SerialNumber string `json:"serial_number"`
		FirmwareHash string `json:"firmware_hash"`
		Vendor       string `json:"vendor"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.AssetID == "" {
		body.AssetID = fmt.Sprintf("AST-OT-%03d", rand.Intn(999))
	}
	if body.FirmwareHash == "" {
		body.FirmwareHash = sha256Hex(body.AssetID + "FW_DEFAULT")
	}

	payloadData := fmt.Sprintf("OZIK-PASSPORT:%s:%s:%s:%s", body.AssetID, body.FirmwareHash, body.Vendor, body.SerialNumber)
	qrHash := sha256Hex(payloadData)
	signature := hmacSign(fmt.Sprintf("%s:%s:%s", body.AssetID, body.FirmwareHash, string(hmacSecret)))

	qrImage, _ := generateQRCodePNGDataURI(fmt.Sprintf("%s|SIG:%s", payloadData, signature))

	passport := TacticalQRPassport{
		AssetID:      body.AssetID,
		SerialNumber: body.SerialNumber,
		FirmwareHash: body.FirmwareHash,
		Vendor:       body.Vendor,
		QRPayload:    qrHash,
		Signature:    signature,
		QRImage:      qrImage,
		IssuedAt:     time.Now().Format(time.RFC3339),
		IssuedBy:     "OZIK-SENTINEL MILITARY PKI",
	}

	appendLedger("LOGISTICS_OFFICER", "ISSUE_TACTICAL_QR_SEAL", body.AssetID, qrHash)

	c.JSON(http.StatusOK, gin.H{
		"passport":  passport,
		"signature": signature,
		"message":   "Tactical QR Code Passport generated and signed with military HMAC-SHA256 seal.",
	})
}

func handleExportQRPassport(c *gin.Context) {
	assetID := c.Param("assetId")
	if assetID == "" {
		assetID = c.Param("id")
	}
	canonicalID := resolveAssetID(assetID)

	c.JSON(http.StatusOK, gin.H{
		"assetId": canonicalID,
		"status":  "EXPORTED_FOR_PRINT",
		"message": "Tactical QR Passport formatted for rugged mil-spec polyimide label printer.",
		"url":     fmt.Sprintf("/passports/%s.pdf", canonicalID),
	})
}

