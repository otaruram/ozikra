import React from "react";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: number;
}

export const OzikLogo: React.FC<LogoProps> = ({ className = "", showText = true, size = 28 }) => {
  return (
    <div className={`flex items-center gap-2.5 font-mono ${className}`}>
      {/* Tactical Shield & Circuit Vector Icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer Tactical Hex Shield */}
        <polygon
          points="16,2 29,8 29,20 16,30 3,20 3,8"
          className="stroke-zinc-900 dark:stroke-zinc-100"
          strokeWidth="2"
          fill="none"
        />
        {/* Inner Radar Crosshair / Circuit Core */}
        <circle
          cx="16"
          cy="16"
          r="6"
          className="stroke-zinc-900 dark:stroke-zinc-100"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
        <circle cx="16" cy="16" r="2" className="fill-zinc-900 dark:fill-zinc-100" />
        <line x1="16" y1="6" x2="16" y2="10" className="stroke-zinc-900 dark:stroke-zinc-100" strokeWidth="1.5" />
        <line x1="16" y1="22" x2="16" y2="26" className="stroke-zinc-900 dark:stroke-zinc-100" strokeWidth="1.5" />
        <line x1="6" y1="16" x2="10" y2="16" className="stroke-zinc-900 dark:stroke-zinc-100" strokeWidth="1.5" />
        <line x1="22" y1="16" x2="26" y2="16" className="stroke-zinc-900 dark:stroke-zinc-100" strokeWidth="1.5" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none select-none">
          <span className="text-sm font-black tracking-wider uppercase text-zinc-900 dark:text-zinc-100">
            OZIK-SENTINEL
          </span>
          <span className="text-[9px] font-semibold tracking-widest text-zinc-500 uppercase">
            // CORE INFRA PUSSIBERAD
          </span>
        </div>
      )}
    </div>
  );
};

export default OzikLogo;
