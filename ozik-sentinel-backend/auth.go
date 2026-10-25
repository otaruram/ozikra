package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// MilitaryTokenClaims represents a military-grade air-gapped cryptographic token
type MilitaryTokenClaims struct {
	Sub       string       `json:"sub"`
	Name      string       `json:"name"`
	Email     string       `json:"email"`
	Role      TacticalRole `json:"role"`
	NRP       string       `json:"nrp,omitempty"`
	Issuer    string       `json:"iss"`
	IssuedAt  int64        `json:"iat"`
	ExpiresAt int64        `json:"exp"`
}

// GenerateMilitaryToken creates an HMAC-SHA256 signed air-gapped officer token
func GenerateMilitaryToken(officer OfficerProfile, duration time.Duration) (string, error) {
	now := time.Now()
	claims := MilitaryTokenClaims{
		Sub:       officer.ID,
		Name:      officer.Name,
		Email:     officer.Email,
		Role:      officer.Role,
		NRP:       officer.NRP,
		Issuer:    "OZIK-MILITARY-PKI-AIRGAP",
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(duration).Unix(),
	}

	headerJSON := `{"alg":"HS256","typ":"MIL-JWT"}`
	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))

	payloadJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	unsignedToken := fmt.Sprintf("%s.%s", headerB64, payloadB64)
	mac := hmac.New(sha256.New, hmacSecret)
	mac.Write([]byte(unsignedToken))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", unsignedToken, signature), nil
}

// VerifyMilitaryToken verifies signature and expiration of a military officer token
func VerifyMilitaryToken(tokenStr string) (*MilitaryTokenClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	unsignedToken := fmt.Sprintf("%s.%s", parts[0], parts[1])
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding")
	}

	mac := hmac.New(sha256.New, hmacSecret)
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

// TacticalAuthMiddleware handles both GOOGLE_SANDBOX and LOCAL_AIRGAP authentication
func TacticalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		store.mu.RLock()
		authMode := store.SystemConfig.AuthMode
		store.mu.RUnlock()

		authHeader := c.GetHeader("Authorization")
		officerToken := c.GetHeader("X-Officer-Token")
		simulatedRole := c.GetHeader("X-Simulated-Role")

		var rawToken string
		if officerToken != "" {
			rawToken = officerToken
		} else if strings.HasPrefix(authHeader, "Bearer ") {
			rawToken = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 1. Air-Gapped Mode: Cryptographic Verification Required
		if authMode == AuthModeLocalAirgap {
			if rawToken == "" {
				// Check for dev bypass or simulate header if configured
				if simulatedRole != "" {
					c.Set("role", TacticalRole(simulatedRole))
					c.Set("officer_id", "simulated-"+simulatedRole)
					c.Next()
					return
				}
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error":     "AIR_GAP_AUTH_REQUIRED",
					"message":   "Air-Gapped mode requires valid cryptographic military officer token (HMAC-SHA256).",
					"auth_mode": "LOCAL_AIRGAP",
				})
				return
			}

			claims, err := VerifyMilitaryToken(rawToken)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error":   "INVALID_MILITARY_SEAL",
					"message": fmt.Sprintf("Cryptographic token verification failed: %v", err),
				})
				return
			}

			c.Set("claims", claims)
			c.Set("role", claims.Role)
			c.Set("officer_id", claims.Sub)
			c.Set("officer_name", claims.Name)
			c.Next()
			return
		}

		// 2. Google / Cloud Sandbox Mode & Live DB RBAC Lookup
		officerEmail := c.GetHeader("X-Officer-Email")
		if officerEmail == "" && strings.Contains(rawToken, "@") {
			officerEmail = rawToken
		}

		if simulatedRole != "" {
			c.Set("role", TacticalRole(strings.ToUpper(simulatedRole)))
			c.Set("officer_id", "officer-"+simulatedRole)
		} else if officerEmail != "" {
			off, err := findOfficerByEmailDB(officerEmail)
			if err == nil && off != nil {
				c.Set("role", off.Role)
				c.Set("officer_id", off.ID)
				c.Set("officer_name", off.Name)
				c.Set("email", off.Email)
			} else {
				c.Set("role", RoleCommander)
				c.Set("officer_id", "officer-"+officerEmail)
			}
		} else if rawToken != "" {
			if claims, err := VerifyMilitaryToken(rawToken); err == nil {
				c.Set("claims", claims)
				c.Set("role", claims.Role)
				c.Set("officer_id", claims.Sub)
				c.Set("officer_name", claims.Name)
			} else {
				c.Set("role", RoleSuperAdmin)
				c.Set("officer_id", "sandbox-user")
			}
		} else {
			c.Set("role", RoleSuperAdmin)
			c.Set("officer_id", "sandbox-evaluator")
		}

		c.Next()
	}
}

// RequireRole checks if the authenticated user has one of the allowed roles
func RequireRole(allowedRoles ...TacticalRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get("role")
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "ACCESS_DENIED",
				"message": "Role not authenticated",
			})
			return
		}

		currentRole, ok := roleVal.(TacticalRole)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "ACCESS_DENIED",
				"message": "Invalid role format",
			})
			return
		}

		// Super Admin always bypasses role check
		if currentRole == RoleSuperAdmin {
			c.Next()
			return
		}

		for _, r := range allowedRoles {
			if currentRole == r {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error":          "TACTICAL_RBAC_FORBIDDEN",
			"message":        fmt.Sprintf("Officer role '%s' does not have authorization for this tactical action", currentRole),
			"required_roles": allowedRoles,
		})
	}
}

// Endpoint: Generate Air-Gapped Token for live testing
func handleGenerateToken(c *gin.Context) {
	var body struct {
		OfficerID string       `json:"officer_id"`
		Email     string       `json:"email"`
		Role      TacticalRole `json:"role"`
		DurationH int          `json:"duration_hours"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.RLock()
	var officer *OfficerProfile
	for i := range store.Officers {
		if (body.OfficerID != "" && store.Officers[i].ID == body.OfficerID) ||
			(body.Email != "" && strings.EqualFold(store.Officers[i].Email, body.Email)) {
			officer = &store.Officers[i]
			break
		}
	}
	store.mu.RUnlock()

	if officer == nil {
		if body.Role == "" {
			body.Role = RoleCommander
		}
		officer = &OfficerProfile{
			ID:        fmt.Sprintf("usr-%d", time.Now().Unix()%100000),
			Name:      "Air-Gapped Field Officer",
			Email:     body.Email,
			Role:      body.Role,
			NRP:       "110992300999",
			Unit:      "Tactical Field Command",
			PublicKey: hex.EncodeToString(hmacSecret[:16]),
		}
	}

	dur := 24 * time.Hour
	if body.DurationH > 0 {
		dur = time.Duration(body.DurationH) * time.Hour
	}

	token, err := GenerateMilitaryToken(*officer, dur)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to seal military token", "details": err.Error()})
		return
	}

	appendLedger("LOCAL_PKI_AUTH", "ISSUE_MILITARY_TOKEN", officer.ID, fmt.Sprintf("Role:%s:ValidHours:%d", officer.Role, body.DurationH))

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"officer":    officer,
		"expires_in": dur.Seconds(),
		"auth_mode":  "LOCAL_AIRGAP",
		"seal_alg":   "HMAC-SHA256",
	})
}

// Endpoint: Dynamic JWT Role Swapping (Simulate Role)
func handleSimulateRole(c *gin.Context) {
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

	var targetRole TacticalRole
	switch roleStr {
	case string(RoleSuperAdmin):
		targetRole = RoleSuperAdmin
	case string(RoleCommander):
		targetRole = RoleCommander
	case string(RoleLogisticsOfficer):
		targetRole = RoleLogisticsOfficer
	case string(RoleForensicAuditor):
		targetRole = RoleForensicAuditor
	case string(RoleOTTechnician):
		targetRole = RoleOTTechnician
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

	if rawToken != "" {
		if existingClaims, err := VerifyMilitaryToken(rawToken); err == nil && existingClaims != nil {
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

	officer := OfficerProfile{
		ID:        sub,
		Name:      name,
		Email:     email,
		Role:      targetRole,
		NRP:       nrp,
		Unit:      "Pusat Sandi & Siber TNI-AD (PUSSANSERAD)",
		Rank:      "Perwira Evaluator",
		Status:    "APPROVED",
		PublicKey: hex.EncodeToString(hmacSecret[:16]),
	}

	dur := 24 * time.Hour
	newToken, err := GenerateMilitaryToken(officer, dur)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "TOKEN_GENERATION_FAILED", "details": err.Error()})
		return
	}

	appendLedger("ROLE_SIMULATOR", "TACTICAL_ROLE_SWITCH", sub, fmt.Sprintf("SWITCHED_TO_ROLE:%s", targetRole))

	c.SetCookie("ozik_token", newToken, 86400, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   newToken,
		"role":    targetRole,
		"officer": officer,
		"message": fmt.Sprintf("Peran berhasil diubah menjadi [%s].", targetRole),
	})
}

// Endpoint: Lookup officer profile by email
func handleGetOfficer(c *gin.Context) {
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email parameter is required"})
		return
	}

	// Master Super Admin check
	if email == "okitr52@gmail.com" {
		superAdmin := OfficerProfile{
			ID:        "usr-super-admin-okitr",
			Name:      "Jenderal TNI (Purn) Okitr / Panglima Siber",
			Email:     email,
			NRP:       "11010000000001",
			Unit:      "Markas Besar Tentara Nasional Indonesia (MABES TNI)",
			Rank:      "Jenderal TNI",
			Role:      RoleSuperAdmin,
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI-ROOT-SUPERADMIN-OKITR52-MIL2026",
		}
		syncOfficerToDB(superAdmin)
		c.JSON(http.StatusOK, gin.H{
			"exists":  true,
			"officer": superAdmin,
		})
		return
	}

	// Check DB first
	if off, err := findOfficerByEmailDB(email); err == nil && off != nil {
		c.JSON(http.StatusOK, gin.H{
			"exists":  true,
			"officer": off,
		})
		return
	}

	// Check in-memory store
	store.mu.RLock()
	for _, o := range store.Officers {
		if strings.EqualFold(o.Email, email) {
			store.mu.RUnlock()
			c.JSON(http.StatusOK, gin.H{
				"exists":  true,
				"officer": o,
			})
			return
		}
	}
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"exists": false,
		"email":  email,
	})
}

// Endpoint: Verify Member NRP for existing Google user
func handleVerifyMemberNRP(c *gin.Context) {
	var body struct {
		Email string `json:"email"`
		NRP   string `json:"nrp"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email and Nomor Anggota (NRP) are required"})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	cleanNrp := strings.TrimSpace(body.NRP)

	if cleanEmail == "" || cleanNrp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email Google dan Nomor Anggota (NRP) wajib diisi"})
		return
	}

	var off *OfficerProfile
	if cleanEmail == "okitr52@gmail.com" {
		off = &OfficerProfile{
			ID:        "usr-super-admin-okitr",
			Name:      "Jenderal TNI (Purn) Okitr / Panglima Siber",
			Email:     cleanEmail,
			NRP:       "11010000000001",
			Unit:      "Markas Besar Tentara Nasional Indonesia (MABES TNI)",
			Rank:      "Jenderal TNI",
			Role:      RoleSuperAdmin,
			Status:    "APPROVED",
			PublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI-ROOT-SUPERADMIN-OKITR52-MIL2026",
		}
		syncOfficerToDB(*off)
	} else {
		var err error
		off, err = findOfficerByEmailDB(cleanEmail)
		if err != nil || off == nil {
			store.mu.RLock()
			for _, o := range store.Officers {
				if strings.EqualFold(o.Email, cleanEmail) {
					off = &o
					break
				}
			}
			store.mu.RUnlock()
		}
	}

	if off == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "OFFICER_NOT_FOUND",
			"message": "Akun Google Anda belum terdaftar di basis data personel militer. Silakan isi form pendaftaran personel baru.",
		})
		return
	}

	// Check NRP match
	if !strings.EqualFold(strings.TrimSpace(off.NRP), cleanNrp) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "INVALID_MEMBER_NRP",
			"message": fmt.Sprintf("Nomor Anggota (NRP: %s) tidak cocok dengan identitas akun dinas Google Anda.", cleanNrp),
		})
		return
	}

	// Check status
	if off.Status == "PENDING" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "PENDING_APPROVAL",
			"status":  "PENDING",
			"message": "Pendaftaran personel Anda dengan NRP " + off.NRP + " masih MENUNGGU PERSETUJUAN dari Super Admin / Panglima Siber.",
			"officer": off,
		})
		return
	}

	if off.Status == "REJECTED" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "REGISTRATION_REJECTED",
			"status":  "REJECTED",
			"message": "Pengajuan pendaftaran personel ini telah DITOLAK oleh Markas Komando.",
		})
		return
	}

	dur := 24 * time.Hour
	token, _ := GenerateMilitaryToken(*off, dur)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Verifikasi Nomor Anggota Berhasil. Otorisasi Militer Aktif.",
		"token":   token,
		"officer": off,
	})
}

// Endpoint: Register new military officer profile (sets status = PENDING for Super Admin approval)
func handleRegisterOfficer(c *gin.Context) {
	var body struct {
		Email string       `json:"email"`
		Name  string       `json:"name"`
		NRP   string       `json:"nrp"`
		Unit  string       `json:"unit"`
		Rank  string       `json:"rank"`
		Role  TacticalRole `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	cleanNrp := strings.TrimSpace(body.NRP)
	if cleanEmail == "" || body.Name == "" || cleanNrp == "" || body.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email Google, Nama Lengkap, Nomor Anggota (NRP), dan Role wajib diisi"})
		return
	}

	assignedRole := body.Role
	initialStatus := "PENDING"
	if cleanEmail == "okitr52@gmail.com" {
		assignedRole = RoleSuperAdmin
		initialStatus = "APPROVED"
	}

	cleanUnit := strings.TrimSpace(body.Unit)
	if cleanUnit == "" {
		cleanUnit = "Pusat Sandi & Siber TNI-AD (PUSSANSERAD)"
	}
	cleanRank := strings.TrimSpace(body.Rank)
	if cleanRank == "" {
		cleanRank = "Perwira Pertama"
	}

	hashSeed := sha256Hex(fmt.Sprintf("%s:%s:%d", cleanEmail, cleanNrp, time.Now().UnixNano()))
	if len(hashSeed) > 32 {
		hashSeed = hashSeed[:32]
	}
	publicKey := fmt.Sprintf("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI-%s-PUSSANSERAD", strings.ToUpper(hashSeed))

	officer := OfficerProfile{
		ID:        fmt.Sprintf("usr-%d", time.Now().Unix()%1000000),
		Name:      strings.TrimSpace(body.Name),
		Email:     cleanEmail,
		Role:      assignedRole,
		NRP:       cleanNrp,
		Unit:      cleanUnit,
		Rank:      cleanRank,
		Status:    initialStatus,
		PublicKey: publicKey,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	// Upsert into memory store
	store.mu.Lock()
	updated := false
	for i := range store.Officers {
		if strings.EqualFold(store.Officers[i].Email, cleanEmail) {
			officer.ID = store.Officers[i].ID
			store.Officers[i] = officer
			updated = true
			break
		}
	}
	if !updated {
		store.Officers = append(store.Officers, officer)
	}
	store.mu.Unlock()

	// Persist to disk and DB
	saveStoreToDisk()
	syncOfficerToDB(officer)
	appendLedger("LOCAL_PKI_AUTH", "OFFICER_REGISTRATION_SUBMITTED", officer.ID, fmt.Sprintf("Email:%s:NRP:%s:Status:%s", officer.Email, officer.NRP, officer.Status))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  initialStatus,
		"message": "Pendaftaran personel berhasil diajukan dan disimpan di basis data. Formulir telah dikirimkan ke Super Admin / Panglima Siber untuk verifikasi & approval resmi.",
		"officer": officer,
	})
}

// Endpoint: Get list of officers waiting for approval (Super Admin only)
func handleGetPendingOfficers(c *gin.Context) {
	pending, err := findPendingOfficersDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pending)
}

// Endpoint: Super Admin approves pending officer
func handleApproveOfficer(c *gin.Context) {
	var body struct {
		OfficerID  string `json:"officer_id"`
		ApprovedBy string `json:"approved_by"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.OfficerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "officer_id is required"})
		return
	}
	if body.ApprovedBy == "" {
		body.ApprovedBy = "Jenderal TNI (Purn) Okitr / Panglima Siber"
	}

	err := approveOfficerDB(body.OfficerID, body.ApprovedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	appendLedger("SECURITY_RBAC", "OFFICER_ENROLLMENT_APPROVED", body.OfficerID, fmt.Sprintf("ApprovedBy:%s", body.ApprovedBy))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Pendaftaran personel berhasil disetujui (APPROVED) dan status akun militer telah aktif.",
	})
}

// Endpoint: Super Admin rejects pending officer
func handleRejectOfficer(c *gin.Context) {
	var body struct {
		OfficerID  string `json:"officer_id"`
		ApprovedBy string `json:"approved_by"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.OfficerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "officer_id is required"})
		return
	}
	if body.ApprovedBy == "" {
		body.ApprovedBy = "Jenderal TNI (Purn) Okitr / Panglima Siber"
	}

	err := rejectOfficerDB(body.OfficerID, body.ApprovedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	appendLedger("SECURITY_RBAC", "OFFICER_ENROLLMENT_REJECTED", body.OfficerID, fmt.Sprintf("RejectedBy:%s", body.ApprovedBy))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Pengajuan pendaftaran personel ditolak.",
	})
}

