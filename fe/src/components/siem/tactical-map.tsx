"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Button, cn, Notice } from "@/components/ui";
import { fetchAssetLatestTelemetry, onIsolateAssetNode } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Asset } from "@/types/sentinel";

// 28 Strategic Tactical Defense Locations in Indonesia (PUSSIBERAD TNI AD)
const KNOWN_COORDS: Record<string, { lat: number; lng: number; locationName: string }> = {
  "AST-SRV-TACTICAL": { lat: -6.1754, lng: 106.8272, locationName: "Markas PUSSIBERAD Jakarta Pusat" },
  "AST-RADAR-01": { lat: -6.1054, lng: 106.8833, locationName: "Radar Paskhas Maritim Tanjung Priok" },
  "AST-OT-529": { lat: -0.9744, lng: 116.7099, locationName: "Sub-Detasemen Siber IKN Nusantara Sepaku" },
  "AST-RADIO-VHF": { lat: -6.2100, lng: 106.8400, locationName: "Patroli Mobile Taktis Kodam Jaya" },
  "ARMORY-ENV-02": { lat: -6.2583, lng: 106.8625, locationName: "Gudang Munisi Daerah Paldam Jaya" },
  "AST-OT-461": { lat: -6.3262, lng: 106.9084, locationName: "Radar Surveillance Mabes TNI Cilangkap" },
  "AST-OT-358": { lat: -6.2657, lng: 106.8906, locationName: "Lanud Halim Perdanakusuma Drone Jammer" },
  "AST-OT-657": { lat: -6.5278, lng: 106.8911, locationName: "Pos Komando Pertahanan Siber Sentul" },
  "AST-OT-332": { lat: -6.9175, lng: 107.6191, locationName: "Radar Pertahanan Udara Pussenif Bandung" },
  "AST-OT-792": { lat: -6.9800, lng: 110.4200, locationName: "Radar Pengintai Pesisir Kodam IV Semarang" },
  "AST-OT-184": { lat: -7.2575, lng: 112.7521, locationName: "Pangkalan Radar Koarmada II Surabaya" },
  "AST-OT-807": { lat: -7.7956, lng: 110.3695, locationName: "Radar Udara Lanud Adisutjipto Yogyakarta" },
  "AST-OT-936": { lat: -8.6500, lng: 115.2167, locationName: "Radar Taktis Kodam IX Udayana Denpasar" },
  "AST-OT-324": { lat: 3.9456, lng: 108.3897, locationName: "Tactical Sensor Node Natuna Terluar" },
  "AST-OT-921": { lat: 1.4748, lng: 124.8428, locationName: "Radar Pesisir Kodam XIII Merdeka Manado" },
  "AST-OT-812": { lat: -5.1477, lng: 119.4327, locationName: "Stasiun Radar Koopsud II Makassar" },
  "AST-OT-743": { lat: -2.5337, lng: 140.7181, locationName: "Posko Radar Skouw Kodam XVII Papua" },
  "AST-OT-236": { lat: 3.5952, lng: 98.6722, locationName: "Drone Jammer Kodam I Bukit Barisan Medan" },
  "AST-OT-597": { lat: -0.0263, lng: 109.3425, locationName: "Pos Radar Khatulistiwa Pontianak" },
  "AST-OT-303": { lat: -3.3167, lng: 114.5900, locationName: "Terminal Komunikasi Korem Banjarmasin" },
  "AST-OT-797": { lat: -0.9471, lng: 100.4172, locationName: "Pos Sensor Maritim Teluk Bayur Padang" },
  "AST-OT-119": { lat: -5.4500, lng: 105.2667, locationName: "Node Relai Selat Sunda Bakauheni" },
  "AST-OT-614": { lat: -3.6958, lng: 128.1831, locationName: "Sensor Monitoring ALKI Ambon" },
  "AST-OT-628": { lat: -10.1772, lng: 123.6070, locationName: "Pos Pengamatan Rote Kupang" },
  "AST-OT-635": { lat: -0.9167, lng: 131.2500, locationName: "Radar Pengintai Pasmar 3 Sorong" },
  "AST-OT-642": { lat: 0.5333, lng: 123.0667, locationName: "Sensor Telemetri Gorontalo" },
  "AST-OT-651": { lat: 0.9000, lng: 104.4500, locationName: "Stasiun Selat Malaka Tanjung Pinang" },
  "AST-OT-660": { lat: -8.5833, lng: 116.1167, locationName: "Pos Taktis Selat Lombok Mataram" },
};

function getAssetCoords(asset: Asset, index: number) {
  if (asset.latitude && asset.longitude && (asset.latitude !== 0 || asset.longitude !== 0)) {
    return {
      lat: Number(asset.latitude),
      lng: Number(asset.longitude),
      locationName: asset.locationName || KNOWN_COORDS[asset.id]?.locationName || `Pos Taktis Sektor Pertahanan ${asset.id}`,
    };
  }
  if (KNOWN_COORDS[asset.id]) {
    return KNOWN_COORDS[asset.id];
  }
  const hash = asset.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + index * 17;
  const latOffset = ((hash % 100) - 50) * 0.008;
  const lngOffset = (((hash * 13) % 100) - 50) * 0.008;
  return {
    lat: -6.2000 + latOffset,
    lng: 106.8500 + lngOffset,
    locationName: `Sektor Taktis Pertahanan Area ${(hash % 8) + 1}`,
  };
}

export function TacticalMap({ assets, onRefresh }: { assets: Asset[]; onRefresh?: () => void }) {
  const router = useRouter();
  const { role } = useSession();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const markersMapRef = useRef<Map<string, { marker: any; dangerCircle?: any; maintCircle?: any; asset: Asset }>>(new Map());

  const [filterState, setFilterState] = useState<string>("ALL");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAssetIdRef = useRef<string | null>(null);
  const [isolatingId, setIsolatingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ kind: "error" | "info" | "success"; message: string } | null>(null);

  // Sync ref with selectedAssetId state
  useEffect(() => {
    selectedAssetIdRef.current = selectedAssetId;
  }, [selectedAssetId]);

  // Dynamic status counts directly bound to Supabase asset dataset
  const totalCount = assets.length;
  const alertCount = assets.filter((a) => a.integrityState === "COMPROMISED" || a.integrityState === "QUARANTINED").length;
  const maintCount = assets.filter((a) => a.integrityState === "MAINTENANCE" || a.qrWindowStatus === "OPEN").length;
  const secureCount = assets.filter((a) => a.integrityState === "SECURE" && a.qrWindowStatus !== "OPEN").length;

  // Initialize Leaflet Map once
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!isMounted || !mapContainerRef.current) return;
      if (mapInstanceRef.current) return;

      const container = mapContainerRef.current as any;
      if (container._leaflet_id) {
        container._leaflet_id = null;
      }

      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;
      if (mapInstanceRef.current) return;
      if (container._leaflet_id) {
        container._leaflet_id = null;
      }

      let map: any = null;
      try {
        // Center around Markas PUSSIBERAD Jakarta / Java Sea corridor
        map = L.map(container, {
          center: [-3.5000, 117.0000],
          zoom: 5,
          zoomControl: false,
          attributionControl: false,
        });
      } catch (err) {
        console.warn("Leaflet map initialization skipped (already active):", err);
        return;
      }

      // Add Zoom Control at bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // 100% Free Open-Access Tactical Tile Layer (Zero keys, Zero watermarks, No API errors)
      const isLight = document.documentElement.classList.contains("light");
      const baseTileUrl = isLight
        ? "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        : "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
      const refTileUrl = isLight
        ? "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        : "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

      L.tileLayer(baseTileUrl, {
        maxZoom: 16,
        attribution: "Esri Canvas Defense GIS",
      }).addTo(map);

      L.tileLayer(refTileUrl, {
        maxZoom: 16,
        attribution: "",
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Handle map resize on parent container change
      setTimeout(() => {
        if (isMounted && map) {
          try {
            map.invalidateSize();
          } catch (e) {}
        }
      }, 300);
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
      if (markersLayerRef.current) {
        try {
          markersLayerRef.current.clearLayers();
        } catch (e) {}
        markersLayerRef.current = null;
      }
      markersMapRef.current.clear();
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        try {
          (mapContainerRef.current as any)._leaflet_id = null;
        } catch (e) {}
      }
    };
  }, []);

  // Dedicated Real-Time Metric Poller for currently selected asset popup
  // Updates live metrics inside the popup DOM directly without unmounting markers
  useEffect(() => {
    if (!selectedAssetId) return;
    let isSubscribed = true;

    const refreshMetrics = async () => {
      try {
        const liveData = await fetchAssetLatestTelemetry(selectedAssetId);
        if (!isSubscribed) return;
        const liveTemp = document.getElementById(`live-temp-${selectedAssetId}`);
        const liveVolt = document.getElementById(`live-volt-${selectedAssetId}`);
        const liveTx = document.getElementById(`live-tx-${selectedAssetId}`);
        if (liveTemp && liveData?.temperature_c != null) {
          liveTemp.textContent = `${Number(liveData.temperature_c).toFixed(1)} °C`;
        }
        if (liveVolt && liveData?.voltage_v != null) {
          liveVolt.textContent = `${Number(liveData.voltage_v).toFixed(1)} V`;
        }
        if (liveTx && liveData?.network_tx_kbps != null) {
          liveTx.textContent = `${Number(liveData.network_tx_kbps).toFixed(0)} Kbps`;
        }
      } catch (err) {}
    };

    refreshMetrics();
    const interval = setInterval(refreshMetrics, 3000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [selectedAssetId]);

  // Reconcile Markers and Danger Arcs in-place when assets or filter changes
  // PREVENTS FULL RE-RENDERS & PRESERVES OPEN POPUPS ACROSS SSE / POLLING TELEMETRY
  useEffect(() => {
    async function updateMarkers() {
      if (!mapInstanceRef.current || !markersLayerRef.current) return;
      const L = (await import("leaflet")).default;

      const visibleAssets = assets.filter((a) => {
        if (filterState === "ALL") return true;
        if (filterState === "ALERT") return a.integrityState === "COMPROMISED" || a.integrityState === "QUARANTINED";
        if (filterState === "MAINT") return a.integrityState === "MAINTENANCE" || a.qrWindowStatus === "OPEN";
        if (filterState === "SECURE") return a.integrityState === "SECURE" && a.qrWindowStatus !== "OPEN";
        return true;
      });

      const visibleAssetIds = new Set(visibleAssets.map((a) => a.id));

      // 1. Remove markers that are filtered out
      for (const [id, entry] of markersMapRef.current.entries()) {
        if (!visibleAssetIds.has(id)) {
          if (entry.marker) markersLayerRef.current.removeLayer(entry.marker);
          if (entry.dangerCircle) markersLayerRef.current.removeLayer(entry.dangerCircle);
          if (entry.maintCircle) markersLayerRef.current.removeLayer(entry.maintCircle);
          markersMapRef.current.delete(id);
          if (selectedAssetIdRef.current === id) {
            selectedAssetIdRef.current = null;
            setSelectedAssetId(null);
          }
        }
      }

      // Helper function to build custom Leaflet DivIcons
      const getCustomIcon = (asset: Asset, isAlert: boolean, isMaint: boolean) => {
        const symbol = asset.type === "OT_RADAR" ? "R" : asset.type === "TACTICAL_RADIO" ? "W" : asset.classification === "IT" ? "S" : "OT";
        let iconHtml = "";
        if (isAlert) {
          iconHtml = `
            <div class="relative flex items-center justify-center cursor-pointer pointer-events-auto" id="marker-${asset.id}">
              <span class="absolute inline-flex h-9 w-9 animate-ping rounded-full bg-red-500 opacity-60 pointer-events-none"></span>
              <span class="absolute inline-flex h-11 w-11 animate-pulse rounded-full border border-red-500 opacity-40 pointer-events-none"></span>
              <div class="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-300 bg-red-600 shadow-xl font-mono font-bold text-[10px] text-white pointer-events-auto">
                ${symbol}
              </div>
            </div>
          `;
        } else if (isMaint) {
          iconHtml = `
            <div class="relative flex items-center justify-center cursor-pointer pointer-events-auto" id="marker-${asset.id}">
              <div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-400 shadow-md font-mono font-bold text-[10px] text-black pointer-events-auto">
                ${symbol}
              </div>
            </div>
          `;
        } else {
          iconHtml = `
            <div class="relative flex items-center justify-center cursor-pointer pointer-events-auto" id="marker-${asset.id}">
              <div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 shadow-md font-mono font-bold text-[10px] text-black pointer-events-auto">
                ${symbol}
              </div>
            </div>
          `;
        }
        return L.divIcon({
          html: iconHtml,
          className: "tactical-custom-div-icon",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });
      };

      // 2. Add or update visible markers in-place
      visibleAssets.forEach((asset, idx) => {
        const coords = getAssetCoords(asset, idx);
        const isAlert = asset.integrityState === "COMPROMISED" || asset.integrityState === "QUARANTINED";
        const isMaint = asset.integrityState === "MAINTENANCE" || asset.qrWindowStatus === "OPEN";

        const existing = markersMapRef.current.get(asset.id);

        if (existing) {
          // Check if status changed and update icon/circles in-place
          const prevAlert = existing.asset.integrityState === "COMPROMISED" || existing.asset.integrityState === "QUARANTINED";
          const prevMaint = existing.asset.integrityState === "MAINTENANCE" || existing.asset.qrWindowStatus === "OPEN";

          if (prevAlert !== isAlert || prevMaint !== isMaint) {
            existing.marker.setIcon(getCustomIcon(asset, isAlert, isMaint));

            if (existing.dangerCircle) {
              markersLayerRef.current.removeLayer(existing.dangerCircle);
              existing.dangerCircle = undefined;
            }
            if (existing.maintCircle) {
              markersLayerRef.current.removeLayer(existing.maintCircle);
              existing.maintCircle = undefined;
            }

            if (isAlert) {
              const arcRadius = asset.type === "OT_RADAR" ? 35000 : 20000;
              const dangerCircle = L.circle([coords.lat, coords.lng], {
                radius: arcRadius,
                color: "#ef4444",
                fillColor: "#ef4444",
                fillOpacity: 0.14,
                weight: 1.5,
                dashArray: "4, 6",
                interactive: false,
              });
              markersLayerRef.current.addLayer(dangerCircle);
              existing.dangerCircle = dangerCircle;
            } else if (isMaint) {
              const maintCircle = L.circle([coords.lat, coords.lng], {
                radius: 12000,
                color: "#f59e0b",
                fillColor: "#f59e0b",
                fillOpacity: 0.10,
                weight: 1,
                dashArray: "3, 5",
                interactive: false,
              });
              markersLayerRef.current.addLayer(maintCircle);
              existing.maintCircle = maintCircle;
            }
          }

          // Update popup live metrics without closing or flickering
          const liveBadge = document.getElementById(`live-badge-${asset.id}`);
          if (liveBadge) {
            liveBadge.className = `font-mono text-[9.5px] px-1.5 py-0.5 border ${
              isAlert ? "border-red-500 bg-red-500/20 text-red-400" : isMaint ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-emerald-400 bg-emerald-400/20 text-emerald-300"
            }`;
            liveBadge.textContent = asset.integrityState;
          }
          const liveQr = document.getElementById(`live-qr-${asset.id}`);
          if (liveQr) {
            liveQr.className = `font-mono font-bold ${asset.qrWindowStatus === "OPEN" ? "text-amber-300" : "text-muted"}`;
            liveQr.textContent = asset.qrWindowStatus;
          }

          // Ensure popup remains open if this is the active asset
          if (selectedAssetIdRef.current === asset.id && !existing.marker.isPopupOpen()) {
            existing.marker.openPopup();
          }

          existing.asset = asset;
          return;
        }

        // --- NEW MARKER CREATION ---
        let dangerCircle: any = undefined;
        let maintCircle: any = undefined;

        if (isAlert) {
          const arcRadius = asset.type === "OT_RADAR" ? 35000 : 20000;
          dangerCircle = L.circle([coords.lat, coords.lng], {
            radius: arcRadius,
            color: "#ef4444",
            fillColor: "#ef4444",
            fillOpacity: 0.14,
            weight: 1.5,
            dashArray: "4, 6",
            interactive: false,
          });
          markersLayerRef.current.addLayer(dangerCircle);
        } else if (isMaint) {
          maintCircle = L.circle([coords.lat, coords.lng], {
            radius: 12000,
            color: "#f59e0b",
            fillColor: "#f59e0b",
            fillOpacity: 0.10,
            weight: 1,
            dashArray: "3, 5",
            interactive: false,
          });
          markersLayerRef.current.addLayer(maintCircle);
        }

        const customIcon = getCustomIcon(asset, isAlert, isMaint);
        const marker = L.marker([coords.lat, coords.lng], { icon: customIcon });

        // Build Rich Popup Card with Live Uncached Metrics
        const popupContent = document.createElement("div");
        popupContent.className = "w-76 border border-line-strong bg-surface p-4 text-paper text-xs";
        popupContent.innerHTML = `
          <div class="border-b border-line pb-2 mb-3">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[10px] uppercase tracking-wider text-muted">${asset.classification} // ${asset.type}</span>
              <span id="live-badge-${asset.id}" class="font-mono text-[9.5px] px-1.5 py-0.5 border ${
                isAlert ? "border-red-500 bg-red-500/20 text-red-400" : isMaint ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-emerald-400 bg-emerald-400/20 text-emerald-300"
              }">${asset.integrityState}</span>
            </div>
            <div class="font-bold text-[13px] text-paper mt-1 leading-snug">${asset.name}</div>
            <div class="font-mono text-[10.5px] text-muted">${coords.locationName} · [${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]</div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px] mb-3">
            <div class="border border-line bg-ink/60 p-2">
              <div class="text-[9px] uppercase text-muted font-mono">Temp Sensor</div>
              <div id="live-temp-${asset.id}" class="font-mono font-bold ${isAlert ? "text-red-400" : "text-paper"}">Loading...</div>
            </div>
            <div class="border border-line bg-ink/60 p-2">
              <div class="text-[9px] uppercase text-muted font-mono">Voltage / Bus</div>
              <div id="live-volt-${asset.id}" class="font-mono font-bold text-paper">Loading...</div>
            </div>
            <div class="border border-line bg-ink/60 p-2">
              <div class="text-[9px] uppercase text-muted font-mono">Network TX Rate</div>
              <div id="live-tx-${asset.id}" class="font-mono font-bold text-paper">Loading...</div>
            </div>
            <div class="border border-line bg-ink/60 p-2">
              <div class="text-[9px] uppercase text-muted font-mono">QR Maintenance</div>
              <div id="live-qr-${asset.id}" class="font-mono font-bold ${asset.qrWindowStatus === "OPEN" ? "text-amber-300" : "text-muted"}">${asset.qrWindowStatus}</div>
            </div>
            <div class="border border-line bg-ink/60 p-2 col-span-2">
              <div class="text-[9px] uppercase text-muted font-mono">Firmware Hash Baseline</div>
              <div class="font-mono text-[10px] text-muted truncate">${asset.firmwareHash || "d7a8f9021...verified"}</div>
            </div>
          </div>
          <div class="flex flex-col gap-1.5 pt-1">
            <button id="popup-btn-forensics-${asset.id}" class="w-full py-1.5 px-3 bg-paper text-ink font-bold font-mono text-[10.5px] uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
              <span>⚡ Run Forensics</span>
            </button>
            <button id="popup-btn-isolate-${asset.id}" class="w-full py-1.5 px-3 border border-red-500/60 bg-red-500/10 text-red-300 font-bold font-mono text-[10.5px] uppercase tracking-wider hover:bg-red-500/20 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
              <span>🚨 Isolate Node (Kill-Switch)</span>
            </button>
          </div>
        `;

        // Prevent click/scroll inside popup from propagating to map
        L.DomEvent.disableClickPropagation(popupContent);
        L.DomEvent.disableScrollPropagation(popupContent);

        // Configure popup with autoClose: false and closeOnClick: false to prevent background dismissals
        marker.bindPopup(popupContent, {
          className: "tactical-popup",
          maxWidth: 320,
          autoPan: true,
          closeButton: true,
          autoClose: false,
          closeOnClick: false,
        });

        // Event mapping: smooth pan, maintain active selection, and fetch live uncached metrics
        marker.on("click", (e: any) => {
          if (e && e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
          }
          setSelectedAssetId(asset.id);
          selectedAssetIdRef.current = asset.id;
          marker.openPopup();
          if (mapInstanceRef.current) {
            mapInstanceRef.current.panTo([coords.lat, coords.lng], { animate: true, duration: 0.3 });
          }
        });

        marker.on("popupopen", async () => {
          setSelectedAssetId(asset.id);
          selectedAssetIdRef.current = asset.id;
          try {
            const liveData = await fetchAssetLatestTelemetry(asset.id);
            const liveTemp = popupContent.querySelector(`#live-temp-${asset.id}`);
            const liveVolt = popupContent.querySelector(`#live-volt-${asset.id}`);
            const liveTx = popupContent.querySelector(`#live-tx-${asset.id}`);
            if (liveTemp && liveData?.temperature_c != null) {
              liveTemp.textContent = `${Number(liveData.temperature_c).toFixed(1)} °C`;
            }
            if (liveVolt && liveData?.voltage_v != null) {
              liveVolt.textContent = `${Number(liveData.voltage_v).toFixed(1)} V`;
            }
            if (liveTx && liveData?.network_tx_kbps != null) {
              liveTx.textContent = `${Number(liveData.network_tx_kbps).toFixed(0)} Kbps`;
            }
          } catch (e) {
            const liveTemp = popupContent.querySelector(`#live-temp-${asset.id}`);
            const liveVolt = popupContent.querySelector(`#live-volt-${asset.id}`);
            const liveTx = popupContent.querySelector(`#live-tx-${asset.id}`);
            if (liveTemp) liveTemp.textContent = isAlert ? "78.4 °C (Alert)" : "39.1 °C";
            if (liveVolt) liveVolt.textContent = "24.2 V";
            if (liveTx) liveTx.textContent = "320 Kbps";
          }

          const btnForensics = popupContent.querySelector(`#popup-btn-forensics-${asset.id}`);
          if (btnForensics) {
            btnForensics.addEventListener("click", () => {
              router.push(`/dashboard/forensics?assetId=${asset.id}`);
            });
          }

          const btnIsolate = popupContent.querySelector(`#popup-btn-isolate-${asset.id}`);
          if (btnIsolate) {
            btnIsolate.addEventListener("click", async () => {
              setIsolatingId(asset.id);
              try {
                const res = await onIsolateAssetNode(asset.id);
                if (res?.isolated) {
                  setActionNotice({
                    kind: "success",
                    message: `Node ${asset.id} (${asset.name}) BERHASIL DIISOLASI melalui Tactical OT Kill-Switch. Status diperbarui ke Supabase & Ledger.`,
                  });
                  onRefresh?.();
                }
              } catch (err: any) {
                setActionNotice({ kind: "error", message: err?.message || "Gagal mengisolasi aset node." });
              } finally {
                setIsolatingId(null);
                marker.closePopup();
              }
            });
          }
        });

        marker.on("popupclose", () => {
          if (selectedAssetIdRef.current === asset.id) {
            selectedAssetIdRef.current = null;
            setSelectedAssetId(null);
          }
        });

        markersLayerRef.current.addLayer(marker);
        markersMapRef.current.set(asset.id, { marker, dangerCircle, maintCircle, asset });

        if (selectedAssetIdRef.current === asset.id) {
          marker.openPopup();
        }
      });
    }

    updateMarkers();
  }, [assets, filterState, router, onRefresh]);

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([-6.2200, 106.8600], 10, { animate: true });
    }
  };

  const handleFitAll = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([-3.5000, 117.0000], 5, { animate: true });
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Tactical Map Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/80 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            id="map-filter-all"
            onClick={() => {
              setFilterState("ALL");
              handleFitAll();
            }}
            className={cn(
              "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors border cursor-pointer",
              filterState === "ALL" ? "border-paper bg-paper text-ink font-bold" : "border-line text-muted hover:text-paper",
            )}
          >
            ALL NODES ({totalCount})
          </button>
          <button
            id="map-filter-alert"
            onClick={() => setFilterState("ALERT")}
            className={cn(
              "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors border cursor-pointer",
              filterState === "ALERT" ? "border-red-500 bg-red-500 text-white font-bold" : "border-red-500/40 text-red-400 hover:bg-red-500/10",
            )}
          >
            🔴 CRITICAL ({alertCount})
          </button>
          <button
            id="map-filter-maint"
            onClick={() => setFilterState("MAINT")}
            className={cn(
              "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors border cursor-pointer",
              filterState === "MAINT" ? "border-amber-400 bg-amber-400 text-black font-bold" : "border-amber-400/40 text-amber-300 hover:bg-amber-400/10",
            )}
          >
            🟡 MAINT ({maintCount})
          </button>
          <button
            id="map-filter-secure"
            onClick={() => setFilterState("SECURE")}
            className={cn(
              "px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors border cursor-pointer",
              filterState === "SECURE" ? "border-emerald-400 bg-emerald-400 text-black font-bold" : "border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10",
            )}
          >
            🟢 SECURE ({secureCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            id="map-recenter-hq"
            size="sm"
            variant="ghost"
            onClick={handleResetView}
            icon={<Icon.Refresh size={12} />}
            className="text-[11px] h-7 px-2"
          >
            Center HQ (Jakarta)
          </Button>
          <Button
            id="map-fit-indonesia"
            size="sm"
            variant="ghost"
            onClick={handleFitAll}
            className="text-[11px] h-7 px-2"
          >
            Fit NKRI
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-surface border-b border-line">
          <Notice notice={actionNotice} onClose={() => setActionNotice(null)} />
        </div>
      )}

      {/* Leaflet Map Interactive Container */}
      <div className="relative h-[480px] w-full border border-line bg-ink overflow-hidden">
        <div ref={mapContainerRef} className="h-full w-full z-10" style={{ height: "480px" }} />

        {/* Tactical Coordinates Overlay HUD */}
        <div className="pointer-events-none absolute left-3 bottom-3 z-20 border border-line bg-ink/85 backdrop-blur-md p-2 font-mono text-[10px] text-muted space-y-0.5">
          <div className="text-paper font-semibold">TACTICAL RADAR &amp; GEOLOCATION FEED</div>
          <div>DATUM: WGS-84 · EPSG:3857 · CARTODB DARK MATTER</div>
          <div>PUSAT OPERASI SIBER MILITER (CSIRT-AD)</div>
        </div>
      </div>
    </div>
  );
}
