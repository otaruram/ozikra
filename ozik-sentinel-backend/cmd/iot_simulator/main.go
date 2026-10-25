package main

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ANSI Terminal Colors for Military Tactical Display
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorCyan   = "\033[36m"
	colorWhite  = "\033[37m"
	colorBold   = "\033[1m"
	bgRed       = "\033[41m"
	bgGreen     = "\033[42m"
	bgDarkGray  = "\033[100m"
)

type DeviceProfile struct {
	AssetID      string  `json:"asset_id"`
	AliasID      string  `json:"alias_id"`
	Name         string  `json:"name"`
	QRHash       string  `json:"qr_hash"`
	FirmwareHash string  `json:"firmware_hash"`
	BaselineFW   string  `json:"baseline_fw"`
	Protocol     string  `json:"protocol"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	BaseTemp     float64 `json:"base_temp"`
	BaseVolt     float64 `json:"base_volt"`
	BasePower    float64 `json:"base_power"`
	BaseTxKbps   float64 `json:"base_tx_kbps"`
	Isolated     bool    `json:"isolated"`
}

type IoTCommand struct {
	ID       string `json:"id"`
	AssetID  string `json:"asset_id"`
	Action   string `json:"action"`
	IssuedAt string `json:"issued_at"`
	IssuedBy string `json:"issued_by"`
	Executed bool   `json:"executed"`
}

var (
	devices = []DeviceProfile{
		{
			AssetID:      "AST-RADAR-01",
			AliasID:      "RADAR-AVIONICS-01",
			Name:         "Modul Radar Avionik Puspenerbad (OT Alutsista)",
			QRHash:       "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			FirmwareHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			BaselineFW:   "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			Protocol:     "MIL-STD-1553 Avionics Bus",
			Lat:          -6.2655,
			Lng:          106.8209, // Pondok Cabe / Jakarta Airbase
			BaseTemp:     52.3,
			BaseVolt:     28.0,
			BasePower:    58.4,
			BaseTxKbps:   1280.0,
			Isolated:     false,
		},
		{
			AssetID:      "ARMORY-ENV-02",
			AliasID:      "ARMORY-ENV-02",
			Name:         "Sensor Suhu & Kelembaban Gudang Amunisi (OT Safety)",
			QRHash:       "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1",
			FirmwareHash: "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283",
			BaselineFW:   "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283",
			Protocol:     "LoRa Taktis / RS-485",
			Lat:          -6.9147,
			Lng:          107.6098, // PT Pindad Armory / Bandung
			BaseTemp:     22.4,
			BaseVolt:     12.1,
			BasePower:    35.0,
			BaseTxKbps:   64.0,
			Isolated:     false,
		},
		{
			AssetID:      "AST-RADIO-VHF",
			AliasID:      "TAC-RADIO-03",
			Name:         "Gateway Radio Komunikasi Taktis Harris Falcon (OT Comms)",
			QRHash:       "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			FirmwareHash: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			BaselineFW:   "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
			Protocol:     "Tactical VHF / IP Crypto",
			Lat:          -7.2575,
			Lng:          112.7521, // Koarmada II / Surabaya
			BaseTemp:     44.8,
			BaseVolt:     24.0,
			BasePower:    52.0,
			BaseTxKbps:   850.0,
			Isolated:     false,
		},
	}

	mu          sync.Mutex
	targetURL   string
	currentMode string
	hmacSecret  []byte
	httpClient  = &http.Client{Timeout: 5 * time.Second}
)

func init() {
	sec := os.Getenv("SERVER_HMAC_SECRET")
	if sec == "" {
		sec = os.Getenv("HMAC_SECRET")
	}
	if sec == "" {
		sec = "OZIK-MILITARY-GRADE-HMAC-SHA256-KEY-2026"
	}
	hmacSecret = []byte(sec)
}

func printBanner() {
	fmt.Print(colorCyan + colorBold)
	fmt.Println(`
 ==============================================================================
   ___ ______ _____ _  __     _____ _____ _   _ _____ ___ _   _ _____ _     
  / _ \___  /_   _| |/ /    / ____| ____| \ | |_   _|_ _| \ | | ____| |    
 | | | | / /  | | | ' /____| (___ |  _| |  \| | | |  | ||  \| |  _| | |    
 | |_| |/ /_ _| |_| . \_____|\___ \| |___| |\  | | |  | || |\  | |___| |___ 
  \___//____|_____|_|\_\    |_____/|_____|_| \_| |_| |___|_| \_|_____|_____|
           TACTICAL IoT/OT TELEMETRY & ATTACK SIMULATOR (TNI AD)
 ==============================================================================` + colorReset)
	fmt.Printf("%s[+] Target Backend Gateway%s : %s\n", colorBold, colorReset, targetURL)
	fmt.Printf("%s[+] Operational Mode      %s : %s\n", colorBold, colorReset, currentMode)
	fmt.Printf("%s[+] Monitored OT Assets   %s : %d Critical Military Nodes\n", colorBold, colorReset, len(devices))
	fmt.Println("------------------------------------------------------------------------------")
}

func printMenu() {
	fmt.Println(colorYellow + colorBold + "\n[INTERACTIVE SIMULATION COMMANDS]" + colorReset)
	fmt.Println("  [1] Normal Telemetry Stream (Heartbeat every 2s, nominal metrics)")
	fmt.Println("  [2] Authorized Maintenance Check-In (Valid QR Scan -> Firmware Update)")
	fmt.Println("  [3] Attack: Rogue Firmware Injection (0xDEAD_BACKDOOR_V2 -> Critical SIEM Alert)")
	fmt.Println("  [4] Attack: Sensor Spoofing & Thermal Runaway on ARMORY-ENV-02")
	fmt.Println("  [5] Trigger Manual Kill-Switch Test")
	fmt.Println("  [r] Reset all devices to nominal state")
	fmt.Println("  [q] Quit simulator")
	fmt.Print(colorBold + "Select Action > " + colorReset)
}

func calculateHMAC(payload string) string {
	mac := hmac.New(sha256.New, hmacSecret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func sendHTTPRequest(method, endpoint string, body interface{}) ([]byte, int, error) {
	url := strings.TrimRight(targetURL, "/") + endpoint
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reqBody = bytes.NewBuffer(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Ozik-Tactical-Simulator-Go/2.0")
	req.Header.Set("X-Officer-Token", "TOKEN-TNI-AD-SIMULATOR")
	req.Header.Set("X-Simulated-Role", "OT_TECHNICIAN")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	resBytes, err := io.ReadAll(resp.Body)
	return resBytes, resp.StatusCode, err
}

// performQRCheckIn authorizes maintenance window via backend
func performQRCheckIn(dev DeviceProfile, technicianID string) bool {
	fmt.Printf("\n%s[*] SCANNING TACTICAL QR CODE PASSPORT...%s\n", colorCyan+colorBold, colorReset)
	fmt.Printf("    Node        : %s (%s)\n", dev.Name, dev.AssetID)
	fmt.Printf("    Technician  : %s\n", technicianID)
	fmt.Printf("    QR Hash     : %s\n", dev.QRHash)

	body := map[string]string{
		"assetQrHash":  dev.QRHash,
		"qrHash":       dev.QRHash,
		"technicianId": technicianID,
		"technician":   technicianID,
	}

	resBytes, status, err := sendHTTPRequest("POST", "/api/v1/siem/qr-checkin", body)
	if err != nil || status != http.StatusOK {
		// Fallback to direct route if needed
		resBytes, status, err = sendHTTPRequest("POST", "/siem/check-in", body)
	}

	if err == nil && status == http.StatusOK {
		var resp struct {
			ID        string `json:"id"`
			Status    string `json:"status"`
			ExpiresAt string `json:"expiresAt"`
			WindowID  string `json:"window_id"`
		}
		_ = json.Unmarshal(resBytes, &resp)
		expires := resp.ExpiresAt
		if expires == "" {
			expires = time.Now().Add(15 * time.Minute).Format(time.RFC3339)
		}
		fmt.Printf("%s[SUCCESS] Maintenance Window OPENED officially!%s\n", colorGreen+colorBold, colorReset)
		fmt.Printf("    Window ID   : %s\n", resp.ID)
		fmt.Printf("    Expires At  : %s\n", expires)
		return true
	}

	fmt.Printf("%s[ERROR] Failed to authorize QR check-in: status=%d err=%v%s\n", colorRed, status, err, colorReset)
	return false
}

// sendTelemetry sends one telemetry frame for a device
func sendTelemetry(dev DeviceProfile, temp float64, volt float64, fwHash string, txKbps float64, power float64, isTamper bool) {
	if dev.Isolated {
		fmt.Printf("%s[AIR-GAP ISOLATED] Node %s is severed. Telemetry dropped locally.%s\n", colorYellow, dev.AssetID, colorReset)
		return
	}

	timestamp := time.Now().UTC()
	signaturePayload := fmt.Sprintf("%s:%.2f:%s", dev.AssetID, power, timestamp.Format(time.RFC3339))
	sig := calculateHMAC(signaturePayload)

	payload := map[string]interface{}{
		"asset_id":        dev.AssetID,
		"device_id":       dev.AssetID,
		"timestamp":       timestamp.Format(time.RFC3339),
		"temperature_c":   temp,
		"voltage_v":       volt,
		"firmware_hash":   fwHash,
		"network_tx_kbps": txKbps,
		"signal_power":    power,
		"lat":             dev.Lat,
		"lng":             dev.Lng,
		"qr_hash":         dev.QRHash,
		"technician_id":   "OT_TACTICAL_DAEMON",
		"status":          "ACTIVE",
		"signature":       sig,
	}

	resBytes, status, err := sendHTTPRequest("POST", "/api/v1/siem/telemetry", payload)
	if err != nil {
		fmt.Printf("%s[!] Network error connecting to backend: %v%s\n", colorRed, err, colorReset)
		return
	}

	var resp struct {
		Verdict       string `json:"verdict"`
		Severity      string `json:"severity"`
		Authorization string `json:"authorization"`
		Message       string `json:"message"`
	}
	_ = json.Unmarshal(resBytes, &resp)

	timeLabel := time.Now().Format("15:04:05")
	fwDisplay := fwHash
	if len(fwDisplay) > 16 {
		fwDisplay = fwDisplay[:16] + "..."
	}

	if resp.Verdict == "ANOMALY" || isTamper || status >= 400 || resp.Severity == "CRITICAL" {
		fmt.Printf("[%s] %s %s [%s] Temp: %.1f C | Tx: %.0f Kbps | FW: %s\n",
			timeLabel,
			bgRed+colorWhite+colorBold+" CRITICAL ALERT "+colorReset,
			colorBold+dev.AssetID+colorReset,
			resp.Authorization,
			temp, txKbps, fwDisplay,
		)
		fmt.Printf("       -> SIEM: %s%s%s (Lat: %.4f, Lng: %.4f)\n", colorRed+colorBold, resp.Message, colorReset, dev.Lat, dev.Lng)
	} else {
		authBadge := resp.Authorization
		if authBadge == "" {
			authBadge = "NOMINAL"
		}
		fmt.Printf("[%s] %s %s | Temp: %.1f C | Volt: %.1f V | Tx: %.0f Kbps | Status: %s\n",
			timeLabel,
			colorGreen+"[NOMINAL]"+colorReset,
			colorBold+dev.AssetID+colorReset,
			temp, volt, txKbps, authBadge,
		)
	}
}

// pollKillSwitch checks if backend has ordered physical node isolation
func pollKillSwitch() {
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		mu.Lock()
		for i := range devices {
			dev := &devices[i]
			if dev.Isolated {
				continue
			}

			// 1. Poll IoT command queue for the device
			endpoints := []string{
				fmt.Sprintf("/api/v1/iot/commands/%s", dev.AssetID),
				fmt.Sprintf("/api/v1/iot/commands/%s", dev.AliasID),
			}

			commandFound := false
			for _, ep := range endpoints {
				resBytes, status, err := sendHTTPRequest("GET", ep, nil)
				if err == nil && status == http.StatusOK {
					var resp struct {
						Commands []IoTCommand `json:"commands"`
					}
					if err := json.Unmarshal(resBytes, &resp); err == nil && len(resp.Commands) > 0 {
						for _, cmd := range resp.Commands {
							if strings.Contains(strings.ToUpper(cmd.Action), "ISOLATE") || strings.Contains(strings.ToUpper(cmd.Action), "KILL") {
								dev.Isolated = true
								commandFound = true
								printKillSwitchReceived(dev.AssetID, dev.Name, cmd.IssuedBy)
								break
							}
						}
					}
				}
				if commandFound {
					break
				}
			}

			// 2. Cross-check asset table status if not triggered by queue
			if !dev.Isolated {
				resBytes, status, err := sendHTTPRequest("GET", fmt.Sprintf("/api/v1/assets?search=%s", dev.AssetID), nil)
				if err == nil && status == http.StatusOK {
					var assets []struct {
						ID             string `json:"id"`
						Status         string `json:"status"`
						IntegrityState string `json:"integrity_state"`
					}
					if err := json.Unmarshal(resBytes, &assets); err == nil {
						for _, a := range assets {
							if a.ID == dev.AssetID && (a.Status == "ISOLATED" || a.IntegrityState == "COMPROMISED") {
								dev.Isolated = true
								printKillSwitchReceived(dev.AssetID, dev.Name, "COMMANDER_CONSOLE")
								break
							}
						}
					}
				}
			}
		}
		mu.Unlock()
	}
}

func printKillSwitchReceived(assetID, name, issuedBy string) {
	fmt.Print("\n" + bgRed + colorWhite + colorBold)
	fmt.Println(" [KILL-SWITCH RECEIVED] Physical Relay Cut — Asset Air-Gapped ")
	fmt.Print(colorReset)
	fmt.Print(colorRed + colorBold)
	fmt.Println("================================================================================")
	fmt.Printf(" TARGET ASSET NODE : %s (%s)\n", name, assetID)
	fmt.Printf(" COMMAND ORIGIN    : %s (Pusat Siber TNI AD - PUSSIBERAD)\n", issuedBy)
	fmt.Println(" HARDWARE RELAY    : POWER SEVERED [Pin GPIO-17 LOW / Relay NC Cut]")
	fmt.Println(" LOCAL NETWORK     : RF Transmission Dropped, Local Memory Locked")
	fmt.Println("================================================================================" + colorReset + "\n")
}

// RunNormalLoop continuously broadcasts healthy telemetries
func RunNormalLoop(stopChan <-chan struct{}) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			return
		case <-ticker.C:
			mu.Lock()
			activeCount := 0
			for _, dev := range devices {
				if dev.Isolated {
					continue
				}
				activeCount++
				// Jitter telemetry values around baseline
				temp := dev.BaseTemp + (rand.Float64()*1.6 - 0.8)
				volt := dev.BaseVolt + (rand.Float64()*0.4 - 0.2)
				power := dev.BasePower + (rand.Float64()*2.0 - 1.0)
				tx := dev.BaseTxKbps + (rand.Float64()*50.0 - 25.0)

				sendTelemetry(dev, temp, volt, dev.FirmwareHash, tx, power, false)
			}
			if activeCount == 0 {
				fmt.Println(colorYellow + "[SIMULATOR IDLE] All monitored nodes are isolated. Telemetry transmissions paused." + colorReset)
			}
			mu.Unlock()
		}
	}
}

// ExecuteAuthorizedUpdate simulates valid QR check-in followed by firmware flashing
func ExecuteAuthorizedUpdate() {
	mu.Lock()
	targetDev := &devices[0] // Radar Avionik
	mu.Unlock()

	technician := "Sgt. Pratama (NRP 310892 - Puspenerbad)"
	ok := performQRCheckIn(*targetDev, technician)
	if !ok {
		fmt.Println(colorRed + "[!] Maintenance QR check-in rejected by Zero-Trust gateway." + colorReset)
		return
	}

	fmt.Printf("\n%s[*] FLASHING NEW AUTHORIZED FIRMWARE v2.5.0-SECURE...%s\n", colorCyan, colorReset)
	time.Sleep(1 * time.Second)

	newFW := "0x7F89_FIRMWARE_V25_VERIFIED_SIGNATURE"
	mu.Lock()
	targetDev.FirmwareHash = newFW
	mu.Unlock()

	fmt.Printf("%s[+] Firmware flashed successfully. Streaming telemetry within authorized maintenance window...%s\n", colorGreen, colorReset)
	sendTelemetry(*targetDev, 56.2, 28.1, newFW, 1420.0, 61.5, false)
}

// ExecuteFirmwareAttack simulates an adversary rogue firmware write at 02:14 WIB
func ExecuteFirmwareAttack() {
	mu.Lock()
	targetDev := &devices[0] // Radar Avionik
	targetDev.FirmwareHash = "0xDEAD_BACKDOOR_V2"
	mu.Unlock()

	fmt.Println("\n" + bgRed + colorWhite + colorBold + " [!] SIMULATING ATTACK: ROGUE FIRMWARE OVERWRITE WITHOUT QR CHECK-IN " + colorReset)
	fmt.Printf("    Target Device   : %s (%s)\n", targetDev.Name, targetDev.AssetID)
	fmt.Printf("    Injected Hash   : %s0xDEAD_BACKDOOR_V2%s\n", colorRed+colorBold, colorReset)
	fmt.Printf("    Simulated Time  : 02:14:32 WIB (Jam Tidak Wajar)\n")
	fmt.Printf("    QR Auth Window  : %sNONE / EXPIRED (UNAUTHORIZED)%s\n", colorRed, colorReset)
	fmt.Println("    Sending rogue telemetry payload...")

	// Injected rogue firmware + traffic spike
	sendTelemetry(*targetDev, 71.5, 29.4, "0xDEAD_BACKDOOR_V2", 6850.0, 94.2, true)
}

// ExecuteSensorSpoofAttack simulates thermal runaway & power surge
func ExecuteSensorSpoofAttack() {
	mu.Lock()
	targetDev := &devices[1] // ARMORY-ENV-02
	mu.Unlock()

	fmt.Println("\n" + bgRed + colorWhite + colorBold + " [!] SIMULATING SENSOR SPOOFING & THERMAL RUNAWAY " + colorReset)
	fmt.Printf("    Target Sensor   : %s (%s)\n", targetDev.Name, targetDev.AssetID)
	fmt.Printf("    Injected Temp   : %s88.5 C (Critical threshold: 75 C)%s\n", colorRed+colorBold, colorReset)
	fmt.Printf("    Signal Power    : %s98.4 mA (Surge)%s\n", colorRed, colorReset)

	sendTelemetry(*targetDev, 88.5, 14.8, targetDev.FirmwareHash, 1850.0, 98.4, true)
}

func resetDevices() {
	mu.Lock()
	defer mu.Unlock()
	for i := range devices {
		devices[i].Isolated = false
		devices[i].FirmwareHash = devices[i].BaselineFW
	}
	fmt.Println(colorGreen + colorBold + "\n[+] All devices reset to NOMINAL operational state!" + colorReset)
}

func main() {
	defaultTarget := os.Getenv("BACKEND_URL")
	if defaultTarget == "" {
		defaultTarget = "http://localhost:8080"
	}

	targetFlag := flag.String("target", defaultTarget, "Target OZIK-SENTINEL backend URL (e.g. http://localhost:8080 or https://ozik-sentinel.onrender.com)")
	modeFlag := flag.String("mode", "", "Execution mode: normal | authorized-maint | attack | attack-spoof")
	interactiveFlag := flag.Bool("interactive", false, "Run in interactive keyboard-controlled mode")
	flag.Parse()

	targetURL = *targetFlag
	currentMode = *modeFlag
	if currentMode == "" {
		currentMode = "normal"
	}

	printBanner()

	// Start background Kill-Switch listener
	go pollKillSwitch()

	// Direct CLI Mode Execution
	switch strings.ToLower(currentMode) {
	case "authorized-maint", "authorized-update":
		ExecuteAuthorizedUpdate()
		// After executing, continue streaming telemetry in daemon mode
		stopChan := make(chan struct{})
		go RunNormalLoop(stopChan)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		close(stopChan)
		fmt.Println("\n[+] Simulator terminated gracefully.")
		return

	case "attack", "attack-firmware":
		ExecuteFirmwareAttack()
		// Keep streaming so attack is visible on dashboard live
		stopChan := make(chan struct{})
		go RunNormalLoop(stopChan)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		close(stopChan)
		fmt.Println("\n[+] Simulator terminated gracefully.")
		return

	case "attack-spoof":
		ExecuteSensorSpoofAttack()
		stopChan := make(chan struct{})
		go RunNormalLoop(stopChan)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		close(stopChan)
		fmt.Println("\n[+] Simulator terminated gracefully.")
		return
	}

	// Normal Daemon or Interactive Mode
	stopChan := make(chan struct{})
	go RunNormalLoop(stopChan)

	if !*interactiveFlag && *modeFlag != "" {
		// Run daemon until interrupted
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		close(stopChan)
		fmt.Println("\n[+] Simulator terminated gracefully.")
		return
	}

	// Interactive Loop
	reader := bufio.NewReader(os.Stdin)
	for {
		printMenu()
		input, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		cmd := strings.TrimSpace(input)

		switch cmd {
		case "1":
			fmt.Println(colorGreen + "\n[*] Streaming normal telemetry..." + colorReset)
		case "2":
			ExecuteAuthorizedUpdate()
		case "3":
			ExecuteFirmwareAttack()
		case "4":
			ExecuteSensorSpoofAttack()
		case "5":
			mu.Lock()
			targetDev := &devices[0]
			targetDev.Isolated = true
			mu.Unlock()
			printKillSwitchReceived(targetDev.AssetID, targetDev.Name, "MANUAL_OPERATOR_TEST")
		case "r", "R":
			resetDevices()
		case "q", "Q":
			close(stopChan)
			fmt.Println("\n[+] Simulator shutting down.")
			return
		default:
			fmt.Println(colorYellow + "Unknown command. Press 1-5, r, or q." + colorReset)
		}
		time.Sleep(500 * time.Millisecond)
	}
}
