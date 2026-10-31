"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Tag } from "@/components/ui";
import { useSession } from "@/lib/session-context";

interface PendingDispatchRecord {
  id: string;
  name: string;
  email: string;
  nrp: string;
  rank?: string;
  unit?: string;
  role?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  sentAt?: string;
}

const DISPATCH_STORAGE_KEY = "ozikra.pending_registration_dispatch";

export function RegistrationDispatchBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, switchSimulatedRole } = useSession();
  const [dispatch, setDispatch] = useState<PendingDispatchRecord | null>(null);
  const [jumping, setJumping] = useState(false);

  const loadDispatch = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(DISPATCH_STORAGE_KEY);
    if (!raw) {
      setDispatch(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PendingDispatchRecord;
      if (parsed && parsed.name) {
        setDispatch(parsed);
      }
    } catch {
      setDispatch(null);
    }
  }, []);

  useEffect(() => {
    loadDispatch();
    const handler = () => loadDispatch();
    window.addEventListener("ozikra:dispatch-updated", handler);
    return () => window.removeEventListener("ozikra:dispatch-updated", handler);
  }, [loadDispatch, pathname]);

  if (!dispatch) return null;

  const isApproved = dispatch.status === "APPROVED";
  const isRejected = dispatch.status === "REJECTED";

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DISPATCH_STORAGE_KEY);
    }
    setDispatch(null);
  };

  const handleOpenAdminQueue = async () => {
    setJumping(true);
    try {
      if (role !== "SUPER_ADMIN") {
        await switchSimulatedRole("SUPER_ADMIN");
      }
      router.push("/dashboard/admin");
    } finally {
      setJumping(false);
    }
  };

  return (
    <section
      aria-label="Kawat Dinas Status Registrasi Personel"
      className={`relative border bg-surface p-3.5 shadow-sm sm:p-4 ${
        isApproved
          ? "border-accent/60 bg-accent/8"
          : isRejected
          ? "border-crimson/60 bg-crimson/8"
          : "border-brass/65 bg-brass/8"
      }`}
    >
      {/* Top Kartika military dispatch rule */}
      <span
        className={`pointer-events-none absolute left-0 top-0 h-[2px] w-14 ${
          isApproved ? "bg-accent" : isRejected ? "bg-crimson" : "bg-brass"
        }`}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em] text-paper">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isApproved
                    ? "bg-accent"
                    : isRejected
                    ? "bg-crimson"
                    : "animate-ping bg-brass"
                }`}
              />
              ★ KAWAT DINAS // MARKAS PUSSIBERAD-AD
            </span>

            {isApproved ? (
              <Tag tone="default">● Disahkan Super Admin (Approved)</Tag>
            ) : isRejected ? (
              <Tag tone="alert">▲ Pengajuan Ditolak Komando</Tag>
            ) : (
              <Tag tone="brass">◐ Formulir Terkirim · Menunggu Persetujuan Admin</Tag>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted sm:text-[13px]">
            {isApproved ? (
              <>
                Pengajuan kredensial atas nama{" "}
                <strong className="font-semibold text-paper">
                  {dispatch.name}
                </strong>{" "}
                (<span className="font-mono text-[11.5px] text-paper">NRP {dispatch.nrp}</span>)
                telah <strong className="text-accent">resmi disetujui Meja Super Admin</strong> dan dicatat ke rantai audit PostgreSQL.
              </>
            ) : isRejected ? (
              <>
                Berkas registrasi personel atas nama{" "}
                <strong className="font-semibold text-paper">{dispatch.name}</strong>{" "}
                telah ditandai ditolak oleh Meja Super Admin.
              </>
            ) : (
              <>
                Formulir registrasi personel{" "}
                <strong className="font-semibold text-paper">
                  {dispatch.name}
                </strong>{" "}
                (<span className="font-mono text-[11.5px] text-paper">NRP {dispatch.nrp}</span>{" "}
                · {dispatch.unit || "Pussiberad TNI-AD"}) telah diteruskan ke{" "}
                <strong className="font-medium text-paper">
                  Meja Super Admin (Panglima Siber)
                </strong>{" "}
                dan menunggu pengesahan akhir.{" "}
                <span className="font-medium text-paper">
                  Izin Operasi Sementara telah dibuka
                </span>{" "}
                agar Anda dapat langsung menjalankan konsol.
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isApproved && pathname !== "/dashboard/admin" && (
            <Button
              id="dispatch-open-superadmin"
              type="button"
              size="sm"
              variant="outline"
              loading={jumping}
              onClick={handleOpenAdminQueue}
              icon={<Icon.Admin size={12} />}
              className="border-brass/55 bg-surface text-[11px] text-paper hover:border-brass hover:bg-surface-2"
            >
              Cek Antrean Super Admin →
            </Button>
          )}
          <button
            id="dispatch-dismiss-btn"
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-8 cursor-pointer items-center gap-1 border border-line bg-surface px-2.5 font-mono text-[10.5px] text-muted transition-colors hover:border-line-strong hover:text-paper"
          >
            <Icon.Close size={11} />
            <span>Tutup</span>
          </button>
        </div>
      </div>
    </section>
  );
}
