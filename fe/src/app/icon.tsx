import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b140e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "14px",
          border: "2px solid #294231",
        }}
      >
        <svg
          width="58"
          height="58"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Kartika Cyber Defense Shield */}
          <path
            d="M32 6 L55 15.5 V33.5 C55 46.5 45.2 55.2 32 59 C18.8 55.2 9 46.5 9 33.5 V15.5 L32 6 Z"
            fill="#14261a"
            stroke="#e2bc5a"
            strokeWidth="3.2"
          />
          {/* Inner Tactical Cyber Emerald Perimeter */}
          <path
            d="M32 10.5 L50.5 18.2 V33 C50.5 43.4 42.6 50.6 32 54 C21.4 50.6 13.5 43.4 13.5 33 V18.2 L32 10.5 Z"
            fill="none"
            stroke="#59ba82"
            strokeWidth="1.5"
            strokeDasharray="5 2.5"
          />
          <line x1="32" y1="11" x2="32" y2="16" stroke="#59ba82" strokeWidth="1.8" />
          <line x1="32" y1="48" x2="32" y2="53" stroke="#59ba82" strokeWidth="1.8" />
          <line x1="14" y1="32" x2="19" y2="32" stroke="#59ba82" strokeWidth="1.8" />
          <line x1="45" y1="32" x2="50" y2="32" stroke="#59ba82" strokeWidth="1.8" />
          {/* 5-Pointed Kartika Eka Paksi Gold Star */}
          <polygon
            points="32,14.5 36.6,25.6 48.6,26.4 39.3,34.1 42.3,45.8 32,39.3 21.7,45.8 24.7,34.1 15.4,26.4 27.4,25.6"
            fill="#f0c965"
            stroke="#0b140e"
            strokeWidth="1.2"
          />
          {/* Cyber Core */}
          <circle cx="32" cy="31.8" r="3.4" fill="#0d1a12" stroke="#59ba82" strokeWidth="1.6" />
          <circle cx="32" cy="31.8" r="1.4" fill="#59ba82" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
