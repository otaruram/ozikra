import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
});

export const Icon = {
  Logo: ({ size = 22, ...p }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...p}
    >
      <polygon
        points="16,2 29,8 29,20 16,30 3,20 3,8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <circle
        cx="16"
        cy="16"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      <line x1="16" y1="6" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="16" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" />
      <line x1="22" y1="16" x2="26" y2="16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  Command: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  Gate: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  Pulse: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M2 12h4l3-8 4 16 3-8h6" />
    </svg>
  ),
  Forensic: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5.5 5.5M8 10.5h5M10.5 8v5" />
    </svg>
  ),
  Registry: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="4" width="18" height="5" />
      <rect x="3" y="11" width="18" height="5" />
      <path d="M3 18h18M7 6.5h.01M7 13.5h.01" />
    </svg>
  ),
  Ledger: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <path d="M10 6.5h4v11h-4" />
    </svg>
  ),
  Admin: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  Upload: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  ),
  QR: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4" />
    </svg>
  ),
  Bolt: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  Power: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 2v10M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  ),
  File: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M14 3H6v18h12V7l-4-4Z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  ),
  Search: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  ),
  Lock: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  Chevron: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Arrow: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Logout: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </svg>
  ),
  Refresh: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  ),
  Menu: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  Google: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...p}>
      <path
        fill="currentColor"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z"
      />
    </svg>
  ),
  Shield: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 2 3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5Z" />
    </svg>
  ),
  ShieldAlert: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 2 3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5Z" />
      <path d="M12 8v4M12 16h.01" strokeWidth={2} />
    </svg>
  ),
  Alert: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="m21.7 18-8.5-15a1.4 1.4 0 0 0-2.4 0l-8.5 15A1.4 1.4 0 0 0 3.5 20h17a1.4 1.4 0 0 0 1.2-2ZM12 9v4M12 17h.01" />
    </svg>
  ),
};
