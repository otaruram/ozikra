#!/usr/bin/env python3
"""
===============================================================================
OZIK-SENTINEL :: TACTICAL IoT EDGE SENSOR & RUGGED SCANNER CLIENT
Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Kartika Cyber Hackathon 2026
===============================================================================
Perangkat Klien IoT Taktis untuk simulasi:
1. Normal Telemetry Stream (Daya 45-65 mA, detak jantung sensor OT).
2. Physical QR Check-In (Pemindaian Tactical QR Passport oleh Teknisi Lapangan).
3. Unauthorized Tampering Attack (Simulasi injeksi firmware ilegal >85 mA).
4. Auto-Telemetry Background Daemon.
===============================================================================
"""

import sys
import time
import json
import hmac
import hashlib
import os
import urllib.request
import urllib.error
from datetime import datetime

# Konfigurasi Gateway Core Backend (Golang) & AI Microservice (Python) via Environment Variables
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://127.0.0.1:8080")
AI_ENGINE_URL = os.getenv("AI_ENGINE_URL", "http://127.0.0.1:8000")
HMAC_SECRET = os.getenv("SERVER_HMAC_SECRET", os.getenv("HMAC_SECRET", "DEV_LOCAL_EPHEMERAL_HMAC_SECRET_KEY")).encode("utf-8")


DEVICE_PROFILES = {
    "1": {
        "device_id": "AST-RADAR-01",
        "name": "Radar Avionik Paskhas Unit-A (OT Alutsista)",
        "qr_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "normal_power": 58.4,
        "tamper_power": 94.8,
        "protocol": "MIL-STD-1553 / Serial RS-485"
    },
    "2": {
        "device_id": "AST-SRV-TACTICAL",
        "name": "Server Komando Taktis Mobile (IT Rugged Node)",
        "qr_hash": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
        "normal_power": 62.1,
        "tamper_power": 89.5,
        "protocol": "Ethernet / IEEE 802.3 Taktis"
    },
    "3": {
        "device_id": "AST-RADIO-VHF",
        "name": "Radio Taktis VHF Harris Falcon (OT Manpack)",
        "qr_hash": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
        "normal_power": 52.0,
        "tamper_power": 96.2,
        "protocol": "Tactical VHF / RS-232"
    }
}

def calculate_hmac(payload: str) -> str:
    """Buat tanda tangan kriptografi HMAC-SHA256 militer."""
    mac = hmac.new(HMAC_SECRET, payload.encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()

def send_http_post(url: str, data: dict) -> dict:
    """Mengirim payload JSON via HTTP POST standar tanpa dependensi luar."""
    payload_bytes = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload_bytes,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Ozik-Tactical-IoT-Agent/2.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.URLError as e:
        print(f"\n[!] KONEKSI GAGAL ke {url}: {e}")
        return {"error": str(e)}

def banner():
    print(r"""
===============================================================================
   ____ _____ _____ _  __     _____ _____ _   _ _____ ___ _   _ _____ _     
  / __ \__  /_   _| |/ /    / ____| ____| \ | |_   _|_ _| \ | | ____| |    
 | |  | |/ /  | | | ' /____| (___ |  _| |  \| | | |  | ||  \| |  _| | |    
 | |__| / /_ _| |_| . \_____|\___ \| |___| |\  | | |  | || |\  | |___| |___ 
  \____/____|_____|_|\_\     _____| |_____|_| \_| |_| |___|_| \_|_____|_____|
               TACTICAL IoT EDGE SENSOR & RUGGED SCANNER CLIENT
               PUSSIBERAD - KARTIKA CYBER HACKATHON 2026
===============================================================================
Target Core Backend  : %s
Target AI ML Service : %s
===============================================================================
    """ % (GATEWAY_URL, AI_ENGINE_URL))

def send_telemetry(profile: dict, signal_power: float, technician_id: str, is_attack: bool = False):
    """Mengirim sinyal telemetri sensor IoT ke Golang Core Gateway."""
    timestamp = datetime.utcnow().isoformat() + "Z"
    payload_str = f"{profile['device_id']}:{signal_power}:{timestamp}"
    signature = calculate_hmac(payload_str)

    data = {
        "device_id": profile["device_id"],
        "qr_hash": profile["qr_hash"],
        "technician_id": technician_id,
        "signal_power": signal_power,
        "timestamp": timestamp,
        "signature": signature
    }

    mode_label = "[!] SIMULASI SABOTASE / ANOMALI" if is_attack else "[*] TELEMETRI NORMAL"
    print(f"\n{mode_label}")
    print(f"Perangkat   : {profile['name']} ({profile['device_id']})")
    print(f"Protokol    : {profile['protocol']}")
    print(f"Daya Sinyal : {signal_power:.2f} mA")
    print(f"HMAC Seal   : {signature[:24]}...")

    url = f"{GATEWAY_URL}/api/v1/iot/telemetry-checkin"
    resp = send_http_post(url, data)

    if "status" in resp:
        if resp.get("anomaly"):
            print(f"STATUS SIEM : \033[91m[CRITICAL]\033[0m {resp['status']}")
            print(f"ALARM       : Terdeteksi Anomali Daya tanpa Otorisasi QR!")
        else:
            print(f"STATUS SIEM : \033[92m[SECURE]\033[0m {resp['status']}")
            print(f"KETERANGAN  : {resp.get('message', 'Nominal')}")
    else:
        print(f"RESPON RAW  : {resp}")

def scan_qr_checkin(profile: dict, technician_id: str):
    """Simulasi pemindaian Tactical QR Code untuk buka Maintenance Window di SIEM."""
    print(f"\n[+] MEMINDAI TACTICAL QR CODE PASSPORT...")
    print(f"Aset Target   : {profile['name']}")
    print(f"ID Teknisi    : {technician_id}")
    print(f"QR Hash Seal  : {profile['qr_hash']}")

    data = {
        "assetQrHash": profile["qr_hash"],
        "technicianId": technician_id
    }
    url = f"{GATEWAY_URL}/siem/check-in"
    resp = send_http_post(url, data)

    if "status" in resp and resp["status"] == "OPEN":
        print(f"\n\033[92m[BERHASIL]\033[0m Jendela Pemeliharaan (Maintenance Window) RESMI DIBUKA!")
        print(f"Window ID     : {resp.get('id')}")
        print(f"Berlaku s.d.  : {resp.get('expiresAt')}")
        print(f"Status        : {resp.get('status')} (Aman untuk modifikasi firmware / kalibrasi)")
    else:
        print(f"\nRespon SIEM   : {resp}")

def test_ml_direct(signal_power: float):
    """Langsung menguji model Machine Learning Scikit-Learn Isolation Forest di Python."""
    url = f"{AI_ENGINE_URL}/ai/ml/iot-anomaly"
    data = {
        "signal_power": signal_power,
        "freq_deviation": 1.4,
        "packet_rate": 105.0
    }
    print(f"\n[AI/ML] Mengirim ke Scikit-Learn Isolation Forest ({url})...")
    resp = send_http_post(url, data)
    print(f"Algoritma   : {resp.get('ml_algorithm')}")
    print(f"Skor Anomali: {resp.get('anomaly_score')}")
    print(f"Klasifikasi : {resp.get('classification')}")
    print(f"Is Anomaly  : {resp.get('is_anomaly')}")

def run_auto_daemon(profile: dict, technician_id: str, interval: int = 5):
    """Daemon otomatis mengirim telemetri berkala (cocok saat presentasi juri)."""
    print(f"\n[AUTO-DAEMON AKTIF] Mengirim detak jantung sensor setiap {interval} detik...")
    print("Tekan CTRL+C untuk berhenti.")
    try:
        import random
        while True:
            # Fluktuasi normal di rentang aman 48.0 - 62.0 mA
            power = round(random.uniform(48.0, 62.0), 2)
            send_telemetry(profile, power, technician_id, is_attack=False)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[DAEMON STOPPED] Kembali ke menu utama.")

def main():
    banner()

    # Pilih profil aset alutsista
    print("PILIH PERANGKAT ALUTSISTA / ASET TERTANAM:")
    for k, v in DEVICE_PROFILES.items():
        print(f"  [{k}] {v['name']} ({v['device_id']})")

    choice = input("\nMasukkan pilihan (1/2/3, default: 1): ").strip()
    if choice not in DEVICE_PROFILES:
        choice = "1"
    profile = DEVICE_PROFILES[choice]

    technician_id = input("Masukkan NRP / ID Teknisi Lapangan (default: SGT-PRATAMA-3108): ").strip()
    if not technician_id:
        technician_id = "SGT-PRATAMA-3108"

    while True:
        print("\n" + "="*70)
        print(f"OPERASI TACTICAL IoT: {profile['name']}")
        print(f"TEKNISI AKTIF       : {technician_id}")
        print("="*70)
        print("  [1] Kirim Sinyal Telemetri Normal (Power 55 mA - Status SECURE)")
        print("  [2] Scan QR Code Passport (Buka Jendela Maintenance Window 15 Menit)")
        print("  [3] Pemicu Serangan / Sabotase Ilegal (Power 94.8 mA - CRITICAL ALARM!)")
        print("  [4] Uji Langsung Model Machine Learning Scikit-Learn Isolation Forest")
        print("  [5] Jalankan Auto-Telemetry Daemon (Cocok untuk Background Demo Juri)")
        print("  [6] Ganti Perangkat Target")
        print("  [0] Keluar")
        print("="*70)

        cmd = input("Pilih aksi (0-6): ").strip()
        if cmd == "1":
            send_telemetry(profile, profile["normal_power"], technician_id, is_attack=False)
        elif cmd == "2":
            scan_qr_checkin(profile, technician_id)
        elif cmd == "3":
            send_telemetry(profile, profile["tamper_power"], "UNKNOWN_INTRUDER", is_attack=True)
        elif cmd == "4":
            test_ml_direct(profile["tamper_power"])
        elif cmd == "5":
            run_auto_daemon(profile, technician_id)
        elif cmd == "6":
            print("\nPILIH PERANGKAT:")
            for k, v in DEVICE_PROFILES.items():
                print(f"  [{k}] {v['name']}")
            choice = input("Pilihan: ").strip()
            if choice in DEVICE_PROFILES:
                profile = DEVICE_PROFILES[choice]
        elif cmd == "0":
            print("\nOperasi selesai. Tetap waspada.")
            sys.exit(0)
        else:
            print("Perintah tidak dikenal.")

if __name__ == "__main__":
    main()
