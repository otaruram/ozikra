.PHONY: all build run-backend run-simulator attack-firmware attack-spoof authorized-update clean

all: build

build:
	@echo "[*] Building OZIK-SENTINEL Golang Backend..."
	go build -v -o ozik-sentinel.exe .
	@echo "[*] Building Tactical IoT Simulator..."
	go build -v -o iot-simulator.exe ./cmd/iot_simulator
	@echo "[+] Build complete!"

run-backend:
	go run .

run-simulator:
	go run ./cmd/iot_simulator --interactive

attack-firmware:
	go run ./cmd/iot_simulator --mode=attack-firmware

attack-spoof:
	go run ./cmd/iot_simulator --mode=attack-spoof

authorized-update:
	go run ./cmd/iot_simulator --mode=authorized-update

db-seed:
	go run ./cmd/seed_db

clean:
	rm -f ozik-sentinel.exe iot-simulator.exe
