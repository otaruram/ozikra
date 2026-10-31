# OZIK-SENTINEL :: Panduan Skema Rangkaian Hardware IoT Lapangan
**Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Kartika Cyber Hackathon 2026**

Panduan perakitan purwarupa fisik (*physical prototype*) untuk demonstrasi **Air-Gap Kill-Switch & Physical QR Check-In** menggunakan mikrokontroler murah (< Rp 80.000).

---

## 1. Daftar Komponen yang Dibutuhkan

| No | Komponen | Estimasi Harga | Fungsi dalam Sistem |
|---|---|---|---|
| 1 | **ESP32 DevKit V1** (30/38 pin) | ~Rp 45.000 | Otak pengendali IoT & pemantau perintah cloud via WiFi |
| 2 | **Modul Relai 5V 1-Channel** (Active LOW) | ~Rp 8.000 | Sakelar pemutus fisik listrik/sinyal (*Physical Air-Gap Isolation*) |
| 3 | **Active Buzzer 5V** | ~Rp 3.000 | Sirine peringatan audio militer saat terdeteksi serangan |
| 4 | **LED Merah & Hijau** (5mm) + Resistor 220Ω | ~Rp 2.000 | Indikator visual status alutsista (*Hijau = Normal, Merah = Kill-Switch*) |
| 5 | **Kabel Jumper** (Male-to-Female / Male-to-Male) | ~Rp 5.000 | Penghubung antar kaki komponen |
| 6 | **Breadboard Mini** (Opsional) | ~Rp 6.000 | Papan tancap komponen tanpa solder |
| 7 | **Kabel Data Micro-USB** | Tersedia | Menghubungkan ESP32 ke Laptop / Charger HP |

---

## 2. Tabel Sambungan Pin (Wiring Pinout)

### A. Modul Relai 5V ➔ ESP32
| Kaki Pin Relai | Hubungkan ke Pin ESP32 | Keterangan |
|---|---|---|
| **VCC** | **VIN** (atau pin **5V**) | Sumber daya 5V dari kabel USB |
| **GND** | **GND** | Ground bersama |
| **IN** | **D23** (GPIO 23) | Sinyal kendali pemutus relai |

> **Catatan Terminal Relai (Sisi Baut/Output):**
> Sambungkan kabel output beban (misalnya kabel daya LED alutsista atau radio) ke terminal **COM** (Common) dan **NO** (Normally Open). Saat normal, relai terhubung; saat Kill-Switch ditekan, relai memutus sambungan seketika.

---

### B. Active Buzzer 5V ➔ ESP32
| Kaki Pin Buzzer | Hubungkan ke Pin ESP32 | Keterangan |
|---|---|---|
| **Positif (+)** (Kaki panjang / ada tanda +) | **D19** (GPIO 19) | Sinyal pemicu sirine |
| **Negatif (-)** (Kaki pendek) | **GND** | Ground |

---

### C. Lampu Indikator LED ➔ ESP32 (Opsional tapi Bagus di Video)
| Komponen | Kaki Anoda (+) | Kaki Katoda (-) | Keterangan |
|---|---|---|---|
| **LED Hijau** (Status Normal) | **D5** (GPIO 5) | **GND** (Lewat resistor 220Ω) | Menyala saat operasional nominal |
| **LED Merah** (Status Kill-Switch) | **D18** (GPIO 18) | **GND** (Lewat resistor 220Ω) | Menyala saat node diisolasi |

---

## 3. Diagram Skema Rangkaian Sederhana

```text
       +---------------------------------------------------------+
       |                     ESP32 DEVKIT V1                     |
       |                                                         |
       |   [VIN / 5V] ---------------------+--------+            |
       |                                   |        |            |
       |   [GND] --------------------+-----+----+   |            |
       |                             |     |    |   |            |
       |   [GPIO 23] ------+         |     |    |   |            |
       |   [GPIO 19] ----+ |         |     |    |   |            |
       |   [GPIO 18] --+ | |         |     |    |   |            |
       |   [GPIO 5]  -+| | |         |     |    |   |            |
       +--------------||-|-|---------|-----|----|---|------------+
                      || | |         |     |    |   |
                      || | |         |     |    |   +---> VCC  [ MODUL RELAI 5V ]
                      || | |         |     |    +-------> GND  [                ]
                      || | +---------|-----|------------> IN   [                ]
                      || |           |     |
                      || +-----------|-----+------------> (+)  [ ACTIVE BUZZER  ]
                      ||             |     +------------> (-)  [                ]
                      ||             |
                      |+-------------|------------------> (+) LED Merah [ ALARM ]
                      |              +------------------> (-) Lewat Resistor 220Ω
                      |
                      +---------------------------------> (+) LED Hijau [ NORMAL ]
                                     +------------------> (-) Lewat Resistor 220Ω
```

---

## 4. Cara Upload Kode ke ESP32 (Arduino IDE)

1. Buka software **Arduino IDE** di laptop Anda.
2. Pasang board ESP32 jika belum terpasang:
   * Masuk ke menu **File** ➔ **Preferences**.
   * Pada kolom *Additional Boards Manager URLs*, masukkan:
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   * Buka **Tools** ➔ **Board** ➔ **Boards Manager**, cari `esp32`, lalu klik **Install**.
3. Buka file kode:
   `ozik-iot-edge/esp32_firmware/esp32_firmware.ino`
4. Sesuaikan baris 25–26 dengan nama WiFi dan password Hotspot HP Anda:
   ```cpp
   const char* WIFI_SSID     = "NAMA_HOTSPOT_HP_ANDA";
   const char* WIFI_PASSWORD = "PASSWORD_HOTSPOT";
   ```
5. Tancapkan ESP32 ke laptop via kabel USB.
6. Pilih **Tools** ➔ **Board** ➔ **ESP32 Dev Module** dan pilih port COM yang sesuai (misal: `COM3` atau `COM4`).
7. Klik tombol tanda panah **Upload (➡️)** di pojok kiri atas Arduino IDE. Tunggu hingga tulisan `Done uploading`.

---

## 5. Skenario Rekaman Video Demonstrasi untuk Dewan Juri

Berikut urutan aksi dramatis yang sangat disukai dewan juri PUSSIBERAD:

1. **Adegan 1 (Kondisi Awal / Normal):**
   * Nyalakan ESP32. Lampu LED Hijau menyala tenang, relai dalam kondisi normal.
   * Kamera menyorot dashboard web `https://ozikra.vercel.app/dashboard/siem`.
   * Data telemetri mengalir dengan status hijau: `SECURE / NOMINAL`.

2. **Adegan 2 (Simulasi Sabotase / Serangan Lapangan):**
   * Di laptop/HP, jalankan script `python iot_agent.py` dan pilih menu `[3] SIMULASI SABOTASE` (atau pasang firmware palsu).
   * Layar dashboard SIEM langsung berkedip merah dan memicu status `CRITICAL ALARM: ANOMALY DETECTED`.

3. **Adegan 3 (Eksekusi Air-Gap Kill-Switch oleh Panglima):**
   * Buka menu **AI Digital Forensics** (`/dashboard/forensics`) atau tombol isolasi di **Peta Taktis SIEM**.
   * Klik tombol merah: **[ENGAGE AIR-GAP KILL-SWITCH]**.
   * Kamera langsung menyorot fisik perangkat ESP32:
     * **BUNYI KLIK KERAS** dari Modul Relai (memutus jalur daya/komunikasi fisik).
     * **BUZZER BERBUNYI NYARING** (sirine peringatan militer).
     * **LED MERAH MENYALA** terang.
     * Alutsista terbukti berhasil diisolasi seketika secara fisik (*True Air-Gap*).

4. **Adegan 4 (Penerbitan BAP Hukum):**
   * Klik tombol **[Unduh Laporan Resmi (BAP-SIBER)]** di dashboard web untuk memperlihatkan berkas berita acara yudisial militer yang sah.
