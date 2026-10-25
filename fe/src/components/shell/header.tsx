"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cn, Tag } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { canAccess, type RouteKey } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import { ROLE_LABEL, TACTICAL_ROLES, type TacticalRole } from "@/types/sentinel";

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onOutside);
  useEffect(() => {
    callbackRef.current = onOutside;
  }, [onOutside]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callbackRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return ref;
}

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, role, engine, switchSimulatedRole, signOut } = useSession();
  const [roleOpen, setRoleOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const roleRef = useClickOutside(() => setRoleOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Jakarta" }) + " WIB",
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!session || !role) return null;

  const pick = async (r: TacticalRole) => {
    if (r === role) {
      setRoleOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      await switchSimulatedRole(r);
    } finally {
      setIsSwitching(false);
      setRoleOpen(false);
    }

    // Route auto-redirect if current route is unauthorized for the newly selected role
    const routeKey = pathname.split("/")[2] as RouteKey | undefined;
    if (routeKey && !canAccess(routeKey, r)) {
      router.replace("/dashboard");
    } else {
      router.refresh();
    }
  };

  const initials = session.user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-ink/80 px-4 backdrop-blur-xl md:px-6">
      <button
        id="header-toggle-sidebar"
        onClick={onToggleSidebar}
        className="flex h-9 w-9 cursor-pointer items-center justify-center border border-line text-muted hover:text-paper lg:hidden"
        aria-label="Toggle navigation"
      >
        <Icon.Menu size={16} />
      </button>

      {/* Engine status */}
      <div className="hidden items-center gap-2.5 border border-line px-3 py-1.5 md:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-paper opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-paper" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">
          {engine.mode === "CLOUD_SANDBOX" ? "Cloud Sandbox" : "Air-Gapped"}
        </span>
        <span className="font-mono text-[10.5px] text-subtle">·</span>
        <span className="font-mono text-[10.5px] tabular-nums text-muted">{clock}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Global Dark / Light Mode Theme Toggle */}
        <ThemeToggle id="header-theme-toggle" />

        {/* Switch Role Simulator */}
        <div ref={roleRef} className="relative">
          <button
            id="header-role-simulator"
            disabled={isSwitching}
            onClick={() => setRoleOpen((v) => !v)}
            className="flex h-9 cursor-pointer items-center gap-2.5 border border-line-strong px-3 transition-colors hover:border-paper disabled:opacity-60"
          >
            {isSwitching ? (
              <>
                <Icon.Refresh size={12} className="animate-spin text-paper" />
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper">Switching JWT...</span>
              </>
            ) : (
              <>
                <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted sm:inline">Role</span>
                <Tag tone="inverted">{role.replace("_", " ")}</Tag>
                <Icon.Chevron size={12} className={cn("text-muted transition-transform", roleOpen && "rotate-180")} />
              </>
            )}
          </button>
          {roleOpen && (
            <div className="absolute right-0 top-11 w-72 border border-line-strong bg-surface p-1 shadow-2xl shadow-black animate-fade-up z-50">
              <div className="border-b border-line px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">Switch Role Simulator</p>
                  {isSwitching && <Icon.Refresh size={11} className="animate-spin text-paper" />}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-subtle">
                  Evaluate each tactical perspective with a single account.
                </p>
              </div>
              {TACTICAL_ROLES.map((r) => (
                <button
                  key={r}
                  id={`role-option-${r.toLowerCase()}`}
                  disabled={isSwitching}
                  onClick={() => pick(r)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                    r === role ? "bg-paper text-ink" : "hover:bg-paper/[0.05]",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium">{ROLE_LABEL[r]} ({r})</span>
                    <span className={cn("font-mono text-[10px]", r === role ? "text-ink/60" : "text-subtle")}>
                      {r === "SUPER_ADMIN"
                        ? "Full Tactical Authority"
                        : r === "COMMANDER"
                        ? "Command & Kill-Switch Authority"
                        : r === "LOGISTICS_OFFICER"
                        ? "Supply Chain & SBOM Intake"
                        : "Forensic Investigation & BAP"}
                    </span>
                  </span>
                  {r === role ? (
                    <span className="font-mono text-[10px] font-bold">ACTIVE</span>
                  ) : isSwitching ? (
                    <Icon.Refresh size={10} className="animate-spin text-muted" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            id="header-user-menu"
            onClick={() => setUserOpen((v) => !v)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center border border-line-strong font-mono text-[11px] font-semibold transition-colors hover:bg-paper hover:text-ink"
            aria-label="User menu"
          >
            {initials}
          </button>
          {userOpen && (
            <div className="absolute right-0 top-11 w-64 border border-line-strong bg-surface shadow-2xl shadow-black animate-fade-up">
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-medium">{session.user.name}</p>
                <p className="truncate font-mono text-[11px] text-muted">{session.user.email}</p>
                <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-subtle">
                  via {session.provider.replace("_", " ")}
                </p>
              </div>
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="font-mono text-[11px] text-muted">Appearance</span>
                <ThemeToggle showLabel />
              </div>
              <button
                onClick={() => {
                  setUserOpen(false);
                  router.push("/dashboard/admin");
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-muted hover:bg-paper/[0.05] hover:text-paper"
              >
                <Icon.Admin size={14} /> Officer Profile
              </button>
              <button
                id="header-sign-out"
                onClick={() => {
                  signOut();
                  router.push("/");
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-[13px] text-muted hover:bg-paper hover:text-ink"
              >
                <Icon.Logout size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
