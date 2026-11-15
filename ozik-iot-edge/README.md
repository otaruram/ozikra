# OZIK-SENTINEL :: IoT Edge & Tactical Hardware Layer
**Physical Sensor Telemetry & Field Verification Node**

---

## Overview

The `ozik-iot-edge` module provides physical sensor acquisition, firmware verification, and hardware telemetry streaming for defense-grade alutsista assets (radars, software-defined radios, tactical servers, and ammunition depot storage racks).

## Core Capabilities

1. **Hardware Integrity Monitoring:**
   - Real-time bus voltage telemetry monitoring.
   - Operating temperature and thermal signature tracking.
   - Vibration and tamper-switch detection for field enclosures.

2. **Firmware Hash Validation:**
   - Continuously computes cryptographic SHA-256 digests of installed firmware binaries.
   - Automatically cross-references firmware hashes with the authorized **Maintenance Service Window** issued by the Core SIEM.

3. **Field Scanning & Service Window Binding:**
   - Interfaces with optical QR scanners to validate the **RFC-2104 HMAC-SHA256** physical QR passport prior to unlocking hardware maintenance ports.

## Running the Simulator

To simulate hardware telemetry streams locally:

```bash
cd ../ozik-sentinel-backend
go run ./cmd/iot_simulator --interactive
```

This will generate synthetic physical anomalies (voltage spikes, unauthorized firmware flashes, and temperature deviations) to test real-time DEFCON threat escalation in the Command Console.
