import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 20,
          background: "#09090b",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          border: "1px solid #27272a",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <polygon points="16,2 29,8 29,20 16,30 3,20 3,8" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="3" fill="#22c55e" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
