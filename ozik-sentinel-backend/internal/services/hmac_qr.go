package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"

	"github.com/skip2/go-qrcode"
)

type HMACQRService struct {
	secret []byte
}

func NewHMACQRService(secret []byte) *HMACQRService {
	return &HMACQRService{secret: secret}
}

func (s *HMACQRService) Sign(payload string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *HMACQRService) Verify(payload, signature string) bool {
	expected := s.Sign(payload)
	return hmac.Equal([]byte(expected), []byte(signature))
}

func (s *HMACQRService) CreateTacticalQRPayload(assetID, firmwareHash, vendor, serial string) (string, string) {
	rawPayload := fmt.Sprintf("OZIK-PASSPORT:%s:%s:%s:%s", assetID, firmwareHash, vendor, serial)
	signature := s.Sign(rawPayload)
	return rawPayload, signature
}

func (s *HMACQRService) GenerateQRCodeBase64PNG(content string) (string, error) {
	png, err := qrcode.Encode(content, qrcode.Medium, 300)
	if err != nil {
		return "", err
	}
	b64 := base64.StdEncoding.EncodeToString(png)
	return "data:image/png;base64," + b64, nil
}
