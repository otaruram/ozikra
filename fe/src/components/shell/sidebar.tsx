"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Icon } from "@/components/icons";
import { OzikLogo } from "@/components/brand/OzikLogo";
import { cn } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { canAccess, type RouteKey } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";

interface NavItem {
  key: RouteKey;
  label: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  phase?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Komando Utama",
    items: [
      {
        key: "command",
        label: "Command Center",
        href: "/dashboard",
        icon: Icon.Command,
      },
    ],
  },
  {
    label: "Tiga Fase Operasi",
    items: [
      {
        key: "gatekeeper",
        label: "Supply-Chain Gatekeeper",
        href: "/dashboard/gatekeeper",
        icon: Icon.Gate,
        phase: "I",
      },
      {
        key: "siem",
        label: "Live SIEM & QR Check-In",
        href: "/dashboard/siem",
        icon: Icon.Pulse,
        phase: "II",
      },
      {
        key: "forensics",
        label: "AI Digital Forensics",
        href: "/dashboard/forensics",
        icon: Icon.Forensic,
        phase: "III",
      },
    ],
  },
  {
    label: "Registri & Buku Audit",
    items: [
      {
        key: "assets",
        label: "IT/OT Asset Registry",
        href: "/dashboard/assets",
        icon: Icon.Registry,
      },
      {
        key: "ledger",
        label: "Immutable Audit Ledger",
        href: "/dashboard/ledger",
        icon: Icon.Ledger,
      },
    ],
  },
  {
    label: "Otoritas & Mesin AI",
    items: [
      {
        key: "admin",
        label: "Profile, RBAC & Engine",
        href: "/dashboard/admin",
        icon: Icon.Admin,
      },
    ],
  },
];

export function Sidebar({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const { role, engine } = useSession();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-line bg-surface transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Top Kartika Classification Ribbon */}
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-1.5 font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="text-brass">★</span> Kartika Cyber · TNI-AD
        </span>
        <span className="text-subtle">v2.6</span>
      </div>

      {/* Brand Masthead */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex h-15 shrink-0 items-center border-b border-line px-5"
      >
        <OzikLogo size={26} />
      </Link>

      {/* Dossier Navigation Index */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-5">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter((item) =>
            role ? canAccess(item.key, role) : true,
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className={cn(gi > 0 && "mt-5")}>
              <div className="mb-1.5 flex items-center gap-2 px-2">
                <span className="text-[11px] font-medium text-subtle">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-line/70" />
              </div>
              <ul className="flex flex-col gap-1">
                {visibleItems.map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        id={`nav-${item.key}`}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-2.5 border px-3 py-2 text-[13px] transition-[background-color,border-color,color] duration-150",
                          active
                            ? "border-accent/45 bg-accent/12 text-paper font-medium"
                            : "border-transparent text-muted hover:border-line hover:bg-surface-2/60 hover:text-paper",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0 transition-colors",
                            active
                              ? "text-accent"
                              : "text-subtle group-hover:text-paper",
                          )}
                        >
                          <item.icon size={15} />
                        </span>
                        <span className="flex-1 truncate">
                          {item.key === "admin" && role
                            ? role === "SUPER_ADMIN"
                              ? "Profile, RBAC & Engine"
                              : role === "COMMANDER"
                              ? "Profile & Engine"
                              : "Profil Perwira"
                            : item.label}
                        </span>
                        {item.phase && (
                          <span
                            className={cn(
                              "font-display text-xs italic",
                              active ? "text-brass font-semibold" : "text-subtle",
                            )}
                          >
                            {item.phase}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Engine & Material Colophon Footer */}
      <div className="shrink-0 space-y-2.5 border-t border-line bg-surface-2/30 p-3.5">
        <div className="flex items-center justify-between border border-line bg-surface px-3 py-1.5">
          <span className="text-[11px] text-muted">Material UI</span>
          <ThemeToggle
            id="sidebar-theme-toggle"
            showLabel
            className="h-7 border-0 bg-transparent px-1.5 text-xs hover:bg-transparent"
          />
        </div>
        <div className="flex flex-col gap-1.5 border border-line bg-ink px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">
              Mesin Inferensi AI
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-blink" />
          </div>
          <span className="font-mono text-[11px] font-medium text-paper">
            {engine.mode === "CLOUD_SANDBOX"
              ? "Cloud Gateway · Aktif"
              : "On-Prem Air-Gapped"}
          </span>
          <span className="truncate font-mono text-[10px] text-subtle">
            {engine.modelName || "—"}
          </span>
        </div>
      </div>
    </aside>
  );
}
