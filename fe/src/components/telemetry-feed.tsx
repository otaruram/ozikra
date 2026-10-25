"use client";

import { Icon } from "@/components/icons";
import { Button, cn, EmptyState, ErrorLine, Notice, Panel, Skeleton } from "@/components/ui";
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
  return (
    <div
      className={cn(
        "grid grid-cols-[72px_36px_1fr] gap-3 px-4 py-1.5 font-mono text-[11px] leading-relaxed",
        critical ? "bg-paper text-ink font-semibold" : e.severity === "WARNING" ? "text-paper" : "text-muted",
      )}
    >
      <span className="tabular-nums opacity-70">
        {new Date(e.timestamp).toLocaleTimeString("en-GB", { hour12: false })}
      </span>
      <span>{SOURCE_LABEL[e.source]}</span>
      <span className="break-words">
        <span className={critical ? "" : "text-paper"}>{e.assetId}</span> · {e.message}
        {e.actor && <span className="opacity-60"> — {e.actor}</span>}
      </span>
    </div>
  );
}

/**
 * Live Telemetry & Physical Check-In Stream.
 * Polls the API layer every 5s until a WebSocket / SSE channel is wired.
 */
export function TelemetryFeed({ className }: { className?: string }) {
  const { role } = useSession();
  const stream = useAsyncResource(fetchTelemetryStream, { pollMs: 5000 });
  const trigger = useAction(onTriggerTelemetryTestEvent);
  const canInject = role ? canInjectTelemetryAnomaly(role) : false;

  return (
    <Panel
      className={className}
      eyebrow="Stream"
      title="Live Telemetry & Physical Check-In"
      bodyClassName="flex flex-col gap-3 p-0"
      actions={
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-paper animate-blink" /> Live
        </span>
      }
    >
      <div className={cn("relative overflow-y-auto border-b border-line bg-ink py-2", canInject ? "h-[340px]" : "h-[400px]")}>
        {stream.isLoading && !stream.data && (
          <div className="flex flex-col gap-2 px-4 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3" />
            ))}
          </div>
        )}
        {stream.data && stream.data.length > 0 && stream.data.map((e) => <LogLine key={e.id} e={e} />)}
        {!stream.isLoading && (!stream.data || stream.data.length === 0) && (
          <EmptyState
            className="m-4 border-line"
            icon={<Icon.Pulse size={16} />}
            title="Stream idle"
            message="No telemetry logs ingested yet. Awaiting backend stream..."
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <ErrorLine error={stream.error} />
        {canInject && (
          <>
            <Notice notice={trigger.notice} onClose={() => trigger.setNotice(null)} />
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
              ⚡ Auto-Inject Telemetry Anomaly (Test Event)
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
