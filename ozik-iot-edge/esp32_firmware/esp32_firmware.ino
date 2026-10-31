/*
 ===============================================================================
 OZIK-SENTINEL :: TACTICAL IoT EDGE DONGLE (ESP32 FIRMWARE)
 Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Kartika Cyber Hackathon 2026
 ===============================================================================
 Perangkat Hardware Dongle Taktis Lapangan:
 1. Menghubungkan langsung ke WiFi (Hotspot HP / Router).
 2. Mengirim detak jantung telemetri sensor periodik ke Cloud Backend Render.
 3. Memonitor perintah darurat Panglima: "AIR-GAP KILL-SWITCH / RELAY CUT".
 4. Mengendalikan modul Relai 5V (pemutus fisik alutsista) & Active Buzzer 5V (sirine).
 ===============================================================================
 PINOUT ESP32 DEVKIT V1:
 - PIN D23 (GPIO 23) -> IN Relai 5V (Relay Control)
 - PIN D19 (GPIO 19) -> Pin Positif (+) Active Buzzer 5V
 - PIN D18 (GPIO 18) -> Anoda (+) LED Merah (Status Alarm / Isolasi)
 - PIN D5  (GPIO 5)  -> Anoda (+) LED Hijau (Status Operasional Nominal)
 - PIN VIN / 5V      -> VCC Relai 5V & VCC Buzzer
 - PIN GND           -> GND Relai, GND Buzzer, & Katoda (-) LED
 ===============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ----------------- KONFIGURASI WIFI -----------------
// Ganti dengan nama Hotspot HP / WiFi dan Password Anda:
const char* WIFI_SSID     = "HOTSPOT_TNI_AD";
const char* WIFI_PASSWORD = "password123";

// ----------------- KONFIGURASI BACKEND CLOUD --------
// Target Server OZIK-SENTINEL PUSSIBERAD:
const char* BACKEND_HOST = "https://ozik-sentinel.onrender.com";
const char* ASSET_ID     = "AST-RADAR-01"; // Target Alutsista: Radar Avionik Taktis

// ----------------- PIN DEFINITIONS ------------------
const int PIN_RELAY   = 23; // Modul Relai 5V (LOW = Sambung, HIGH = Putus Air-gap)
const int PIN_BUZZER  = 19; // Active Buzzer 5V (Sirine Peringatan)
const int PIN_LED_RED = 18; // LED Merah (Indikator Kill-Switch Aktif)
const int PIN_LED_GRN = 5;  // LED Hijau (Indikator Normal)

// Status Internal
bool isIsolated = false;
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL = 5000; // Kirim tiap 5 detik

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  OZIK-SENTINEL :: TACTICAL IoT HARDWARE DONGLE BOOT   ");
  Serial.println("  PUSSIBERAD - KARTIKA CYBER HACKATHON 2026            ");
  Serial.println("=======================================================");

  // Inisialisasi Pin GPIO
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_GRN, OUTPUT);

  // Default Kondisi: Normal Operasional (Relai Nyambung, Buzzer Diam, LED Hijau Nyala)
  digitalWrite(PIN_RELAY, LOW);    // Active LOW relay module: LOW = Closed / Connected
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_LED_GRN, HIGH);

  // Nada Uji Awal (Self-test beep)
  beep(100);
  delay(100);
  beep(100);

  // Hubungkan ke WiFi
  connectWiFi();
}

void loop() {
  // Pastikan WiFi tetap tersambung
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // 1. Periksa Perintah Remote Kill-Switch dari Komandan (Polling Cloud)
  checkRemoteKillSwitch();

  // 2. Kirim Detak Jantung Telemetri Otomatis
  if (millis() - lastTelemetryTime >= TELEMETRY_INTERVAL) {
    lastTelemetryTime = millis();
    if (!isIsolated) {
      sendTelemetry();
    }
  }

  // 3. Terima Kontrol Serial USB (Jika dikendalikan via Laptop / Script Python)
  handleSerialInput();

  delay(1000);
}

// ----------------------------------------------------
// FUNGSI KONEKSI WIFI
// ----------------------------------------------------
void connectWiFi() {
  Serial.print("[WiFi] Menghubungkan ke ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_LED_GRN, !digitalRead(PIN_LED_GRN)); // Kedip saat connecting
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Terhubung!");
    Serial.print("[WiFi] Alamat IP ESP32: ");
    Serial.println(WiFi.localIP());
    digitalWrite(PIN_LED_GRN, HIGH);
  } else {
    Serial.println("\n[WiFi] Belum tersambung (Gunakan Hotspot HP atau Kontrol Serial USB)");
  }
}

// ----------------------------------------------------
// NADA BEEP ACTIVE BUZZER
// ----------------------------------------------------
void beep(int durationMs) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(durationMs);
  digitalWrite(PIN_BUZZER, LOW);
}

// ----------------------------------------------------
// EKSEKUSI AIR-GAP KILL-SWITCH (PEMUTUS RELAI FISIK)
// ----------------------------------------------------
void triggerAirGapKillSwitch(String source) {
  isIsolated = true;
  Serial.println("\n*******************************************************");
  Serial.println("  [!] PERINGATAN DARURAT: PERINTAH KILL-SWITCH DITERIMA!");
  Serial.println("  Sumber Perintah: " + source);
  Serial.println("  TINDAKAN: MEMUTUS RELAI FISIK ALUTSISTA (AIR-GAP)...");
  Serial.println("*******************************************************");

  // 1. Putus Sambungan Relai Fisik
  digitalWrite(PIN_RELAY, HIGH); // Open Circuit / Air-Gap Cut

  // 2. Indikator Visual & Audio Darurat Militer
  digitalWrite(PIN_LED_GRN, LOW);
  digitalWrite(PIN_LED_RED, HIGH);

  // Bunyikan Sirine Peringatan Klaxon
  for (int i = 0; i < 4; i++) {
    beep(250);
    delay(100);
  }
}

// ----------------------------------------------------
// PEMULIHAN STATUS OPERASIONAL NORMAL
// ----------------------------------------------------
void resetToNormal() {
  isIsolated = false;
  Serial.println("\n[+] PEMULIHAN: Alutsista kembali ke status OPERATIONAL.");
  digitalWrite(PIN_RELAY, LOW); // Sambungkan kembali relai
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_LED_GRN, HIGH);
  beep(150);
}

// ----------------------------------------------------
// CEK PERINTAH CLOUD RENDER (/api/v1/iot/commands/:assetId)
// ----------------------------------------------------
void checkRemoteKillSwitch() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip validasi SSL cert untuk kemudahan prototype

  HTTPClient http;
  String url = String(BACKEND_HOST) + "/api/v1/iot/commands/" + String(ASSET_ID);

  if (http.begin(client, url)) {
    http.setTimeout(4000);
    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
      String response = http.getString();
      // Periksa apakah ada perintah "ISOLATE" dalam respon JSON
      if (response.indexOf("ISOLATE") >= 0 || response.indexOf("KILL") >= 0) {
        triggerAirGapKillSwitch("Command Center Web Dashboard");
      }
    }
    http.end();
  }
}

// ----------------------------------------------------
// KIRIM TELEMETRI SENSOR PERIODIK KE CLOUD SIEM
// ----------------------------------------------------
void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(BACKEND_HOST) + "/api/v1/siem/telemetry";

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");

    // Simulasi sensor arus & suhu nominal
    float suhu = 48.0 + (random(0, 40) / 10.0);
    float volt = 28.1 + (random(-2, 2) / 10.0);
    float tx   = 1240.0 + random(-20, 20);

    String jsonBody = "{"
      "\"asset_id\":\"" + String(ASSET_ID) + "\","
      "\"temperature_c\":" + String(suhu, 1) + ","
      "\"voltage_v\":" + String(volt, 1) + ","
      "\"network_tx_kbps\":" + String(tx, 0) + ","
      "\"firmware_hash\":\"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\","
      "\"qr_hash\":\"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\""
    "}";

    int httpCode = http.POST(jsonBody);
    if (httpCode > 0) {
      Serial.println("[TELEMETRY] Terkirim -> SIEM Status: " + String(httpCode));
    }
    http.end();
  }
}

// ----------------------------------------------------
// KONTROL VIA USB SERIAL (UNTUK PENGUJIAN CEPAT)
// ----------------------------------------------------
void handleSerialInput() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'K' || c == 'k' || c == '1') {
      // Tekan '1' di Serial Monitor untuk uji Kill-Switch
      triggerAirGapKillSwitch("Manual USB Serial Command");
    } else if (c == 'R' || c == 'r' || c == '0') {
      // Tekan '0' di Serial Monitor untuk Reset normal
      resetToNormal();
    } else if (c == 'B' || c == 'b') {
      // Tekan 'B' untuk uji Buzzer sirine
      Serial.println("[TEST] Uji Bunyi Buzzer...");
      beep(500);
    }
  }
}
