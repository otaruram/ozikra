@echo off
TITLE OZIK-SENTINEL Tactical IoT Simulator (TNI AD)
echo ===============================================================================
echo   OZIK-SENTINEL :: Tactical IoT/OT Telemetry & Attack Simulator
echo   Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra 2026
echo ===============================================================================
echo.
cd /d %~dp0ozik-sentinel-backend
go run ./cmd/iot_simulator --interactive
pause
