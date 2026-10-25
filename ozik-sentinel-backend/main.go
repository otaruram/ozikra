package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	initStore()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// Universal Dynamic CORS Middleware
	r.Use(func(c *gin.Context) {
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
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

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
	// 1. Core API v1 Specification Routes (/api/v1/*)
	// ------------------------------------------------------------------------
	v1 := r.Group("/api/v1")
	{
		// Health & System
		v1.GET("/health", handleHealth)
		v1.GET("/healthz", handleHealth)
		v1.GET("/system/config", handleGetSystemConfig)
		v1.PATCH("/system/config", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander), handlePatchSystemConfig)

		// Authentication & Officer Tokens & Profiles
		v1.POST("/auth/token", handleGenerateToken)
		v1.POST("/auth/simulate-role", handleSimulateRole)
		v1.GET("/auth/officers", handleGetUsers)
		v1.GET("/auth/officer", handleGetOfficer)
		v1.GET("/auth/profile", handleGetProfile)
		v1.PUT("/auth/profile", handleUpdateProfile)
		v1.POST("/auth/register", handleRegisterOfficer)
		v1.POST("/auth/verify-member", handleVerifyMemberNRP)
		v1.GET("/admin/pending-officers", handleGetPendingOfficers)
		v1.POST("/admin/approve-officer", handleApproveOfficer)
		v1.POST("/admin/reject-officer", handleRejectOfficer)

		// Phase 1: Supply Chain Gatekeeper & QR Seal (Strictly LOGISTICS_OFFICER & SUPER_ADMIN)
		v1.POST("/supply-chain/verify", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleLogisticsOfficer), handleSupplyChainVerify)
		v1.POST("/supply-chain/qr-seal", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleLogisticsOfficer), handleSupplyChainQRSeal)
		v1.GET("/supply-chain/passport/:assetId/export", handleExportQRPassport)
		v1.POST("/assets/register", handleSupplyChainVerify) // Backward compatibility

		// Phase 2: Lightweight SIEM & Zero-Trust QR Check-In
		v1.POST("/siem/qr-checkin", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleOTTechnician), handleSIEMCheckIn)
		v1.POST("/siem/telemetry", handleSIEMTelemetry)
		v1.GET("/siem/stream", handleSIEMStream) // Live SSE Stream
		v1.GET("/siem/correlations", handleSIEMCorrelations)
		v1.GET("/siem/topology", handleSIEMTopology)

		// IoT Edge & Simulator Command Relay
		v1.POST("/iot/telemetry-checkin", handleSIEMTelemetry)
		v1.GET("/iot/commands/:assetId", handleGetIoTCommands)

		// Phase 3: Hash-Chained Audit Ledger, Forensics & Kill-Switch
		v1.GET("/forensics/ledger", handleGetLedger)
		v1.GET("/forensics/ledger/verify", handleVerifyLedger)
		v1.POST("/forensics/isolate/:asset_id", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander), handleForensicIsolate)
		v1.POST("/forensics/investigate", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleForensicAuditor), handleForensicInvestigate)
		v1.POST("/forensics/investigate/:asset_id", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleForensicAuditor), handleForensicInvestigate)
		v1.GET("/forensics/report/:incident_id/pdf", handleExportForensicReport)

		// Assets & Inventory
		v1.GET("/assets", handleGetAssets)
	}

	// ------------------------------------------------------------------------
	// 2. Direct Root & Frontend Contract Routes (fe/src/lib/api.ts)
	// ------------------------------------------------------------------------
	r.GET("/", handleRootGateway)
	r.GET("/health", handleHealth)
	r.GET("/healthz", handleHealth)
	r.GET("/metrics", handleMetrics)
	r.GET("/assets", handleGetAssets)

	r.NoRoute(func(c *gin.Context) {
		accept := c.GetHeader("Accept")
		if strings.Contains(accept, "text/html") {
			handleRootGateway(c)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{
			"error":     "ENDPOINT_NOT_FOUND",
			"message":   fmt.Sprintf("Route %s %s not found on Golang backend API", c.Request.Method, c.Request.URL.Path),
			"health":    "http://localhost:8080/api/v1/health",
			"dashboard": "http://localhost:5000",
		})
	})

	// Live SIEM Telemetry & Correlations
	r.GET("/telemetry/stream", handleGetTelemetryStream)
	r.POST("/telemetry/test-event", handleTriggerTestTelemetry)
	r.POST("/siem/check-in", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleOTTechnician), handleSIEMCheckIn)
	r.GET("/siem/correlations", handleSIEMCorrelations)
	r.GET("/siem/topology", handleSIEMTopology)

	// Phase 1 Gatekeeper (Strictly LOGISTICS_OFFICER & SUPER_ADMIN)
	r.POST("/gatekeeper/verify", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleLogisticsOfficer), handleSupplyChainVerify)
	r.GET("/gatekeeper/passport/:assetId/export", handleExportQRPassport)
	r.POST("/auth/simulate-role", handleSimulateRole)

	// Phase 3 Forensics & Kill-Switch
	r.POST("/forensics/investigate", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleForensicAuditor), handleForensicInvestigate)
	r.POST("/forensics/isolate", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander), handleForensicIsolate)
	r.GET("/forensics/:id/report", TacticalAuthMiddleware(), RequireRole(RoleSuperAdmin, RoleCommander, RoleForensicAuditor), handleExportForensicReport)

	// Immutable Ledger
	r.GET("/ledger", handleGetLedger)

	// Administration & RBAC
	r.GET("/admin/users", handleGetUsers)
	r.PATCH("/admin/users/:id/role", handleUpdateUserRole)
	r.PUT("/admin/engine", handleUpdateEngineConfig)
	r.GET("/admin/pending-officers", handleGetPendingOfficers)
	r.POST("/admin/approve-officer", handleApproveOfficer)
	r.POST("/admin/reject-officer", handleRejectOfficer)

	// Auth & Military Member Verification & Profiles
	r.GET("/auth/officer", handleGetOfficer)
	r.GET("/auth/profile", handleGetProfile)
	r.PUT("/auth/profile", handleUpdateProfile)
	r.POST("/auth/register", handleRegisterOfficer)
	r.POST("/auth/verify-member", handleVerifyMemberNRP)

	log.Printf("================================================================================")
	log.Printf(" OZIK-SENTINEL :: Core Golang Backend & Lightweight SIEM Gateway")
	log.Printf(" Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Kartika Cyber Hackathon 2026")
	log.Printf("================================================================================")
	log.Printf(" [AUTH MODE]     : %s (Air-Gapped: %v)", store.SystemConfig.AuthMode, store.SystemConfig.AirGapped)
	log.Printf(" [AI ENGINE]     : %s", store.SystemConfig.AIMode)
	log.Printf(" [SERVER PORT]   : %s", port)
	log.Printf(" [API ROOT]      : http://localhost:%s/api/v1", port)
	log.Printf(" [SSE STREAM]    : http://localhost:%s/api/v1/siem/stream", port)
	log.Printf("================================================================================")

	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
