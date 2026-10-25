#!/usr/bin/env python3
"""
===============================================================================
OZIK-SENTINEL :: TACTICAL IoT EDGE CLIENT & RUGGED SENSOR AGENT
Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Kartika Cyber Hackathon 2026
===============================================================================
Perangkat Klien IoT Taktis untuk simulasi perangkat lapangan alutsista:
1. Normal Telemetry Stream (Suhu, Voltase, Tx Kbps nominal, Firmware valid).
2. Physical QR Check-In (Pemindaian Tactical QR Passport oleh Teknisi Lapangan).
3. Unauthorized Tampering Attack (Injeksi firmware palsu / lonjakan transmisi data).
4. Auto-Telemetry Background Daemon & Real-time Remote Kill-Switch / Isolation Listener.
===============================================================================
"""

import sys
import time
import json
import hmac
import hashlib
import os
import random
import urllib.request
import urllib.error
from datetime import datetime

# Audio Beep helper (Windows / Unix)
def play_alert_sound(freq=1200, duration_ms=400):
    try:
        if os.name == 'nt':
            import winsound
            winsound.Beep(freq, duration_ms)
        else:
            sys.stdout.write('\a')
            sys.stdout.flush()
    except Exception:
        sys.stdout.write('\a')
        sys.stdout.flush()

# Konfigurasi Gateway Core Backend (Golang) via Environment Variables
# Default otomatis mengarah ke cloud produksi Render
DEFAULT_GATEWAY = "https://ozik-sentinel.onrender.com"
GATEWAY_URL = os.getenv("GATEWAY_URL", os.getenv("BACKEND_URL", DEFAULT_GATEWAY)).rstrip("/")
HMAC_SECRET = os.getenv("SERVER_HMAC_SECRET", os.getenv("HMAC_SECRET", "DEV_LOCAL_EPHEMERAL_HMAC_SECRET_KEY")).encode("utf-8")

# Profil Alutsista Taktis Realistis TNI AD
DEVICE_PROFILES = {
    "1": {
        "device_id": "AST-RADAR-01",
        "name": "Modul Radar Avionik Paskhas Maritim (OT Alutsista)",
        "qr_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "firmware_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "normal_temp": 52.0,
        "normal_volt": 28.2,
        "normal_tx": 1280.0,
        "protocol": "MIL-STD-1553 / Serial RS-485",
        "location": "Radar Paskhas Maritim Tanjung Priok"
    },
    "2": {
        "device_id": "AST-RADIO-VHF",
        "name": "Radio Taktis VHF Harris Falcon (OT Manpack)",
        "qr_hash": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
        "firmware_hash": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
        "normal_temp": 45.0,
        "normal_volt": 14.8,
        "normal_tx": 860.0,
        "protocol": "Tactical VHF / RS-232",
        "location": "Patroli Mobile Taktis Kodam Jaya"
    },
    "3": {
        "device_id": "ARMORY-ENV-02",
        "name": "Sensor Suhu & Kelembaban Gudang Munisi (OT Safety)",
        "qr_hash": "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1",
        "firmware_hash": "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283",
        "normal_temp": 22.5,
        "normal_volt": 12.0,
        "normal_tx": 65.0,
        "protocol": "Modbus RTU / RS-485",
        "location": "Gudang Munisi Daerah Paldam Jaya"
    }
}

# State lokal perangkat
is_device_isolated = False

def calculate_hmac(payload: str) -> str:
    """Buat tanda tangan kriptografi HMAC-SHA256 militer."""
    mac = hmac.new(HMAC_SECRET, payload.encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()

def send_http_request(url: str, data: dict = None, method: str = "POST") -> dict:
    """Mengirim payload JSON via HTTP standar tanpa dependensi luar."""
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Ozik-Tactical-IoT-Agent/2.5.0-MIL",
        "Accept": "application/json"
    }
    
    payload_bytes = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=payload_bytes, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            res_body = response.read().decode("utf-8")
            if not res_body:
                return {"status": "ok"}
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        try:
            return json.loads(err_body)
        except Exception:
            return {"error": f"HTTP {e.code}: {e.reason}", "body": err_body}
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {e.reason}"}

def banner():
    print(r"""
===============================================================================
   ____ _____ _____ _  __     _____ _____ _   _ _____ ___ _   _ _____ _     
  / __ \__  /_   _| |/ /    / ____| ____| \ | |_   _|_ _| \ | | ____| |    
 | |  | |/ /  | | | ' /____| (___ |  _| |  \| | | |  | ||  \| |  _| | |    
 | |__| / /_ _| |_| . \_____|\___ \| |___| |\  | | |  | || |\  | |___| |___ 
  \____/____|_____|_|\_\     _____| |_____|_| \_| |_| |___|_| \_|_____|_____|
               TACTICAL IoT EDGE SENSOR & RUGGED CLIENT
               PUSSIBERAD - KARTIKA CYBER HACKATHON 2026
===============================================================================
Gateway Core Backend : %s
Local Defense State  : %s
===============================================================================
    """ % (GATEWAY_URL, "\033[91m[ISOLATED / LOCKDOWN]\033[0m" if is_device_isolated else "\033[92m[ACTIVE OPERATIONAL]\033[0m"))

def send_telemetry(profile: dict, is_attack: bool = False):
    """Mengirim sinyal telemetri sensor IoT ke Golang Core Gateway & SIEM."""
    global is_device_isolated

    if is_device_isolated:
        print("\n\033[91m[BLOCKED]\033[0m Perangkat dalam status LOCKDOWN / ISOLATED oleh Pusat Komando PUSSIBERAD!")
        print("Transmisi data ditolak secara lokal demi keamanan alutsista.")
        play_alert_sound(800, 300)
        return

    # Hitung metrik normal atau sabotase
    if is_attack:
        temp = round(profile["normal_temp"] + random.uniform(25.0, 35.0), 1)  # Lonjakan suhu panas
        volt = round(profile["normal_volt"] + random.uniform(4.0, 7.0), 1)
        tx_kbps = round(random.uniform(7200.0, 9500.0), 1)                      # Anomali exfiltrasi data (>4000 Kbps)
        fw_hash = "0xDEAD_BACKDOOR_V2"                                          # Injeksi biner backdoor
    else:
        temp = round(profile["normal_temp"] + random.uniform(-1.2, 1.2), 1)
        volt = round(profile["normal_volt"] + random.uniform(-0.3, 0.3), 1)
        tx_kbps = round(profile["normal_tx"] + random.uniform(-50.0, 50.0), 1)
        fw_hash = profile["firmware_hash"]

    payload = {
        "asset_id": profile["device_id"],
        "device_id": profile["device_id"],
        "temperature_c": temp,
        "voltage_v": volt,
        "network_tx_kbps": tx_kbps,
        "firmware_hash": fw_hash,
        "qr_hash": profile["qr_hash"]
    }

    mode_label = "\033[91m[!] SIMULASI SABOTASE / INJEKSI MALWARE\033[0m" if is_attack else "\033[92m[*] PENGIRIMAN TELEMETRI NORMAL\033[0m"
    print(f"\n{mode_label}")
    print(f"Alutsista    : {profile['name']} ({profile['device_id']})")
    print(f"Lokasi       : {profile['location']}")
    print(f"Suhu / Volt  : {temp} °C | {volt} V")
    print(f"Trafik Data  : {tx_kbps:.0f} Kbps")
    print(f"Firmware     : {fw_hash[:20]}...")

    url = f"{GATEWAY_URL}/api/v1/siem/telemetry"
    resp = send_http_request(url, payload, method="POST")

    if "Verdict" in resp:
        verdict = resp.get("Verdict")
        if verdict == "ANOMALY":
            print(f"STATUS SIEM  : \033[91m[CRITICAL ALARM]\033[0m Anomali terdeteksi!")
            print(f"KETERANGAN   : {resp.get('Message')}")
            play_alert_sound(1500, 500)
        else:
            print(f"STATUS SIEM  : \033[92m[SECURE / NOMINAL]\033[0m {resp.get('Message')}")
    elif "status" in resp:
        print(f"STATUS SIEM  : {resp.get('status')} - {resp.get('message', 'Nominal')}")
    else:
        print(f"RESPON GATEWAY: {resp}")

def scan_qr_checkin(profile: dict, technician_id: str):
    """Simulasi pemindaian Tactical QR Code untuk buka Maintenance Window di SIEM."""
    print(f"\n[+] MEMINDAI TACTICAL QR CODE PASSPORT...")
    print(f"Alutsista Target : {profile['name']}")
    print(f"ID / NRP Teknisi : {technician_id}")
    print(f"QR Hash Seal     : {profile['qr_hash']}")

    payload = {
        "assetQrHash": profile["qr_hash"],
        "technicianId": technician_id
    }
    url = f"{GATEWAY_URL}/api/v1/siem/qr-checkin"
    resp = send_http_request(url, payload, method="POST")

    if "status" in resp and resp["status"] == "OPEN":
        print(f"\n\033[92m[BERHASIL - OTORISASI SAH]\033[0m Jendela Pemeliharaan RESMI DIBUKA!")
        print(f"Window ID     : {resp.get('id')}")
        print(f"Berlaku s.d.  : {resp.get('expiresAt')}")
        print(f"Keterangan    : Perangkat aman untuk modifikasi firmware / kalibrasi selama 15 menit.")
        play_alert_sound(1000, 200)
    else:
        print(f"\nRespon SIEM: {resp}")

def poll_remote_commands(profile: dict):
    """Memeriksa apakah ada perintah Remote Kill-Switch / Isolasi dari Command Center."""
    global is_device_isolated
    url = f"{GATEWAY_URL}/api/v1/iot/commands/{profile['device_id']}"
    resp = send_http_request(url, method="GET")

    cmds = resp.get("commands", [])
    if cmds:
        for cmd in cmds:
            action = cmd.get("action", "").upper()
            if action in ["ISOLATE", "KILL", "LOCKDOWN"]:
                is_device_isolated = True
                print("\n" + "="*70)
                print("\033[91m[PERINGATAN TINGGI // EMERGENCY COMMAND RECEIVED]\033[0m")
                print(f"Perintah: {action} dari {cmd.get('issued_by', 'PUSSIBERAD Command Center')}")
                print(f"Waktu   : {cmd.get('issued_at')}")
                print("TINDAKAN: SELURUH INTERFACE JARINGAN ALUTSISTA DIISOLASI SECARA LOKAL!")
                print("="*70)
                play_alert_sound(2000, 600)
                play_alert_sound(1600, 400)
                return True
    return False

def run_auto_daemon(profile: dict, interval: int = 4):
    """Daemon otomatis mengirim telemetri berkala (cocok untuk demo video di depan juri)."""
    print(f"\n[AUTO-DAEMON RUNNING] Mengirim detak jantung alutsista setiap {interval} detik...")
    print(f"Memonitor perintah remote kill-switch secara real-time.")
    print("Tekan CTRL+C untuk kembali ke menu.")
    try:
        while True:
            # 1. Cek perintah kill switch dari backend
            poll_remote_commands(profile)
            
            # 2. Kirim telemetri periodik
            send_telemetry(profile, is_attack=False)
            
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[DAEMON STOPPED] Kembali ke menu utama.")

def main():
    global is_device_isolated
    banner()

    # Pilih profil aset alutsista
    print("PILIH ALUTSISTA / ASET LAPANGAN:")
    for k, v in DEVICE_PROFILES.items():
        print(f"  [{k}] {v['name']} ({v['device_id']})")

    choice = input("\nMasukkan pilihan (1/2/3, default: 1): ").strip()
    if choice not in DEVICE_PROFILES:
        choice = "1"
    profile = DEVICE_PROFILES[choice]

    technician_id = input("Masukkan NRP / ID Teknisi Lapangan (default: SGT-PRATAMA-3108): ").strip()
    if not technician_id:
        technician_id = "Sgt. Pratama (NRP 310892)"

    while True:
        print("\n" + "="*70)
        status_str = "\033[91m[ISOLATED]\033[0m" if is_device_isolated else "\033[92m[OPERATIONAL]\033[0m"
        print(f"TARGET ALUTSISTA : {profile['name']} {status_str}")
        print(f"TEKNISI LAPANGAN : {technician_id}")
        print(f"GATEWAY BACKEND  : {GATEWAY_URL}")
        print("="*70)
        print("  [1] Kirim Telemetri Normal (Status: SECURE / NOMINAL)")
        print("  [2] Scan QR Passport Check-In (Buka Maintenance Window 15 Menit)")
        print("  [3] SIMULASI SABOTASE / INJEKSI MALWARE (Trigger CRITICAL ALARM!)")
        print("  [4] Jalankan Auto-Telemetry Daemon (Otomatis & Realtime ke Dashboard)")
        print("  [5] Periksa Perintah Remote Komandan / Status Kill-Switch")
        print("  [6] Reset Status Isolasi Lokal (Pemulihan Alutsista)")
        print("  [7] Ganti Alutsista Target")
        print("  [0] Keluar")
        print("="*70)

        cmd = input("Pilih aksi (0-7): ").strip()
        if cmd == "1":
            send_telemetry(profile, is_attack=False)
        elif cmd == "2":
            scan_qr_checkin(profile, technician_id)
        elif cmd == "3":
            send_telemetry(profile, is_attack=True)
        elif cmd == "4":
            run_auto_daemon(profile)
        elif cmd == "5":
            if not poll_remote_commands(profile):
                print(f"\n[*] Status Alutsista: Tidak ada perintah pending. Status: {'ISOLATED' if is_device_isolated else 'NORMAL'}")
        elif cmd == "6":
            is_device_isolated = False
            print("\n\033[92m[RESET BERHASIL]\033[0m Status isolasi alutsista telah dipulihkan ke normal.")
        elif cmd == "7":
            print("\nPILIH ALUTSISTA:")
            for k, v in DEVICE_PROFILES.items():
                print(f"  [{k}] {v['name']}")
            c = input("Pilihan: ").strip()
            if c in DEVICE_PROFILES:
                profile = DEVICE_PROFILES[c]
        elif cmd == "0":
            print("\nOperasi Edge Agent selesai. Tetap waspada.")
            sys.exit(0)
        else:
            print("Perintah tidak dikenal.")

if __name__ == "__main__":
    main()
