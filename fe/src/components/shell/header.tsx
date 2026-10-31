"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { openTacticalGuideTour } from "@/components/shell/tactical-guide-tour";
import { cn, Tag } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { canAccess, type RouteKey } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import {
  ROLE_LABEL,
  TACTICAL_ROLES,
  type TacticalRole,
} from "@/types/sentinel";

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
        new Date().toLocaleTimeString("en-GB", {
          hour12: false,
          timeZone: "Asia/Jakarta",
        }) + " WIB",
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
    <header className="sticky top-0 z-30 flex h-15 shrink-0 items-center gap-2 border-b border-line bg-ink/95 px-3 backdrop-blur-md sm:gap-3 sm:px-4 md:px-6">
      <button
        id="header-toggle-sidebar"
        onClick={onToggleSidebar}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border border-line-strong bg-surface text-muted transition-colors hover:border-brass hover:text-paper lg:hidden"
        aria-label="Buka navigasi"
      >
        <Icon.Menu size={16} />
      </button>

      {/* Operational Masthead Status */}
      <div className="hidden items-center gap-2.5 border border-line bg-surface/80 px-3 py-1.5 md:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-45" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-xs font-medium text-paper">
          {engine.mode === "CLOUD_SANDBOX" ? "Posko Siber Aktif" : "Mode Air-Gapped"}
        </span>
        <span className="text-subtle">·</span>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {clock}
        </span>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <button
          id="header-open-guide"
          type="button"
          onClick={() => {
            setRoleOpen(false);
            setUserOpen(false);
            openTacticalGuideTour();
          }}
          title="Buka Panduan Interaktif Konsol"
          className="flex h-9 w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 border border-brass/50 bg-brass/10 font-mono text-[11px] font-semibold text-brass transition-colors hover:border-brass hover:bg-brass/20 sm:w-auto sm:px-2.5"
        >
          <span>?</span>
          <span className="hidden sm:inline">Panduan</span>
        </button>

        <ThemeToggle id="header-theme-toggle" />

        {/* Switch Role Simulator (static on mobile so dropdown spans full header width with safe inset) */}
        <div ref={roleRef} className="sm:relative">
          <button
            id="header-role-simulator"
            disabled={isSwitching}
            onClick={() => {
              setUserOpen(false);
              setRoleOpen((v) => !v);
            }}
            className="flex h-9 max-w-[155px] cursor-pointer items-center gap-1.5 border border-line-strong bg-surface/80 px-2 transition-colors hover:border-brass disabled:opacity-60 sm:max-w-none sm:gap-2 sm:px-3"
          >
            {isSwitching ? (
              <>
                <Icon.Refresh size={12} className="shrink-0 animate-spin text-accent" />
                <span className="truncate font-mono text-[10.5px] text-paper">
                  Memutar JWT…
                </span>
              </>
            ) : (
              <>
                <span className="hidden text-xs text-muted sm:inline">Peran:</span>
                <Tag tone="brass" className="max-w-[116px] truncate sm:max-w-none">
                  {ROLE_LABEL[role]}
                </Tag>
                <Icon.Chevron
                  size={12}
                  className={cn(
                    "shrink-0 text-muted transition-transform",
                    roleOpen && "rotate-180",
                  )}
                />
              </>
            )}
          </button>

          {roleOpen && (
            <div className="absolute inset-x-3 top-[calc(100%+6px)] z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto border border-line-strong bg-surface p-2 shadow-2xl animate-fade-up sm:inset-x-auto sm:right-0 sm:top-11 sm:w-82">
              <div className="border-b border-line px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[15px] font-medium leading-snug text-paper">
                    Simulasi Otoritas Peran Militer
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isSwitching && (
                      <Icon.Refresh size={11} className="animate-spin text-accent" />
                    )}
                    <button
                      type="button"
                      onClick={() => setRoleOpen(false)}
                      aria-label="Tutup menu peran"
                      className="flex h-6 w-6 cursor-pointer items-center justify-center border border-line text-muted hover:border-line-strong hover:text-paper sm:hidden"
                    >
                      <Icon.Close size={12} />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Beralih kompartemen tugas tanpa mengubah identitas email aktif Anda.
                </p>
                <div className="mt-2 flex items-center gap-1.5 border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-paper">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="truncate" title={session.user.email}>
                    {session.user.email}
                  </span>
                </div>
              </div>

              <div className="mt-1.5 flex flex-col gap-1">
                {TACTICAL_ROLES.map((r) => (
                  <button
                    key={r}
                    id={`role-option-${r.toLowerCase()}`}
                    disabled={isSwitching}
                    onClick={() => pick(r)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                      r === role
                        ? "border-accent/55 bg-accent/12 text-paper"
                        : "border-transparent hover:bg-surface-2",
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] font-semibold text-paper">
                        {ROLE_LABEL[r]}
                      </span>
                      <span className="font-mono text-[10.5px] leading-snug text-muted">
                        {r === "SUPER_ADMIN"
                          ? "Otoritas penuh lintas kompartemen"
                          : r === "COMMANDER"
                          ? "Komando taktis & isolasi Kill-Switch"
                          : r === "LOGISTICS_OFFICER"
                          ? "Audit SBOM & penerbitan Paspor QR"
                          : "Investigasi forensik & berkas BAIFS"}
                      </span>
                    </span>
                    {r === role ? (
                      <span className="shrink-0 border border-accent/45 bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                        Aktif
                      </span>
                    ) : isSwitching ? (
                      <Icon.Refresh size={10} className="shrink-0 animate-spin text-muted" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Officer Dossier Menu */}
        <div ref={userRef} className="sm:relative">
          <button
            id="header-user-menu"
            onClick={() => {
              setRoleOpen(false);
              setUserOpen((v) => !v);
            }}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border border-line-strong bg-surface-2 font-mono text-[11px] font-semibold text-brass transition-colors hover:border-brass hover:bg-accent hover:text-accent-ink"
            aria-label="Menu personel"
          >
            {initials}
          </button>
          {userOpen && (
            <div className="absolute inset-x-3 top-[calc(100%+6px)] z-50 border border-line-strong bg-surface shadow-2xl animate-fade-up sm:inset-x-auto sm:right-0 sm:top-11 sm:w-72">
              <div className="border-b border-line bg-surface-2/40 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base font-medium text-paper">
                    {session.user.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => setUserOpen(false)}
                    aria-label="Tutup menu profil"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border border-line text-muted hover:text-paper sm:hidden"
                  >
                    <Icon.Close size={12} />
                  </button>
                </div>
                <p className="truncate font-mono text-[11px] text-muted">
                  {session.user.email}
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-brass">
                  ★ {session.provider.replace("_", " ")} · NRP {session.user.nrp || "—"}
                </p>
              </div>
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-xs text-muted">Tampilan Material</span>
                <ThemeToggle showLabel />
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  openTacticalGuideTour();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2.5 text-left text-[13px] text-brass transition-colors hover:bg-surface-2 hover:text-paper"
              >
                <span className="font-mono text-xs font-bold">★</span> Panduan Interaktif Konsol
              </button>
              <button
                onClick={() => {
                  setUserOpen(false);
                  router.push("/dashboard/admin");
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-paper"
              >
                <Icon.Admin size={14} /> Berkas Profil &amp; RBAC
              </button>
              <button
                id="header-sign-out"
                onClick={async () => {
                  setUserOpen(false);
                  await signOut();
                  router.replace("/");
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-[13px] text-crimson transition-colors hover:bg-crimson/12"
              >
                <Icon.Logout size={14} /> Akhiri Sesi Dinas
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
