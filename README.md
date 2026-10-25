# OZIK-SENTINEL (Operational Zero-Trust Infrastructure & Supply-Chain Intelligence)

**Kategori Lomba:** 03 – CORE INFRA (Dukungan Teknologi)  
**Institusi Penyelenggara:** Pusat Siber TNI Angkatan Darat (PUSSIBERAD) & CODEPOLITAN  
**Event:** KARTIKA CYBER HACKATHON 2026  

---

## 🛡️ Ringkasan Eksekutif

**OZIK-SENTINEL** adalah platform infrastruktur keamanan siber terpadu (*Core Infra*) yang mengamankan siklus hidup aset IT dan OT (Operational Technology / Alutsista) TNI AD secara *end-to-end*. Menggabungkan teknologi **Multi-Agent AI**, **Tactical QR Code Passport**, **Lightweight SIEM**, dan **Automated Digital Forensics** yang berjalan di atas arsitektur lokal (*On-Premise / Air-Gapped*), OZIK-SENTINEL memastikan setiap perangkat dan suku cadang yang masuk dan beroperasi di lingkungan TNI AD terverifikasi keasliannya, terpantau secara real-time, dan terinvestigasi secara instan saat terjadi insiden.

---

## ⚔️ Arsitektur Solusi 3 Fase Terpadu

```
                      +------------------------------------------+
                      | FASE 1: PRE-DEPLOYMENT GATEKEEPER        |
                      | - Multimodal Document & SBOM Extraction  |
                      | - CVE Vector Matching (TF-IDF / Cosine)  |
                      | - Penerbitan Tactical QR Passport Seal   |
                      +--------------------+---------------------+
                                           |
                                           v
                      +--------------------+---------------------+
                      | FASE 2: ACTIVE OT/IT SIEM MONITORING     |
                      | - Zero-Trust Physical QR Check-In        |
                      | - Scikit-Learn Isolation Forest Anomaly  |
                      | - Graph Dependency Topology Matrix       |
                      +--------------------+---------------------+
                                           |
                                           v
                      +--------------------+---------------------+
                      | FASE 3: AUTOMATED DIGITAL FORENSICS      |
                      | - 1-Click AI Root Cause Analysis (RCA)   |
                      | - Kill-Switch Tactical Node Isolation    |
                      | - Cetak Berita Acara Forensik Militer    |
                      +------------------------------------------+
```

---

## 🗂️ Spesifikasi Modul Aplikasi (Navigasi Antarmuka)

| Grup Navigasi | Modul / Halaman | Deskripsi & Fitur Kunci |
|---|---|---|
| **Overview** | `Command Center` | KPI keamanan aset, matriks kesiapan kritis, dan umpan langsung telemetri SIEM real-time. |
| **Core Operations** | `Supply Chain Gatekeeper` *(Fase 1)* | Audit multimodal manifes pengadaan & SBOM, skor kepercayaan (0–100%), dan penerbitan Tactical QR Code Passport. |
| **Core Operations** | `Live SIEM & QR Check-In` *(Fase 2)* | Pemantauan telemetri ringan, validasi jendela pemeliharaan fisik QR, dan deteksi anomali sabotase biner OT. |
| **Core Operations** | `AI Digital Forensics` *(Fase 3)* | Rekonstruksi Attack Timeline otomatis, analisis akar masalah (RCA), Kill-Switch isolasi node, dan ekspor Berita Acara Forensik Siber (PDF/Print). |
| **Registry & Audit** | `IT/OT Asset Registry` | Katalog inventaris seluruh aset IT/OT bersertifikat, status integritas, dan filter status keamanan. |
| **Registry & Audit** | `Immutable Audit Ledger` | Log audit kriptografi berantai SHA-256 (*tamper-proof blockchain-style ledger*). |
| **Administration** | `Profile, RBAC & Engine` | Tactical Role-Based Access Control (Komandan, Perwira Logistik, Auditor Forensik) & konfigurasi AI Engine Air-Gapped / Cloud Sandbox. |

---

## 🚀 Panduan Menjalankan Sistem (Quickstart)

### Opsi A: 1-Click Launcher (Windows)
Cukup jalankan file berikut untuk mengaktifkan seluruh stack sekaligus:
```cmd
start_all.bat
```
Atau menggunakan PowerShell:
```powershell
.\start_all.ps1
```

### Opsi B: Menjalankan Secara Mandiri
1. **Jalankan Python AI Engine:**
   ```bash
   cd ozik-sentinel-backend
   python -m uvicorn ai_service:app --host 127.0.0.1 --port 8000
   ```
2. **Jalankan Golang Core SIEM Backend:**
   ```bash
   cd ozik-sentinel-backend
   go run .
   ```
3. **Jalankan Next.js Tactical UI:**
   ```bash
   cd fe
   npm run dev
   ```
   Buka di browser: **`http://localhost:5000`**

### Opsi C: Simulasi IoT Edge Sensor & Scanner Lapangan
Untuk menyimulasikan transmisi data sensor radar/radio taktis dan serangan lonjakan daya:
```bash
cd ozik-iot-edge
python iot_agent.py
```

### Opsi D: Deployment Menggunakan Docker Compose (VPS / Server Air-Gapped)
```bash
docker compose up --build -d
```

---

## 📋 Port & Endpoint Layanan

- **Frontend Console:** `http://localhost:5000`
- **Core SIEM & API Gateway (Golang):** `http://localhost:8080`
- **AI & ML Microservice (FastAPI):** `http://localhost:8000` (Dokumentasi Swagger di `http://localhost:8000/docs`)

---

## 👥 Pengembang Solusi
- **Pusat Siber Angkatan Darat (PUSSIBERAD)** & Komite Kartika Cyber Hackathon 2026.
