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
    label: "Overview",
    items: [{ key: "command", label: "Command Center", href: "/dashboard", icon: Icon.Command }],
  },
  {
    label: "Core Operations",
    items: [
      { key: "gatekeeper", label: "Supply-Chain Gatekeeper", href: "/dashboard/gatekeeper", icon: Icon.Gate, phase: "01" },
      { key: "siem", label: "Live SIEM & QR Check-In", href: "/dashboard/siem", icon: Icon.Pulse, phase: "02" },
      { key: "forensics", label: "AI Digital Forensics", href: "/dashboard/forensics", icon: Icon.Forensic, phase: "03" },
    ],
  },
  {
    label: "Registry & Audit",
    items: [
      { key: "assets", label: "IT/OT Asset Registry", href: "/dashboard/assets", icon: Icon.Registry },
      { key: "ledger", label: "Immutable Audit Ledger", href: "/dashboard/ledger", icon: Icon.Ledger },
    ],
  },
  {
    label: "Administration",
    items: [{ key: "admin", label: "Profile, RBAC & Engine", href: "/dashboard/admin", icon: Icon.Admin }],
  },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { role, engine } = useSession();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line bg-surface transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Brand */}
      <Link href="/" className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <OzikLogo size={24} />
      </Link>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter((item) => (role ? canAccess(item.key, role) : true));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className={cn(gi > 0 && "mt-6")}>
              <div className="mb-2 flex items-center gap-2 px-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-subtle">{group.label}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <ul className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const active =
                    item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        id={`nav-${item.key}`}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all duration-200",
                          active
                            ? "bg-paper text-ink font-medium"
                            : "text-muted hover:bg-paper/[0.05] hover:text-paper",
                        )}
                      >
                        <item.icon size={15} />
                        <span className="flex-1 truncate">
                          {item.key === "admin" && role
                            ? role === "SUPER_ADMIN"
                              ? "Profile, RBAC & Engine"
                              : role === "COMMANDER"
                              ? "Profile & Engine"
                              : "Officer Profile"
                            : item.label}
                        </span>
                        {item.phase && (
                          <span className={cn("font-mono text-[9.5px]", active ? "text-ink/60" : "text-subtle")}>
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

      {/* Engine & Theme footer */}
      <div className="shrink-0 space-y-3 border-t border-line p-4">
        <div className="flex items-center justify-between border border-line bg-surface-2/60 px-3 py-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">Theme</span>
          <ThemeToggle id="sidebar-theme-toggle" showLabel className="h-7 text-xs" />
        </div>
        <div className="flex flex-col gap-2 border border-line bg-ink p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">AI Engine</span>
            <span className="h-1.5 w-1.5 rounded-full bg-paper animate-blink" />
          </div>
          <span className="font-mono text-[11px]">
            {engine.mode === "CLOUD_SANDBOX" ? "CLOUD SANDBOX" : "ON-PREM AIR-GAPPED"}
          </span>
          <span className="truncate font-mono text-[10px] text-subtle">{engine.modelName || "—"}</span>
        </div>
      </div>
    </aside>
  );
}
