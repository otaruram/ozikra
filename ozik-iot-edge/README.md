# OZIK-SENTINEL Tactical IoT Edge Sensor & Rugged Scanner

Klien IoT taktis berbasis Python untuk simulasi perangkat lapangan / rugged scanner teknisi pada **Kartika Cyber Hackathon 2026** (Pusat Siber TNI AD - PUSSIBERAD & CODEPOLITAN).

## Cara Menjalankan

Cukup jalankan script dengan Python:

```bash
python iot_agent.py
```

## Fitur Utama

1. **Normal Telemetry Stream**: Mengirimkan sinyal telemetri sensor (arus 45-65 mA, detak jantung perangkat, HMAC-SHA256) ke Golang Core Gateway (`:8080`).
2. **Physical QR Check-In**: Simulasi pemindaian label Tactical QR Code Passport oleh teknisi lapangan (NRP) untuk membuka jendela pemeliharaan (*Maintenance Window*) 15 menit.
3. **Simulasi Sabotase / Serangan Lapangan**: Mengirimkan lonjakan anomali daya (>85 mA) atau upaya override firmware tanpa otorisasi QR fisik, yang langsung memicu **CRITICAL ALARM** di SIEM dan dashboard Next.js!
4. **Machine Learning Anomaly Test**: Mengirimkan data sinyal langsung ke model **Scikit-Learn Isolation Forest** di Python AI service (`:8000`).
5. **Auto-Telemetry Background Daemon**: Mengirimkan telemetri otomatis berkala setiap beberapa detik saat demonstrasi di depan dewan juri.
