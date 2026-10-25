#!/usr/bin/env bash
# ==============================================================================
# OZIK-SENTINEL :: Kartika Cyber Hackathon 2026 Unified Bootstrapper
# Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/ozik-sentinel-backend"

echo "================================================================================"
echo "  OZIK-SENTINEL :: Operational Zero-Trust Infrastructure & Supply-Chain Intelligence"
echo "  PUSSIBERAD - Kartika Cyber Hackathon 2026"
echo "================================================================================"

# 1. Compile binaries if needed
echo "[*] Ensuring Golang backend and simulator are built..."
cd "$BACKEND_DIR"
go build -o ozik-sentinel.exe .
go build -o iot-simulator.exe ./cmd/iot_simulator
echo "[+] Build complete!"

# 2. Start Core SIEM Golang Backend
echo "[*] Launching Core SIEM Backend on port 8080..."
./ozik-sentinel.exe &
BACKEND_PID=$!
echo "[+] Backend running with PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 2

# 3. Launch Tactical IoT Simulator
echo "[*] Launching Tactical IoT/OT Simulator..."
./iot-simulator.exe --interactive &
SIM_PID=$!
echo "[+] IoT Simulator running with PID: $SIM_PID"

echo "================================================================================"
echo "  Services Active:"
echo "  - Backend Core API  : http://localhost:8080/api/v1"
echo "  - Live SSE Stream   : http://localhost:8080/api/v1/siem/stream"
echo "  - IoT Simulator     : Attached"
echo "================================================================================"
echo "Press CTRL+C to terminate all services."

# Trap exit signals to terminate child background processes cleanly
trap "echo '[*] Shutting down services...'; kill -TERM $BACKEND_PID $SIM_PID 2>/dev/null || true; exit 0" SIGINT SIGTERM

wait
