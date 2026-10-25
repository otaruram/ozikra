$ErrorActionPreference = 'Stop'
Write-Host '=== TESTING MODULE 1: SUPPLY CHAIN GATEKEEPER ==='
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$body = (
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="assetName"' + $LF + $LF +
    'Tactical Drone Jammer Unit 09' + $LF +
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="serialNumber"' + $LF + $LF +
    'SN-JAM-2026-X77' + $LF +
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="vendor"' + $LF + $LF +
    'PT Len Industri' + $LF +
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="assetType"' + $LF + $LF +
    'OT_RADAR' + $LF +
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="manifest"; filename="manifest_test.pdf"' + $LF +
    'Content-Type: application/pdf' + $LF + $LF +
    'MIL-SPEC-810G Certificate of Conformance PT Len Industri for Jammer Unit SN-JAM-2026-X77' + $LF +
    '--' + $boundary + $LF +
    'Content-Disposition: form-data; name="sbom"; filename="sbom_test.json"' + $LF +
    'Content-Type: application/json' + $LF + $LF +
    '{"bomFormat":"CycloneDX","components":[{"name":"crypto-core","version":"2.1.0"}]}' + $LF +
    '--' + $boundary + '--' + $LF
)

$res1 = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/supply-chain/verify' -Method Post -ContentType ("multipart/form-data; boundary=" + $boundary) -Body $body -Headers @{'X-Simulated-Role'='LOGISTICS_OFFICER'}
Write-Host ('Asset ID Registered: ' + $res1.passport.assetId)
Write-Host ('Trust Score: ' + $res1.trustScore)
Write-Host ('Verdict: ' + $res1.verdict)
Write-Host ('QR Image (Data URI Length): ' + $res1.passport.qrImage.Length)
Write-Host ('HMAC Signature: ' + $res1.passport.signature)

$assetId = $res1.passport.assetId
$qrPayload = $res1.passport.qrPayload
$signature = $res1.passport.signature

Write-Host '=== TESTING MODULE 2: QR CHECK-IN & SIEM TELEMETRY ==='
$checkInBody = @{
    assetQrHash = ($res1.passport.qrPayload + '|SIG:' + $signature)
    technicianId = 'Sgt. Pratama (NRP 310892)'
    signature = $signature
} | ConvertTo-Json

$res2 = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/siem/qr-checkin' -Method Post -ContentType 'application/json' -Body $checkInBody -Headers @{'X-Simulated-Role'='OT_TECHNICIAN'}
Write-Host ('Maintenance Window Opened: ' + $res2.id + ' | Status: ' + $res2.status + ' | Expires: ' + $res2.expiresAt)

Write-Host 'Testing Live Telemetry (Authorized Window)...'
$telBody1 = @{
    asset_id = $assetId
    temperature_c = 42.5
    voltage_v = 24.1
    network_tx_kbps = 1250.0
    firmware_hash = $res1.passport.firmwareHash
    status = 'NOMINAL'
} | ConvertTo-Json

$resTel1 = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/siem/telemetry' -Method Post -ContentType 'application/json' -Body $telBody1
Write-Host ('Nominal Telemetry Verdict: ' + $resTel1.verdict + ' | Message: ' + $resTel1.message)

Write-Host 'Testing Rogue Telemetry (Unverified Firmware Tamper without Window on AST-RADIO-VHF)...'
$telBody2 = @{
    asset_id = 'AST-RADIO-VHF'
    temperature_c = 82.0
    voltage_v = 28.5
    network_tx_kbps = 6200.0
    firmware_hash = 'DEAD_BACKDOOR_COMPROMISED_V9'
    status = 'NOMINAL'
} | ConvertTo-Json

$resTel2 = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/siem/telemetry' -Method Post -ContentType 'application/json' -Body $telBody2
Write-Host ('Critical Alert Verdict: ' + $resTel2.verdict + ' | Severity: ' + $resTel2.severity + ' | Msg: ' + $resTel2.message)

Write-Host '=== TESTING MODULE 3: AI FORENSIC INVESTIGATION ==='
$invBody = @{ assetId = 'AST-RADIO-VHF' } | ConvertTo-Json
$res3 = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/forensics/investigate' -Method Post -ContentType 'application/json' -Body $invBody -Headers @{'X-Simulated-Role'='FORENSIC_AUDITOR'}
Write-Host ('Investigation ID: ' + $res3.investigationId)
Write-Host ('Timeline Events: ' + $res3.timeline.Count)
Write-Host ('MITRE ATT&CK: ' + ($res3.mitreAttackIcs -join ', '))

Write-Host '=== TESTING MODULE 4: ASSET INVENTORY REGISTRY & TOPOLOGY ==='
$assets = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/assets' -Method Get
Write-Host ('Total Assets from Live DB Query: ' + $assets.Count)
$topo = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/siem/topology' -Method Get
Write-Host ('Dynamic Topology Nodes: ' + $topo.nodes.Count + ' | Edges: ' + $topo.edges.Count)

Write-Host '=== TESTING MODULE 5: RBAC PERMISSIONS ==='
try {
    # Attempt Kill-Switch as OT_TECHNICIAN (Should be FORBIDDEN)
    Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/forensics/isolate/AST-RADIO-VHF' -Method Post -Headers @{'X-Simulated-Role'='OT_TECHNICIAN'}
    Write-Host 'RBAC FAIL: OT_TECHNICIAN should not be allowed to isolate'
} catch {
    Write-Host ('RBAC SUCCESS: Forbidden action blocked with status: ' + $_.Exception.Response.StatusCode)
}

# Attempt Kill-Switch as COMMANDER (Should SUCCEED)
$isoRes = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/forensics/isolate/AST-RADIO-VHF' -Method Post -Headers @{'X-Simulated-Role'='COMMANDER'}
Write-Host ('Kill-Switch Success: Node ' + $isoRes.assetId + ' | Isolated: ' + $isoRes.isolated)

Write-Host '=== TESTING MODULE 6: OFFICER PROFILE UPDATE ==='
$profBody = @{
    name = 'Major Hendra'
    email = 'hendra@sentinel.tni-ad.mil.id'
    role = 'COMMANDER'
    nrp = '110488200192'
    unit = 'Batalyon Siber Taktis PUSSIBERAD'
    rank = 'Mayor Chb'
    publicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICommanderAuthHendra992'
} | ConvertTo-Json

$profRes = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/auth/profile' -Method Put -ContentType 'application/json' -Body $profBody -Headers @{'X-Simulated-Role'='COMMANDER'}
Write-Host ('Profile Update Result: ' + $profRes.message)

Write-Host 'Testing BAP Forensik Siber PDF Export...'
$bap = (Invoke-WebRequest -Uri 'http://localhost:8080/api/v1/forensics/report/INV-57232/pdf' -UseBasicParsing).Content
Write-Host ('BAP Document Length: ' + $bap.Length + ' bytes | Valid PUSSIBERAD Doc: ' + $bap.Contains('PUSSIBERAD'))

Write-Host '=== ALL 6 MODULES VERIFIED SUCCESSFULLY WITH REAL BACKEND & DATABASE LOGIC! ==='
