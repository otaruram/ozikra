import React from "react";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: number;
}

export const OzikLogo: React.FC<LogoProps> = ({
  className = "",
  showText = true,
  size = 28,
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Kartika Eka Paksi Gold Beveled Star & Cyber Aegis Shield Emblem */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="14"
          fill="#0b140e"
          stroke="var(--line-strong)"
          strokeWidth="2"
        />
        <path
          d="M32 6 L55 15.5 V33.5 C55 46.5 45.2 55.2 32 59 C18.8 55.2 9 46.5 9 33.5 V15.5 L32 6 Z"
          fill="#14261a"
          stroke="var(--brass)"
          strokeWidth="3"
          strokeLinejoin="miter"
        />
        <path
          d="M32 10.5 L50.5 18.2 V33 C50.5 43.4 42.6 50.6 32 54 C21.4 50.6 13.5 43.4 13.5 33 V18.2 L32 10.5 Z"
          fill="none"
          stroke="#59ba82"
          strokeWidth="1.6"
        />
        <line x1="32" y1="11" x2="32" y2="16.5" stroke="#59ba82" strokeWidth="1.8" />
        <line x1="32" y1="47.5" x2="32" y2="53" stroke="#59ba82" strokeWidth="1.8" />
        <line x1="13.5" y1="32" x2="19" y2="32" stroke="#59ba82" strokeWidth="1.8" />
        <line x1="45" y1="32" x2="50.5" y2="32" stroke="#59ba82" strokeWidth="1.8" />
        <polygon
          points="32,14 36.8,25.4 49,26.2 39.5,34.1 42.6,46 32,39.4 21.4,46 24.5,34.1 15,26.2 27.2,25.4"
          fill="#ecc560"
          stroke="#0b140e"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <polygon
          points="32,14 36.8,25.4 49,26.2 39.5,34.1 42.6,46 32,39.4"
          fill="#fff4c2"
          fillOpacity="0.35"
        />
        <circle cx="32" cy="31.8" r="3.4" fill="#0d1a12" stroke="#59ba82" strokeWidth="1.6" />
        <circle cx="32" cy="31.8" r="1.4" fill="#59ba82" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-paper">
              Ozik-Sentinel
            </span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-accent sm:inline-block" />
          </div>
          <span className="mt-0.5 font-mono text-[9.5px] tracking-[0.06em] text-muted">
            Pussiberad · Kartika TNI-AD
          </span>
        </div>
      )}
    </div>
  );
};

export default OzikLogo;
