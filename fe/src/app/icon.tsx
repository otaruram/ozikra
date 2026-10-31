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
          background: "#111913",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "4px",
          border: "1px solid #2b3c2f",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Kartika Hexagonal Defense Shield */}
          <polygon
            points="16,2 28.5,8.5 28.5,21 16,30 3.5,21 3.5,8.5"
            stroke="#59ba82"
            strokeWidth="2"
            fill="none"
          />
          {/* Inner Kartika Eka Paksi 5-Pointed Brass Star */}
          <polygon
            points="16,8.2 17.9,13.6 23.6,13.6 19,17 20.8,22.4 16,19 11.2,22.4 13,17 8.4,13.6 14.1,13.6"
            fill="#d8b35c"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
