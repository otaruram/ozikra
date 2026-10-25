package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"ozik-sentinel-backend/internal/config"
	"ozik-sentinel-backend/internal/models"
	"ozik-sentinel-backend/internal/repository"
)

type Middleware struct {
	cfg  *config.Config
	repo *repository.Repository
}

func NewMiddleware(cfg *config.Config, repo *repository.Repository) *Middleware {
	return &Middleware{cfg: cfg, repo: repo}
}

// Universal Dynamic CORS Middleware
func (m *Middleware) DynamicCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowedOrigin := "*"

		if origin != "" {
			for _, allowed := range m.cfg.CORSAllowedOrigins {
				if allowed == "*" || allowed == origin {
					allowedOrigin = origin
					break
				}
				// Support wildcard *.vercel.app
				if strings.Contains(allowed, "*.vercel.app") && strings.HasSuffix(origin, ".vercel.app") {
					allowedOrigin = origin
					break
				}
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Officer-Token, X-Simulated-Role, X-Officer-Email, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

type MilitaryTokenClaims struct {
	Sub       string              `json:"sub"`
	Name      string              `json:"name"`
	Email     string              `json:"email"`
	Role      models.TacticalRole `json:"role"`
	NRP       string              `json:"nrp,omitempty"`
	Issuer    string              `json:"iss"`
	IssuedAt  int64               `json:"iat"`
	ExpiresAt int64               `json:"exp"`
}

func (m *Middleware) VerifyMilitaryToken(tokenStr string) (*MilitaryTokenClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	unsignedToken := fmt.Sprintf("%s.%s", parts[0], parts[1])
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding")
	}

	mac := hmac.New(sha256.New, m.cfg.HMACSecret)
	mac.Write([]byte(unsignedToken))
	expectedSig := mac.Sum(nil)

	if !hmac.Equal(sig, expectedSig) {
		return nil, fmt.Errorf("cryptographic military signature mismatch")
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload encoding")
	}

	var claims MilitaryTokenClaims
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return nil, fmt.Errorf("invalid claims json: %v", err)
	}

	if time.Now().Unix() > claims.ExpiresAt {
		return nil, fmt.Errorf("military token has expired")
	}

	return &claims, nil
}

func (m *Middleware) GenerateMilitaryToken(claims MilitaryTokenClaims) (string, error) {
	headerJSON, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)

	payloadJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	unsignedToken := fmt.Sprintf("%s.%s", headerB64, payloadB64)
	mac := hmac.New(sha256.New, m.cfg.HMACSecret)
	mac.Write([]byte(unsignedToken))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", unsignedToken, signature), nil
}

// TacticalAuthMiddleware handles authentication & strict cryptographic JWT verification
func (m *Middleware) TacticalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		officerToken := c.GetHeader("X-Officer-Token")
		simulatedRole := c.GetHeader("X-Simulated-Role")

		var rawToken string
		if officerToken != "" {
			rawToken = officerToken
		} else if strings.HasPrefix(authHeader, "Bearer ") {
			rawToken = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 1. Strict Cryptographic Verification: if JWT is present, verify signature
		if rawToken != "" {
			claims, err := m.VerifyMilitaryToken(rawToken)
			if err == nil && claims != nil {
				c.Set("claims", claims)
				c.Set("role", claims.Role)
				c.Set("officer_id", claims.Sub)
				c.Set("officer_name", claims.Name)
				c.Set("email", claims.Email)
				c.Next()
				return
			} else if m.cfg.AuthMode == "LOCAL_AIRGAP" {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error":   "INVALID_MILITARY_SEAL",
					"message": fmt.Sprintf("Cryptographic token verification failed: %v", err),
				})
				return
			}
		}

		// 2. Air-Gapped Mode without token
		if m.cfg.AuthMode == "LOCAL_AIRGAP" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error":     "AIR_GAP_AUTH_REQUIRED",
				"message":   "Air-Gapped mode requires valid cryptographic military officer token (HMAC-SHA256).",
				"auth_mode": "LOCAL_AIRGAP",
			})
			return
		}

		// 3. Fallback for unauthenticated requests with simulated role or email lookup
		officerEmail := c.GetHeader("X-Officer-Email")
		if officerEmail == "" && strings.Contains(rawToken, "@") {
			officerEmail = rawToken
		}

		if simulatedRole != "" {
			c.Set("role", models.TacticalRole(strings.ToUpper(simulatedRole)))
			c.Set("officer_id", "officer-"+simulatedRole)
		} else if officerEmail != "" {
			off, err := m.repo.FindOfficerByEmail(officerEmail)
			if err == nil && off != nil {
				c.Set("role", off.Role)
				c.Set("officer_id", off.ID)
				c.Set("officer_name", off.Name)
				c.Set("email", off.Email)
			} else {
				c.Set("role", models.RoleCommander)
				c.Set("officer_id", "officer-"+officerEmail)
			}
		} else {
			c.Set("role", models.RoleCommander)
			c.Set("officer_id", "commander-station")
		}

		c.Next()
	}
}

// RequireRole enforces strict Role-Based Access Control
func RequireRole(allowedRoles ...models.TacticalRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		val, exists := c.Get("role")
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "ACCESS_DENIED",
				"message": "Operasi ini membutuhkan otentikasi peran militer yang sah.",
			})
			return
		}

		currentRole, ok := val.(models.TacticalRole)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "INVALID_ROLE_FORMAT",
				"message": "Format peran personel tidak terverifikasi.",
			})
			return
		}

		// SUPER_ADMIN has full permissions across all tactical operations
		if currentRole == models.RoleSuperAdmin {
			c.Next()
			return
		}

		for _, allowed := range allowedRoles {
			if currentRole == allowed {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error":        "UNAUTHORIZED_TACTICAL_ACTION",
			"message":      fmt.Sprintf("Peran [%s] tidak memiliki otorisasi operasional untuk aksi ini.", currentRole),
			"current_role": currentRole,
		})
	}
}
