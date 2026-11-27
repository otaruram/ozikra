package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"ozik-sentinel-backend/internal/config"
	"ozik-sentinel-backend/internal/handlers"
	"ozik-sentinel-backend/internal/middleware"
	"ozik-sentinel-backend/internal/repository"
	"ozik-sentinel-backend/internal/services"
)

func startRenderKeepAlive() {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("ENABLE_KEEP_ALIVE")), "true") {
		return
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("RENDER_EXTERNAL_URL")), "/")
	if baseURL == "" {
		baseURL = "https://ozik-sentinel.onrender.com"
	}
	target := baseURL + "/api/v1/health"
	client := &http.Client{Timeout: 10 * time.Second}

	go func() {
		// Initial delay to allow server bind
		time.Sleep(30 * time.Second)
		ticker := time.NewTicker(4 * time.Minute)
		defer ticker.Stop()
		for {
			resp, err := client.Get(target)
			if err == nil && resp != nil {
				_ = resp.Body.Close()
			}
			<-ticker.C
		}
	}()
}

func main() {
	cfg := config.Load()

	log.Printf("================================================================================")
	log.Printf(" OZIK-SENTINEL :: Core Golang Backend & Lightweight SIEM Gateway")
	log.Printf(" Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Production Clean Architecture")
	log.Printf("================================================================================")
	log.Printf(" [PORT]            : %s", cfg.Port)
	log.Printf(" [AUTH MODE]       : %s", cfg.AuthMode)
	log.Printf(" [AI ENGINE]       : %s", cfg.AIMode)
	log.Printf(" [DB CONFIGURED]   : %v", cfg.DatabaseURL != "")
	log.Printf("================================================================================")

	repo, err := repository.NewRepository(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to initialize database repository: %v", err)
	}

	aiService := services.NewAIService(cfg)
	hmacQR := services.NewHMACQRService(cfg.HMACSecret)
	siemService := services.NewSIEMService(repo)
	pdfService := services.NewPDFService()

	h := handlers.NewHandlers(cfg, repo, aiService, hmacQR, siemService, pdfService)
	mw := middleware.NewMiddleware(cfg, repo)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	h.RegisterRoutes(r, mw)
	startRenderKeepAlive()

	log.Printf("[+] Server listening on port %s", cfg.Port)
	log.Printf("[+] Health Check Endpoint: http://localhost:%s/healthz", cfg.Port)
	log.Printf("[+] API Specification:     http://localhost:%s/api/v1/health", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server exited with error: %v", err)
	}
}
