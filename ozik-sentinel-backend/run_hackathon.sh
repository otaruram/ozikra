#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "[*] Compiling OZIK-SENTINEL Backend and IoT Simulator..."
go build -o ozik-sentinel.exe .
go build -o iot-simulator.exe ./cmd/iot_simulator

echo "[*] Starting Golang Backend..."
./ozik-sentinel.exe &
BACKEND_PID=$!

sleep 2

echo "[*] Starting IoT Simulator..."
./iot-simulator.exe --interactive &
SIM_PID=$!

trap "kill $BACKEND_PID $SIM_PID 2>/dev/null || true; exit 0" SIGINT SIGTERM
wait
