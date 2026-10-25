@echo off
TITLE OZIK-SENTINEL Launcher - Kartika Cyber Hackathon 2026
echo ===============================================================================
echo   OZIK-SENTINEL :: Operational Zero-Trust Infrastructure & Supply-Chain Intelligence
echo   Pusat Siber TNI Angkatan Darat (PUSSIBERAD) - Core Infra
echo ===============================================================================
echo.
echo [1/4] Menjalankan AI Microservice (Python FastAPI / Port 8000)...
start "OZIK-AI-ENGINE" cmd /k "cd /d %~dp0ozik-sentinel-backend && python -m uvicorn ai_service:app --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak > nul

echo [2/4] Menjalankan Core SIEM Backend (Golang / Port 8080)...
start "OZIK-CORE-GATEWAY" cmd /k "cd /d %~dp0ozik-sentinel-backend && go run ."

timeout /t 2 /nobreak > nul

echo [3/4] Menjalankan Tactical UI Frontend (Next.js / Port 5000)...
start "OZIK-FRONTEND" cmd /k "cd /d %~dp0fe && npm run dev"

timeout /t 2 /nobreak > nul

echo [4/4] Menjalankan Tactical IoT/OT Simulator (Golang)...
start "OZIK-IOT-SIMULATOR" cmd /k "cd /d %~dp0ozik-sentinel-backend && go run ./cmd/iot_simulator --interactive"

timeout /t 3 /nobreak > nul
echo.
echo ===============================================================================
echo   Semua service telah aktif!
echo   - Frontend Console : http://localhost:5000
echo   - Core SIEM API    : http://localhost:8080
echo   - AI Reasoning ML  : http://localhost:8000/docs
echo   - IoT Simulator    : Window 'OZIK-IOT-SIMULATOR'
echo ===============================================================================
start http://localhost:5000
