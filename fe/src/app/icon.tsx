import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Tactical Hex Shield */}
          <polygon
            points="16,2 29,8 29,20 16,30 3,20 3,8"
            stroke="#ffffff"
            strokeWidth="2.2"
            fill="none"
          />
          {/* Inner Radar Crosshair / Circuit Core */}
          <circle
            cx="16"
            cy="16"
            r="6"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <circle cx="16" cy="16" r="2.5" fill="#22c55e" />
          <line x1="16" y1="6" x2="16" y2="10" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="16" y1="22" x2="16" y2="26" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="6" y1="16" x2="10" y2="16" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="22" y1="16" x2="26" y2="16" stroke="#ffffff" strokeWidth="1.5" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
