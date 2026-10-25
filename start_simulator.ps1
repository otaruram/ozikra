# OZIK-SENTINEL Tactical IoT Simulator Launcher (PowerShell)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  OZIK-SENTINEL :: Tactical IoT/OT Telemetry & Attack Simulator" -ForegroundColor Cyan
Write-Host "  Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra 2026" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Green

Set-Location "$Root\ozik-sentinel-backend"
go run ./cmd/iot_simulator --interactive
