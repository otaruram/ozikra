# OZIK-SENTINEL Unified Launcher (PowerShell)
# Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra

Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  OZIK-SENTINEL :: Operational Zero-Trust Infrastructure & Supply-Chain Intelligence" -ForegroundColor Cyan
Write-Host "  PUSSIBERAD - Kartika Cyber Hackathon 2026" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Green

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n[1/4] Menjalankan AI Microservice (Python FastAPI / Port 8000)..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\ozik-sentinel-backend'; python -m uvicorn ai_service:app --host 127.0.0.1 --port 8000"

Start-Sleep -Seconds 2

Write-Host "[2/4] Menjalankan Core SIEM Backend (Golang / Port 8080)..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\ozik-sentinel-backend'; go run ."

Start-Sleep -Seconds 2

Write-Host "[3/4] Menjalankan Tactical UI Frontend (Next.js / Port 5000)..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\fe'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "[4/4] Menjalankan Tactical IoT/OT Simulator (Golang)..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\ozik-sentinel-backend'; go run ./cmd/iot_simulator --interactive"

Start-Sleep -Seconds 3

Write-Host "`nSemua service berhasil diaktifkan!" -ForegroundColor Green
Write-Host "  Frontend Console : http://localhost:5000" -ForegroundColor Cyan
Write-Host "  Core SIEM API    : http://localhost:8080" -ForegroundColor Cyan
Write-Host "  AI Reasoning ML  : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  IoT Simulator    : Standalone Terminal Window" -ForegroundColor Yellow

Start-Process "http://localhost:5000"
