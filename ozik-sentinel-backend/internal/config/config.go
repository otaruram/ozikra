package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	DatabaseURL        string
	HMACSecret         []byte
	CORSAllowedOrigins []string
	AuthMode           string
	AIMode             string
	SumopodKey         string
	SumopodURL         string
	SumopodModel       string
	GeminiKey          string
	OllamaURL          string
}

func Load() *Config {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	sec := os.Getenv("SERVER_HMAC_SECRET")
	if sec == "" {
		sec = os.Getenv("HMAC_SECRET")
	}
	if sec == "" {
		log.Println("[SECURITY NOTICE] SERVER_HMAC_SECRET not set; using local ephemeral key for testing")
		sec = "DEV_LOCAL_EPHEMERAL_HMAC_SECRET_KEY_REPLACE_IN_PRODUCTION"
	}


	originsRaw := os.Getenv("CORS_ALLOWED_ORIGINS")
	var origins []string
	if originsRaw != "" {
		for _, o := range strings.Split(originsRaw, ",") {
			trimmed := strings.TrimSpace(o)
			if trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
	}
	if len(origins) == 0 {
		origins = []string{"https://oziksentinel.biz.id", "https://www.oziksentinel.biz.id", "http://localhost:3000", "http://localhost:5000", "https://*.vercel.app"}
	} else {
		hasCustomDomain := false
		for _, o := range origins {
			if strings.Contains(o, "oziksentinel.biz.id") {
				hasCustomDomain = true
				break
			}
		}
		if !hasCustomDomain {
			origins = append(origins, "https://oziksentinel.biz.id", "https://www.oziksentinel.biz.id")
		}
	}

	authMode := os.Getenv("AUTH_MODE")
	if authMode == "" {
		authMode = "GOOGLE_SANDBOX"
	}

	aiMode := os.Getenv("AI_MODE")
	if aiMode == "" {
		aiMode = "GEMINI_CLOUD"
	}

	sumoURL := strings.TrimRight(os.Getenv("SUMOPOD_BASE_URL"), "/")
	if sumoURL == "" {
		sumoURL = "https://ai.sumopod.com/v1"
	}

	sumoModel := os.Getenv("SUMOPOD_MODEL")
	if sumoModel == "" {
		sumoModel = "MiniMax-M3.1-Flash-Preview"
	}

	ollamaURL := strings.TrimRight(os.Getenv("OLLAMA_URL"), "/")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}

	return &Config{
		Port:               port,
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		HMACSecret:         []byte(sec),
		CORSAllowedOrigins: origins,
		AuthMode:           authMode,
		AIMode:             aiMode,
		SumopodKey:         os.Getenv("SUMOPOD_API_KEY"),
		SumopodURL:         sumoURL,
		SumopodModel:       sumoModel,
		GeminiKey:          os.Getenv("GEMINI_API_KEY"),
		OllamaURL:          ollamaURL,
	}
}
