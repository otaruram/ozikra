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
      {/* Kartika Eka Paksi Star & Tactical Hexagonal Shield Emblem */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer Tactical Defense Shield */}
        <polygon
          points="16,2 28.5,8.2 28.5,20.2 16,30 3.5,20.2 3.5,8.2"
          stroke="var(--accent)"
          strokeWidth="1.75"
          fill="var(--surface-2)"
        />
        {/* Inner Dossier Perimeter */}
        <polygon
          points="16,5.2 25.5,10 25.5,19 16,26.6 6.5,19 6.5,10"
          stroke="var(--line-strong)"
          strokeWidth="1"
          fill="none"
        />
        {/* Kartika 5-Pointed Brass Insignia Star */}
        <polygon
          points="16,8.8 17.85,13.4 22.8,13.75 19,16.95 20.2,21.8 16,19.15 11.8,21.8 13,16.95 9.2,13.75 14.15,13.4"
          fill="var(--brass)"
        />
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
