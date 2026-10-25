package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"ozik-sentinel-backend/internal/config"
	"ozik-sentinel-backend/internal/handlers"
	"ozik-sentinel-backend/internal/middleware"
	"ozik-sentinel-backend/internal/repository"
	"ozik-sentinel-backend/internal/services"
)

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

	log.Printf("[+] Server listening on port %s", cfg.Port)
	log.Printf("[+] Health Check Endpoint: http://localhost:%s/healthz", cfg.Port)
	log.Printf("[+] API Specification:     http://localhost:%s/api/v1/health", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server exited with error: %v", err)
	}
}
