import type { Asset, AssetType, TacticalRole } from "@/types/sentinel";

/**
 * Hardcoded production frontend URL as requested so no .env edits are required.
 */
export const FRONTEND_BASE_URL = "https://oziksentinel.biz.id";

const BROWSER_IDENTITY_KEY = "ozikra.browser_officer_identity_v2";
const AUTOFILL_COUNTER_PREFIX = "ozikra.autofill_seq_";

export interface BrowserOfficerIdentity {
  id: string;
  email: string;
  name: string;
  nrp: string;
  unit: string;
  seedHash: number;
}

const RANKS_AND_NAMES = [
  { rank: "Mayor Cke", name: "Mayor Cke Bagaskara Putra, S.T.", unit: "Satuan Siber Dispamsanad" },
  { rank: "Kapten Chb", name: "Kapten Chb Rendra Wijaya, M.Han.", unit: "Subdit Pertahanan Siber PUSSIBERAD" },
  { rank: "Lettu Cpl", name: "Lettu Cpl Dimas Prasetyo, S.Kom.", unit: "Bengpuspal Puspalad — Divisi OT" },
  { rank: "Letkol Inf", name: "Letkol Inf Yudhistira Mahendra", unit: "Komando Operasi Siber Matra Darat" },
  { rank: "Kapten Cke", name: "Kapten Cke Farhan Ramadhan, S.T.", unit: "Tim Audit Forensik Siber TNI AD" },
  { rank: "Mayor Arh", name: "Mayor Arh Surya Darmawan", unit: " Batalyon Arhanud 10/ABC Radar Node" },
  { rank: "Lettu Chb", name: "Lettu Chb Aditya Nugroho, S.T.", unit: "Detasemen Konbekharstal Komando" },
  { rank: "Serka", name: "Serka Tek. Wahyu Hidayat", unit: "Tim Harwat Alutsista & Avionik" },
];

function computeStringHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Ensures every browser/user session has a unique, persistent officer identity
 * so two users opening the web app never share data or generate identical auto-fills.
 */
export function getOrCreateBrowserOfficerIdentity(): BrowserOfficerIdentity {
  if (typeof window === "undefined") {
    return {
      id: "off-ssr-isolated",
      email: "officer.isolated@pussiberad.mil.id",
      name: "Perwira Siber TNI AD",
      nrp: "112600001",
      unit: "PUSSIBERAD",
      seedHash: 101,
    };
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BrowserOfficerIdentity;
      if (parsed?.id && parsed?.email) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const randomPin = Math.floor(1000 + Math.random() * 9000);
  const tsSuffix = (Date.now() % 10000).toString().padStart(4, "0");
  const profileIdx = randomPin % RANKS_AND_NAMES.length;
  const chosen = RANKS_AND_NAMES[profileIdx];
  const slug = chosen.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 18);

  const identity: BrowserOfficerIdentity = {
    id: `off-${randomPin}-${tsSuffix}`,
    email: `${slug}.${randomPin}@pussiberad.mil.id`,
    name: chosen.name,
    nrp: `1126${randomPin}${tsSuffix.slice(0, 2)}`,
    unit: chosen.unit,
    seedHash: computeStringHash(`${randomPin}-${tsSuffix}-${chosen.name}`),
  };

  try {
    window.localStorage.setItem(BROWSER_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }

  return identity;
}

/**
 * Returns a per-user offset index that advances on every click AND starts at a
 * different offset for each user based on their unique identity hash.
 */
export function getNextUserPresetIndex(scope: string, poolSize: number, userIdentifier?: string): number {
  const identity = getOrCreateBrowserOfficerIdentity();
  const baseSeed = userIdentifier ? computeStringHash(userIdentifier) : identity.seedHash;

  if (typeof window === "undefined") {
    return baseSeed % poolSize;
  }

  const key = `${AUTOFILL_COUNTER_PREFIX}${scope}`;
  let clickCount = 0;
  try {
    const stored = window.localStorage.getItem(key);
    clickCount = stored ? parseInt(stored, 10) || 0 : 0;
    window.localStorage.setItem(key, String(clickCount + 1));
  } catch {
    clickCount = Math.floor(Math.random() * poolSize);
  }

  return (baseSeed + clickCount) % poolSize;
}

export interface GatekeeperAutoFillBundle {
  assetName: string;
  serialNumber: string;
  vendor: string;
  assetType: AssetType;
  manifestFile: File;
  sbomFile: File;
  formatLabel: string;
  expectedOutcome: "APPROVED" | "QUARANTINED";
}

interface GatekeeperPresetTemplate {
  assetName: string;
  serialPrefix: string;
  vendor: string;
  assetType: AssetType;
  formatType: "CYCLONEDX_JSON" | "SPDX_JSON" | "CSV_HARDWARE_BOM" | "XML_MILSPEC";
  formatLabel: string;
  expectedOutcome: "APPROVED" | "QUARANTINED";
  sectorCoord: string;
  contractRef: string;
  components: Array<{
    name: string;
    version: string;
    supplier: string;
    hash: string;
    cveTrigger?: string;
  }>;
}

const GATEKEEPER_TEMPLATES: GatekeeperPresetTemplate[] = [
  {
    assetName: "Radar Surveillance Arhanud Shikra-3D",
    serialPrefix: "SN-SHIKRA-3D",
    vendor: "PT Len Industri & Thales Defense",
    assetType: "OT_RADAR",
    formatType: "CYCLONEDX_JSON",
    formatLabel: "CycloneDX 1.4 JSON + CoC PDF (Clean Baseline)",
    expectedOutcome: "APPROVED",
    sectorCoord: "-6.3150, 106.8850 (Mabesad / PUSSIBERAD Sector)",
    contractRef: "KONTRAK-RAHASIA/ALUTSISTA/019/II/2026",
    components: [
      { name: "thales-dsp-radar-core", version: "4.12.0-mil-patched", supplier: "PT Len Industri", hash: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4" },
      { name: "freertos-safe-kernel", version: "10.6.2-lts", supplier: "AWS / Len Defense", hash: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae" },
    ],
  },
  {
    assetName: "Radio Taktis VHF Manpack Falcon-III",
    serialPrefix: "SN-FALCON-VHF",
    vendor: "L3Harris / PT Hariff Daya Tunggal",
    assetType: "TACTICAL_RADIO",
    formatType: "SPDX_JSON",
    formatLabel: "SPDX 2.3 ISO/IEC JSON + STANAG Manifest (CVE Risk)",
    expectedOutcome: "QUARANTINED",
    sectorCoord: "-6.8900, 107.6100 (Pussenif Bandung Sector)",
    contractRef: "KONTRAK-RAHASIA/KOMLEK/084/III/2026",
    components: [
      { name: "dce-rpc-bridge", version: "2.4.1-legacy", supplier: "L3Harris Subsystem", hash: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a", cveTrigger: "CVE-2026-21533 (Improper Privilege Management in Tactical Radio DCE-RPC)" },
      { name: "libwebp-codec-display", version: "1.3.1-unpatched", supplier: "OpenEmbedded", hash: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d", cveTrigger: "CVE-2023-4863 (Heap Buffer Overflow in libwebp)" },
    ],
  },
  {
    assetName: "Server Komando Taktis C4ISR Rugged",
    serialPrefix: "SN-C4ISR-SRV",
    vendor: "PT Pindad (Persero) — Divisi Cyber & Elektronika",
    assetType: "IT_SERVER",
    formatType: "CSV_HARDWARE_BOM",
    formatLabel: "Hardware & Firmware CSV BOM + BAP Pabrikan (Clean)",
    expectedOutcome: "APPROVED",
    sectorCoord: "-7.2575, 112.7521 (Kodam V/Brawijaya Surabaya)",
    contractRef: "KONTRAK-RAHASIA/C4ISR/211/I/2026",
    components: [
      { name: "pindad-secure-boot-tpm", version: "3.8.0-signed", supplier: "PT Pindad", hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      { name: "openssl-fips-mil", version: "3.2.1-fips", supplier: "OpenSSL Foundation", hash: "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1" },
    ],
  },
  {
    assetName: "Modul Kendali Rudal Starstreak LML-NG",
    serialPrefix: "SN-STARSTREAK",
    vendor: "Thales UK & Defend ID Consortium",
    assetType: "OT_RADAR",
    formatType: "XML_MILSPEC",
    formatLabel: "Mil-Spec XML Firmware BOM (STANAG 4107) + DO-178C Cert",
    expectedOutcome: "APPROVED",
    sectorCoord: "3.9200, 108.3800 (Pangkalan Terpadu Natuna Utara)",
    contractRef: "KONTRAK-RAHASIA/ARHANUD/402/IV/2026",
    components: [
      { name: "starstreak-fire-control-rtos", version: "7.1.4-do178c", supplier: "Thales Air Defence", hash: "a2c4e688b1357900dfba5832a5678b87452d3a985e5f3c1b0923485761019283" },
      { name: "canbus-optical-isolator", version: "2.0.9-mil", supplier: "Defend ID", hash: "7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730" },
    ],
  },
  {
    assetName: "Gateway Enkripsi Satelit Taktis Garuda-Sat",
    serialPrefix: "SN-SATCOM-GRD",
    vendor: "PT Telkom Satelit & PT Len Telekomunikasi",
    assetType: "IT_SERVER",
    formatType: "CYCLONEDX_JSON",
    formatLabel: "CycloneDX 1.4 JSON + CoC Manifest (CVE Quarantined)",
    expectedOutcome: "QUARANTINED",
    sectorCoord: "-1.2379, 116.8529 (Satuan Pertahanan IKN Nusantara)",
    contractRef: "KONTRAK-RAHASIA/SATCOM/519/II/2026",
    components: [
      { name: "rtos-eth-driver", version: "1.9.0-unpatched", supplier: "Embedded NetStack", hash: "99a8d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", cveTrigger: "CVE-2026-21510 (Remote Code Execution in Embedded RTOS Ethernet Stack)" },
      { name: "moveit-telemetry-sync", version: "2023.0.1-vulnerable", supplier: "Progress / Legacy Sync", hash: "55b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b811", cveTrigger: "CVE-2023-34362 (SQL Injection in Telemetry Transfer Daemon)" },
    ],
  },
  {
    assetName: "Sensor Keamanan Gudang Munisi Paldam-X",
    serialPrefix: "SN-ARMORY-PLD",
    vendor: "PT Pindad & Schneider Defense Indonesia",
    assetType: "OT_RADAR",
    formatType: "CSV_HARDWARE_BOM",
    formatLabel: "Hardware CSV BOM + Sertifikat Kelaikan Puspalad (Clean)",
    expectedOutcome: "APPROVED",
    sectorCoord: "-5.1477, 119.4327 (Kodam XIV/Hasanuddin Makassar)",
    contractRef: "KONTRAK-RAHASIA/PALDAM/608/V/2026",
    components: [
      { name: "esp32-s3-armory-guard", version: "5.2.1-hmac", supplier: "PT Pindad IoT Division", hash: "1a79a4d60de6718e8e5b326e338ae5333a985e5f3c1b09234857610192837712" },
      { name: "ds18b20-thermal-telemetry", version: "1.4.0-calibrated", supplier: "Maxim Integrated Mil", hash: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b" },
    ],
  },
  {
    assetName: "Transceiver HF Kriptografi Taktis Komodo-RF",
    serialPrefix: "SN-KOMODO-RF",
    vendor: "PT Inti (Persero) & Rohde-Schwarz",
    assetType: "TACTICAL_RADIO",
    formatType: "XML_MILSPEC",
    formatLabel: "Mil-Spec XML Firmware BOM + Dokumen Rahasia (CVE Risk)",
    expectedOutcome: "QUARANTINED",
    sectorCoord: "-2.5330, 140.7170 (Kodam XVII/Cenderawasih Jayapura)",
    contractRef: "KONTRAK-RAHASIA/SANDI/712/VI/2026",
    components: [
      { name: "dce-rpc-radio-link", version: "1.1.0-vulnerable", supplier: "Legacy RF Stack", hash: "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35", cveTrigger: "CVE-2026-21533" },
      { name: "rtos-eth-driver", version: "1.0.4-unpatched", supplier: "Legacy RF Stack", hash: "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce", cveTrigger: "CVE-2026-21510" },
    ],
  },
  {
    assetName: "Unit Anti-Drone Jammer Taktis Halim-Shield",
    serialPrefix: "SN-JAMMER-HLM",
    vendor: "PT Len Industri (Persero) — Divisi Elhan",
    assetType: "OT_RADAR",
    formatType: "SPDX_JSON",
    formatLabel: "SPDX 2.3 JSON + Sertifikat Laik Pertahanan (Clean)",
    expectedOutcome: "APPROVED",
    sectorCoord: "3.5952, 98.6722 (Kodam I/Bukit Barisan Medan)",
    contractRef: "KONTRAK-RAHASIA/ELHAN/889/VII/2026",
    components: [
      { name: "len-gnss-anti-spoof-dsp", version: "6.0.2-hardened", supplier: "PT Len Industri", hash: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf99" },
      { name: "xilinx-zynq-bitstream-guard", version: "2026.1-authenticated", supplier: "AMD Xilinx Defense", hash: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe102" },
    ],
  },
];

export function generateGatekeeperAutoFill(userIdentifier?: string): GatekeeperAutoFillBundle {
  const identity = getOrCreateBrowserOfficerIdentity();
  const idx = getNextUserPresetIndex("gatekeeper", GATEKEEPER_TEMPLATES.length, userIdentifier);
  const tpl = GATEKEEPER_TEMPLATES[idx];

  const userPin = (identity.seedHash % 900) + 100;
  const clickPin = Math.floor(10 + Math.random() * 89);
  const serialNumber = `${tpl.serialPrefix}-${userPin}${clickPin}`;

  // Build realistic Certificate of Conformance containing PII & Classified coordinates to demonstrate Auto-Masking
  const manifestContent = [
    "================================================================================",
    "MARKAS BESAR TNI ANGKATAN DARAT — PUSAT SIBER (PUSSIBERAD) & PUSPALAD",
    "CERTIFICATE OF CONFORMANCE (CoC) & BERITA ACARA INTEGRITAS RANTAI PASOK",
    "================================================================================",
    `NOMOR KONTRAK RAHASIA : ${tpl.contractRef}-${userPin}`,
    `NAMA ALUTSISTA / NODE : ${tpl.assetName}`,
    `NOMOR SERI PRODUKSI   : ${serialNumber}`,
    `PABRIKAN / VENDOR     : ${tpl.vendor}`,
    `KLASIFIKASI PERANGKAT : ${tpl.assetType} (MIL-STD-810H & DO-178C COMPLIANT)`,
    `PERWIRA PENGUJI (PII) : ${identity.name} | NRP: ${identity.nrp} [RAHASIA MILITER]`,
    `KOORDINAT INSTALASI   : ${tpl.sectorCoord} [CLASSIFIED GEOLOCATION]`,
    `FORMAT SBOM TERLAMPIR : ${tpl.formatLabel}`,
    "--------------------------------------------------------------------------------",
    "PERNYATAAN KEPATUHAN ZERO-TRUST:",
    "Dokumen ini memuat metadata sensitif rantai pasok pertahanan. Sesuai protokol",
    "OZIK-SENTINEL Fase 1, seluruh titik koordinat strategis dan NRP personel wajib",
    "disamarkan otomatis (PII/Classified Auto-Masking) sebelum ekstraksi AI.",
    "================================================================================",
  ].join("\n");

  const manifestFile = new File(
    [manifestContent],
    `CoC_${serialNumber}_${tpl.formatType}.pdf`,
    { type: "application/pdf" }
  );

  let sbomContent = "";
  let sbomFilename = "";
  let sbomMime = "application/json";

  if (tpl.formatType === "CYCLONEDX_JSON") {
    sbomFilename = `SBOM_CycloneDX_${serialNumber}.json`;
    sbomContent = JSON.stringify(
      {
        bomFormat: "CycloneDX",
        specVersion: "1.4",
        serialNumber: `urn:uuid:${serialNumber.toLowerCase()}`,
        version: 1,
        metadata: {
          timestamp: new Date().toISOString(),
          supplier: { name: tpl.vendor },
          component: {
            type: "device",
            name: tpl.assetName,
            version: serialNumber,
          },
        },
        components: tpl.components.map((c) => ({
          type: "firmware",
          name: c.name,
          version: c.version,
          supplier: { name: c.supplier },
          hashes: [{ alg: "SHA-256", content: c.hash }],
          description: c.cveTrigger || "Verified Mil-Spec Embedded Module",
        })),
      },
      null,
      2
    );
  } else if (tpl.formatType === "SPDX_JSON") {
    sbomFilename = `SBOM_SPDX23_${serialNumber}.spdx.json`;
    sbomContent = JSON.stringify(
      {
        spdxVersion: "SPDX-2.3",
        dataLicense: "CC0-1.0",
        SPDXID: "SPDXRef-DOCUMENT",
        name: `SPDX-Defense-Manifest-${serialNumber}`,
        documentNamespace: `https://oziksentinel.biz.id/spdx/${serialNumber}`,
        creationInfo: {
          created: new Date().toISOString(),
          creators: [`Organization: ${tpl.vendor}`, `Person: ${identity.name}`],
        },
        packages: tpl.components.map((c, i) => ({
          SPDXID: `SPDXRef-Package-${i + 1}`,
          name: c.name,
          versionInfo: c.version,
          supplier: `Organization: ${c.supplier}`,
          checksums: [{ algorithm: "SHA256", checksumValue: c.hash }],
          comment: c.cveTrigger || "STANAG 4107 Certified Package",
        })),
      },
      null,
      2
    );
  } else if (tpl.formatType === "CSV_HARDWARE_BOM") {
    sbomFilename = `Hardware_BOM_${serialNumber}.csv`;
    sbomMime = "text/csv";
    const rows = [
      "component_id,part_number,component_name,version,supplier,sha256_hash,security_notes",
      ...tpl.components.map(
        (c, i) =>
          `COMP-0${i + 1},${serialNumber}-P${i + 1},${c.name},${c.version},"${c.supplier}",${c.hash},"${c.cveTrigger || "CLEAN_VERIFIED"}"`
      ),
    ];
    sbomContent = rows.join("\n");
  } else {
    sbomFilename = `Firmware_Manifest_${serialNumber}.xml`;
    sbomMime = "application/xml";
    sbomContent = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<FirmwareManifest standard="STANAG-4107-DO178C" serial="${serialNumber}" vendor="${tpl.vendor}">`,
      `  <AssetClassification type="${tpl.assetType}">${tpl.assetName}</AssetClassification>`,
      `  <Components>`,
      ...tpl.components.map(
        (c) =>
          `    <Module name="${c.name}" version="${c.version}" supplier="${c.supplier}" sha256="${c.hash}" advisory="${c.cveTrigger || "NONE"}" />`
      ),
      `  </Components>`,
      `</FirmwareManifest>`,
    ].join("\n");
  }

  const sbomFile = new File([sbomContent], sbomFilename, { type: sbomMime });

  return {
    assetName: `${tpl.assetName} #${userPin}`,
    serialNumber,
    vendor: tpl.vendor,
    assetType: tpl.assetType,
    manifestFile,
    sbomFile,
    formatLabel: tpl.formatLabel,
    expectedOutcome: tpl.expectedOutcome,
  };
}

export interface SiemAutoFillBundle {
  targetAssetId: string;
  qrHash: string;
  technicianId: string;
  modeLabel: string;
  isAnomalyScenario: boolean;
  telemetryPayload: {
    asset_id: string;
    temperature_c: number;
    voltage_v: number;
    firmware_hash: string;
    network_tx_kbps: number;
    qr_hash: string;
  };
}

export function generateSiemAutoFill(existingAssets: Asset[], userIdentifier?: string): SiemAutoFillBundle {
  const identity = getOrCreateBrowserOfficerIdentity();
  const idx = getNextUserPresetIndex("siem_checkin", 6, userIdentifier);
  const techProfile = RANKS_AND_NAMES[(idx + identity.seedHash) % RANKS_AND_NAMES.length];
  const techNrp = `31${((identity.seedHash + idx * 137) % 899999 + 100000).toString()}`;
  const technicianId = `${techProfile.name} (NRP ${techNrp} — ${techProfile.unit})`;

  const chosenAsset =
    existingAssets.length > 0
      ? existingAssets[idx % existingAssets.length]
      : null;

  const targetAssetId =
    chosenAsset?.id ??
    `AST-OT-${((identity.seedHash + idx * 41) % 899 + 100).toString()}`;

  const qrHash =
    chosenAsset?.qrHash ||
    `${targetAssetId}|FW-BASE-${identity.seedHash.toString(16).toUpperCase()}|${chosenAsset?.vendor ?? "PT Len Industri"}|SIG-HMAC-${(Date.now() % 100000).toString(16).toUpperCase()}`;

  const isAnomalyScenario = idx % 2 === 1;

  if (!isAnomalyScenario) {
    return {
      targetAssetId,
      qrHash,
      technicianId,
      modeLabel: `Otorisasi Harwat Fisik Valid (${targetAssetId})`,
      isAnomalyScenario: false,
      telemetryPayload: {
        asset_id: targetAssetId,
        temperature_c: Number((41.2 + (idx % 5) * 1.3).toFixed(1)),
        voltage_v: Number((24.0 + (idx % 3) * 0.2).toFixed(1)),
        firmware_hash: chosenAsset?.firmwareHash || `sha256_nominal_${identity.seedHash.toString(16)}`,
        network_tx_kbps: 340 + idx * 45,
        qr_hash: qrHash,
      },
    };
  }

  return {
    targetAssetId,
    qrHash,
    technicianId,
    modeLabel: `Uji Deviasi Parameter OT & Beban Jaringan (${targetAssetId})`,
    isAnomalyScenario: true,
    telemetryPayload: {
      asset_id: targetAssetId,
      temperature_c: Number((79.5 + (idx % 7) * 2.1).toFixed(1)),
      voltage_v: Number((28.9 + (idx % 4) * 0.4).toFixed(1)),
      firmware_hash: "0xDEAD_BACKDOOR_V2",
      network_tx_kbps: 6400 + idx * 350,
      qr_hash: qrHash,
    },
  };
}

export function generateOnboardingAutoFill(preferredRole?: TacticalRole, userIdentifier?: string): {
  fullName: string;
  email: string;
  nrp: string;
  unit: string;
  role: TacticalRole;
  formatNote: string;
} {
  const identity = getOrCreateBrowserOfficerIdentity();
  const idx = getNextUserPresetIndex("onboarding", RANKS_AND_NAMES.length, userIdentifier);
  const chosen = RANKS_AND_NAMES[idx];
  const uniqueCode = ((identity.seedHash + idx * 97) % 8999 + 1000).toString();

  const roles: TacticalRole[] = [
    "COMMANDER",
    "LOGISTICS_OFFICER",
    "FORENSIC_AUDITOR",
    "SUPER_ADMIN",
  ];
  const role = preferredRole ?? roles[idx % roles.length];

  const nrpFormats = [
    `11260${uniqueCode}0${idx + 1}`,
    `SPRINT/${uniqueCode}/PUSSIBERAD/2026`,
    `NRP-3198${uniqueCode}-AD`,
    `SPRIN-${uniqueCode}/IV/2026/MABESAD`,
  ];
  const nrp = nrpFormats[idx % nrpFormats.length];

  const emailSlug = chosen.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 16);

  return {
    fullName: `${chosen.name} (${uniqueCode})`,
    email: `${emailSlug}.${uniqueCode}@pussiberad.mil.id`,
    nrp,
    unit: chosen.unit,
    role,
    formatNote: `Format Identitas #${idx + 1} (${role})`,
  };
}

export function generateClearanceAutoFill(userIdentifier?: string): {
  sprintNumber: string;
  sector: string;
  clearanceLevel: string;
} {
  const identity = getOrCreateBrowserOfficerIdentity();
  const idx = getNextUserPresetIndex("clearance", 5, userIdentifier);
  const num = ((identity.seedHash + idx * 251) % 899 + 100).toString();

  const formats = [
    {
      sprintNumber: `SPRINT/${num}/PUSSIBERAD/X/2026`,
      sector: "SEKTOR-I: KOMANDO SIBER MATRA DARAT (JAKARTA)",
      clearanceLevel: "TINGKAT-I // RAHASIA MILITER",
    },
    {
      sprintNumber: `SPRIN-OPS/${num}/ARHANUD-OT/2026`,
      sector: "SEKTOR-II: PERTAHANAN UDARA & RADAR (BANDUNG)",
      clearanceLevel: "TINGKAT-I // TOP SECRET OT/IT",
    },
    {
      sprintNumber: `BA-AUDIT/${num}/DISPAMSANAD/2026`,
      sector: "SEKTOR-III: LABORATORIUM FORENSIK SIBER",
      clearanceLevel: "TINGKAT-I // INVESTIGASI KHUSUS",
    },
    {
      sprintNumber: `SPRINT-HARWAT/${num}/PUSPALAD/2026`,
      sector: "SEKTOR-IV: INSTALASI GUDANG MUNISI & ALUTSISTA",
      clearanceLevel: "TINGKAT-II // OTORISASI TEKNISI OT",
    },
    {
      sprintNumber: `KOMANDO/${num}/NATUNA-NODE/2026`,
      sector: "SEKTOR-V: PANGKALAN TERPADU NATUNA UTARA",
      clearanceLevel: "TINGKAT-I // KOMANDO STRATEGIS",
    },
  ];

  return formats[idx % formats.length];
}

export function generateVerifySealAutoFill(userIdentifier?: string): {
  id: string;
  sig: string;
  ts: string;
  vendor: string;
  status: string;
} {
  const identity = getOrCreateBrowserOfficerIdentity();
  const idx = getNextUserPresetIndex("verify_seal", 4, userIdentifier);
  const code = ((identity.seedHash + idx * 73) % 899 + 100).toString();

  const samples = [
    {
      id: `AST-OT-${code}`,
      sig: `hmac256_${identity.seedHash.toString(16)}f9a8c4e2b109d876543210fedcba9876543210abcdef012345`,
      ts: new Date().toISOString().replace("T", " ").slice(0, 19),
      vendor: "PT Len Industri & Thales Defense",
      status: "approved",
    },
    {
      id: `AST-IT-${code}`,
      sig: `hmac256_${(identity.seedHash * 3).toString(16)}8b7c6d5e4f3a2b1c0987654321fedcba0123456789abcdef12`,
      ts: new Date().toISOString().replace("T", " ").slice(0, 19),
      vendor: "PT Pindad (Persero) — Divisi C4ISR",
      status: "approved",
    },
    {
      id: `AST-OT-${code}Q`,
      sig: `hmac256_${(identity.seedHash * 7).toString(16)}c0ffee99887766554433221100aabbccddeeff001122334455`,
      ts: new Date().toISOString().replace("T", " ").slice(0, 19),
      vendor: "L3Harris / Komlekad Subsystem",
      status: "quarantined",
    },
    {
      id: `AST-RADAR-${code}`,
      sig: `hmac256_${(identity.seedHash * 11).toString(16)}778899aabbccddeeff00112233445566778899aabbccddeeff`,
      ts: new Date().toISOString().replace("T", " ").slice(0, 19),
      vendor: "Thales Air Defence & Defend ID",
      status: "approved",
    },
  ];

  return samples[idx % samples.length];
}
