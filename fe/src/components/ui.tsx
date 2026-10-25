"use client";

import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Icon } from "@/components/icons";
import type { ActionNotice } from "@/hooks/use-async";
import type { IntegrityState } from "@/types/sentinel";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "outline" | "ghost" | "critical";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-paper text-ink border border-paper hover:bg-paper/85 active:bg-paper/70",
  outline:
    "bg-transparent text-paper border border-line-strong hover:border-paper hover:bg-paper/[0.04]",
  ghost: "bg-transparent text-muted border border-transparent hover:text-paper hover:bg-paper/[0.05]",
  critical:
    "bg-ink text-paper border border-paper animate-pulse-border hover:bg-paper hover:text-ink",
};

export function Button({
  variant = "outline",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "group inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-all duration-200 select-none cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-paper",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin border border-current border-t-transparent rounded-full" />
  );
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted", className)}>
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px] tabular-nums", className)}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between animate-fade-up">
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-[28px]">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("relative flex flex-col border border-line bg-surface", className)}>
      {/* corner ticks */}
      <span className="pointer-events-none absolute -left-px -top-px h-2 w-2 border-l border-t border-paper/60" />
      <span className="pointer-events-none absolute -right-px -bottom-px h-2 w-2 border-r border-b border-paper/60" />
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tags & status                                                       */
/* ------------------------------------------------------------------ */

export function Tag({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "inverted" | "alert";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        tone === "default" && "border-line-strong text-paper",
        tone === "muted" && "border-line text-muted",
        tone === "inverted" && "border-paper bg-paper text-ink font-semibold",
        tone === "alert" && "border-paper text-paper font-semibold animate-pulse-border",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ state }: { state: "on" | "off" | "alert" }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {state === "alert" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-paper opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          state === "on" && "bg-paper",
          state === "off" && "border border-muted",
          state === "alert" && "bg-paper",
        )}
      />
    </span>
  );
}

export function IntegrityTag({ state }: { state: IntegrityState }) {
  switch (state) {
    case "SECURE":
      return <Tag tone="default">● Secure</Tag>;
    case "MAINTENANCE":
      return <Tag tone="muted">◐ Maintenance</Tag>;
    case "QUARANTINED":
      return <Tag tone="inverted">[Quarantined]</Tag>;
    case "COMPROMISED":
      return <Tag tone="alert">[Critical] Compromised</Tag>;
  }
}

/* ------------------------------------------------------------------ */
/* Metric card                                                         */
/* ------------------------------------------------------------------ */

export function MetricCard({
  label,
  value,
  hint,
  index,
  isLoading,
  emphasis,
}: {
  label: string;
  value: number | null | undefined;
  hint: string;
  index: string;
  isLoading?: boolean;
  emphasis?: boolean;
}) {
  const alert = emphasis && typeof value === "number" && value > 0;
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between gap-6 border p-5 transition-colors duration-300",
        alert ? "border-paper bg-paper text-ink" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-[13px] font-medium leading-snug", alert ? "text-ink" : "text-paper")}>
          {label}
        </span>
        <span className={cn("font-mono text-[10px]", alert ? "text-ink/60" : "text-subtle")}>{index}</span>
      </div>
      <div className="flex flex-col gap-1">
        {isLoading ? (
          <Skeleton className="h-10 w-16" />
        ) : (
          <span className="font-mono text-[40px] font-light leading-none tracking-[-0.04em] tabular-nums">
            {typeof value === "number" ? value.toString().padStart(2, "0") : "--"}
          </span>
        )}
        <span className={cn("font-mono text-[10.5px] uppercase tracking-[0.14em]", alert ? "text-ink/60" : "text-muted")}>
          {hint}
        </span>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse bg-paper/[0.06]", className)} />;
}

/* ------------------------------------------------------------------ */
/* Empty / notice states                                               */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  message,
  icon,
  action,
  className,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden border border-dashed border-line px-6 py-12 text-center bg-hatch",
        className,
      )}
    >
      {icon && <div className="flex h-10 w-10 items-center justify-center border border-line-strong bg-ink text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="max-w-sm font-mono text-[11px] leading-relaxed text-muted">{message}</p>}
      {action}
    </div>
  );
}

export function Notice({ notice, onClose }: { notice: ActionNotice; onClose?: () => void }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 border px-4 py-3 font-mono text-[11.5px] leading-relaxed animate-fade-up",
        notice.kind === "error" && "border-paper bg-paper text-ink",
        notice.kind === "info" && "border-line-strong bg-surface-2 text-paper",
        notice.kind === "success" && "border-paper text-paper",
      )}
    >
      <span>
        <span className="font-semibold">
          {notice.kind === "error" ? "[ERROR]" : notice.kind === "info" ? "[SYSTEM]" : "[ACK]"}
        </span>{" "}
        {notice.message}
        {notice.kind === "info" && (
          <span className="block text-muted">Set NEXT_PUBLIC_OZIKRA_API_URL to activate this action.</span>
        )}
      </span>
      {onClose && (
        <button onClick={onClose} className="cursor-pointer opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="border border-paper bg-paper px-3 py-2 font-mono text-[11px] text-ink">[ERROR] {error}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Eyebrow className="text-[10px]">{label}</Eyebrow>
      {children}
      {hint && <span className="font-mono text-[10.5px] text-subtle">{hint}</span>}
    </label>
  );
}

const controlClass =
  "h-10 w-full border border-line bg-ink px-3 text-sm text-paper placeholder:text-subtle outline-none transition-colors focus:border-paper";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(controlClass, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cn(controlClass, "appearance-none pr-9 cursor-pointer", className)}>
        {children}
      </select>
      <Icon.Chevron size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Dropzone({
  id,
  label,
  accept,
  file,
  onFile,
  description,
}: {
  id: string;
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  description: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow className="text-[10px]">{label}</Eyebrow>
      <button
        id={id}
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-4 border border-dashed px-4 py-5 text-left transition-all",
          dragging ? "border-paper bg-paper/[0.05]" : "border-line-strong hover:border-paper/70",
          file && "border-solid border-paper",
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center border transition-colors",
            file ? "border-paper bg-paper text-ink" : "border-line-strong text-muted group-hover:text-paper",
          )}
        >
          {file ? <Icon.File size={16} /> : <Icon.Upload size={16} />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{file ? file.name : "Drop file or click to browse"}</span>
          <span className="font-mono text-[10.5px] text-muted">
            {file ? `${(file.size / 1024).toFixed(1)} KB · ${file.type || "unknown"}` : description}
          </span>
        </span>
        {file && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
            }}
            className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted hover:text-paper"
          >
            Clear
          </span>
        )}
      </button>
      <input ref={ref} type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data table                                                          */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  emptyTitle,
  emptyMessage,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyTitle: string;
  emptyMessage: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-line">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3.5">
                    <Skeleton className="h-3 w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))}
          {!isLoading &&
            rows?.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn("border-b border-line transition-colors hover:bg-paper/[0.025]", rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("whitespace-nowrap px-4 py-3", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!isLoading && (!rows || rows.length === 0) && (
        <EmptyState
          className="m-4"
          icon={<Icon.Registry size={16} />}
          title={emptyTitle}
          message={emptyMessage}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented tabs                                                      */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex border border-line bg-ink p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors",
            value === o.value ? "bg-paper text-ink" : "text-muted hover:text-paper",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Re-export Pagination                                               */
/* ------------------------------------------------------------------ */
export { Pagination, usePagination, type PaginationProps } from "@/components/pagination";

