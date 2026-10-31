"use client";

import { Icon } from "@/components/icons";
import {
  Button,
  cn,
  EmptyState,
  ErrorLine,
  Notice,
  Panel,
  Skeleton,
} from "@/components/ui";
import { useAction, useAsyncResource } from "@/hooks/use-async";
import { fetchTelemetryStream, onTriggerTelemetryTestEvent } from "@/lib/api";
import { canInjectTelemetryAnomaly } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import type { TelemetryEvent, TelemetrySource } from "@/types/sentinel";

const SOURCE_LABEL: Record<TelemetrySource, string> = {
  NETWORK: "NET",
  FIRMWARE: "FW ",
  PHYSICAL_QR: "QR ",
  SYSTEM: "SYS",
};

function LogLine({ e }: { e: TelemetryEvent }) {
  const critical = e.severity === "CRITICAL";
  const warning = e.severity === "WARNING";
  return (
    <div
      className={cn(
        "grid grid-cols-[70px_38px_1fr] gap-2.5 border-b border-line/40 px-4 py-2 font-mono text-[11px] leading-relaxed",
        critical
          ? "bg-crimson/12 text-paper"
          : warning
          ? "bg-brass/8 text-paper"
          : "text-muted",
      )}
    >
      <span className="tabular-nums text-subtle">
        {new Date(e.timestamp).toLocaleTimeString("en-GB", { hour12: false })}
      </span>
      <span
        className={cn(
          "font-semibold",
          critical ? "text-crimson" : warning ? "text-brass" : "text-accent",
        )}
      >
        {SOURCE_LABEL[e.source]}
      </span>
      <span className="break-words">
        <span
          className={cn(
            "font-semibold",
            critical ? "text-crimson" : "text-paper",
          )}
        >
          {e.assetId}
        </span>{" "}
        · {e.message}
        {e.actor && <span className="text-subtle"> — {e.actor}</span>}
      </span>
    </div>
  );
}

export function TelemetryFeed({ className }: { className?: string }) {
  const { role } = useSession();
  const stream = useAsyncResource(fetchTelemetryStream, { pollMs: 5000 });
  const trigger = useAction(onTriggerTelemetryTestEvent);
  const canInject = role ? canInjectTelemetryAnomaly(role) : false;

  return (
    <Panel
      className={className}
      eyebrow="tail -f /var/pussiberad/siem.stream"
      title="Arus Telemetri & Check-In Fisik"
      bodyClassName="flex flex-col gap-3 p-0"
      actions={
        <span className="flex items-center gap-2 font-mono text-[10.5px] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-blink" />
          Aktif
        </span>
      }
    >
      <div
        className={cn(
          "relative overflow-y-auto border-b border-line bg-ink",
          canInject ? "h-[340px]" : "h-[400px]",
        )}
      >
        {stream.isLoading && !stream.data && (
          <div className="flex flex-col gap-2 px-4 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3" />
            ))}
          </div>
        )}
        {stream.data &&
          stream.data.length > 0 &&
          stream.data.map((e) => <LogLine key={e.id} e={e} />)}
        {!stream.isLoading && (!stream.data || stream.data.length === 0) && (
          <EmptyState
            className="m-4 border-line"
            icon={<Icon.Pulse size={16} />}
            title="Kanal telemetri siaga"
            message="Belum ada paket anomali atau check-in fisik pada ruang kerja Anda."
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
        <ErrorLine error={stream.error} />
        {canInject && (
          <>
            <Notice
              notice={trigger.notice}
              onClose={() => trigger.setNotice(null)}
            />
            <Button
              id="trigger-telemetry-test"
              variant="critical"
              className="w-full"
              icon={<Icon.Bolt size={14} />}
              loading={trigger.isPending}
              onClick={async () => {
                const res = await trigger.run();
                if (res) stream.refetch();
              }}
            >
              ⚡ Uji Injeksi Anomali Telemetri OT/IT
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
