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

export const cn = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Button — Hallmark Craft × Kartika TNI-AD                           */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "outline" | "ghost" | "critical";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink border border-accent font-semibold hover:opacity-92 active:opacity-85 shadow-[0_1px_0_0_var(--brass)]",
  outline:
    "bg-surface/80 text-paper border border-line-strong hover:border-brass hover:bg-surface-2",
  ghost:
    "bg-transparent text-muted border border-transparent hover:text-paper hover:bg-surface-2/80",
  critical:
    "bg-crimson/12 text-crimson border border-crimson/65 hover:bg-crimson hover:text-white animate-pulse-border",
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
        "group inline-flex items-center justify-center gap-2 font-medium tracking-[-0.01em] select-none cursor-pointer",
        "transition-[background-color,border-color,color,opacity] duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-[13.5px]",
        size === "lg" && "h-11 px-5 text-sm sm:h-12 sm:px-6",
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
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
  );
}

/* ------------------------------------------------------------------ */
/* Typography — Editorial Display + Technical Mono                    */
/* ------------------------------------------------------------------ */

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.03em] text-muted",
        className,
      )}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 bg-brass" />
      <span>{children}</span>
    </span>
  );
}

export function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-[12px] tabular-nums", className)}>
      {children}
    </span>
  );
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
    <header className="flex flex-col gap-4 border-b border-line-strong pb-5 md:flex-row md:items-end md:justify-between md:pb-6 animate-fade-up">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Eyebrow className="break-words">{eyebrow}</Eyebrow>
        <h1 className="font-display break-words text-[28px] font-medium leading-[1.08] tracking-[-0.02em] text-paper md:text-[36px]">
          {title}
        </h1>
        {description && (
          <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-muted sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Panel — Mabesad Archival Dossier Frame                             */
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
    <section
      className={cn(
        "relative flex min-w-0 flex-col border border-line bg-surface",
        className,
      )}
    >
      {/* Top Kartika dossier registration rule */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-line-strong/60" />
      <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-8 bg-brass" />

      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface-2/35 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow && (
              <span className="font-mono text-[10.5px] text-subtle">
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="font-display break-words text-[17px] font-medium leading-snug tracking-[-0.01em] text-paper">
                {title}
              </h2>
            )}
          </div>
          {actions && (
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={cn("min-w-0 flex-1 p-4 sm:p-5", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tags & Status — Kartika Semantic Stamps                            */
/* ------------------------------------------------------------------ */

export function Tag({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "inverted" | "alert" | "brass";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-0.5 font-mono text-[10.5px] tracking-[0.02em]",
        tone === "default" &&
          "border-accent/45 bg-accent/10 text-accent font-medium",
        tone === "muted" && "border-line bg-surface-2/70 text-muted",
        tone === "brass" &&
          "border-brass/50 bg-brass/12 text-brass font-medium",
        tone === "inverted" &&
          "border-accent bg-accent text-accent-ink font-semibold",
        tone === "alert" &&
          "border-crimson/70 bg-crimson/12 text-crimson font-semibold animate-pulse-border",
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
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-crimson opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          state === "on" && "bg-accent",
          state === "off" && "border border-muted",
          state === "alert" && "bg-crimson",
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
      return <Tag tone="brass">◐ Maintenance</Tag>;
    case "QUARANTINED":
      return <Tag tone="muted">▪ Quarantined</Tag>;
    case "COMPROMISED":
      return <Tag tone="alert">▲ Compromised</Tag>;
  }
}

/* ------------------------------------------------------------------ */
/* Metric Card — Archival Readiness Ledger Cell                       */
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
        "group relative flex flex-col justify-between gap-5 border p-5 transition-[border-color,background-color] duration-200",
        alert
          ? "border-crimson/75 bg-crimson/10 text-paper"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-0 top-0 h-[2px] w-10",
          alert ? "bg-crimson" : "bg-accent",
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13.5px] font-medium leading-snug text-paper">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            alert ? "text-crimson font-semibold" : "text-brass",
          )}
        >
          {index}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line/70 pt-3">
        {isLoading ? (
          <Skeleton className="h-10 w-16" />
        ) : (
          <span
            className={cn(
              "font-display text-[42px] font-medium leading-none tracking-[-0.03em] tabular-nums",
              alert ? "text-crimson" : "text-paper",
            )}
          >
            {typeof value === "number"
              ? value.toString().padStart(2, "0")
              : "--"}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-[11px]",
            alert ? "text-crimson/90" : "text-muted",
          )}
        >
          {hint}
        </span>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span className={cn("block animate-pulse bg-surface-2", className)} />
  );
}

/* ------------------------------------------------------------------ */
/* Empty / Notice States                                              */
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
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden border border-dashed border-line-strong px-6 py-11 text-center bg-hatch",
        className,
      )}
    >
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center border border-line-strong bg-surface text-brass">
          {icon}
        </div>
      )}
      <p className="font-display text-base font-medium text-paper">{title}</p>
      {message && (
        <p className="max-w-[46ch] text-xs leading-relaxed text-muted">
          {message}
        </p>
      )}
      {action}
    </div>
  );
}

export function Notice({
  notice,
  onClose,
}: {
  notice: ActionNotice;
  onClose?: () => void;
}) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 border px-4 py-3 font-mono text-[11.5px] leading-relaxed animate-fade-up",
        notice.kind === "error" &&
          "border-crimson/65 bg-crimson/12 text-paper",
        notice.kind === "info" &&
          "border-brass/50 bg-surface-2 text-paper",
        notice.kind === "success" &&
          "border-accent/60 bg-accent/10 text-paper",
      )}
    >
      <span>
        <span
          className={cn(
            "font-semibold",
            notice.kind === "error" && "text-crimson",
            notice.kind === "info" && "text-brass",
            notice.kind === "success" && "text-accent",
          )}
        >
          {notice.kind === "error"
            ? "[Galat]"
            : notice.kind === "info"
            ? "[Sistem]"
            : "[Tersahkan]"}
        </span>{" "}
        {notice.message}
      </span>
      {onClose && (
        <button
          onClick={onClose}
          className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="border border-crimson/65 bg-crimson/12 px-3.5 py-2.5 font-mono text-[11.5px] text-paper">
      <span className="font-semibold text-crimson">[Galat]</span> {error}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form Controls — Clean Sentence-Case Labels (Hallmark Craft)        */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && (
        <span className="font-mono text-[10.5px] text-subtle">{hint}</span>
      )}
    </label>
  );
}

const controlClass =
  "h-10 w-full border border-line-strong bg-ink px-3 text-sm text-paper placeholder:text-subtle outline-none transition-[border-color,background-color] duration-150 focus:border-accent";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(controlClass, className)} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(controlClass, "appearance-none pr-9 cursor-pointer", className)}
      >
        {children}
      </select>
      <Icon.Chevron
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
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
      <span className="text-xs font-medium text-muted">{label}</span>
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
          "group flex w-full cursor-pointer items-center gap-4 border border-dashed bg-ink/60 px-4 py-4.5 text-left transition-[border-color,background-color] duration-150",
          dragging
            ? "border-accent bg-accent/10"
            : "border-line-strong hover:border-brass",
          file && "border-solid border-accent bg-accent/6",
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center border transition-colors",
            file
              ? "border-accent bg-accent text-accent-ink"
              : "border-line-strong bg-surface text-muted group-hover:text-brass",
          )}
        >
          {file ? <Icon.File size={16} /> : <Icon.Upload size={16} />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-paper">
            {file ? file.name : "Seret berkas atau klik untuk memilih dokumen"}
          </span>
          <span className="font-mono text-[10.5px] text-muted">
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · ${file.type || "berkas"}`
              : description}
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
            className="ml-auto font-mono text-[11px] text-muted hover:text-crimson"
          >
            Hapus
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data Table — Hallmark Clean Sentence-Case Ledger                   */
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
          <tr className="border-b border-line bg-surface-2/55">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-[11.5px] font-medium tracking-normal text-muted",
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
                className={cn(
                  "border-b border-line transition-colors hover:bg-surface-2/50",
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("whitespace-nowrap px-4 py-3", c.className)}
                  >
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
/* Segmented Tabs                                                     */
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
    <div className="inline-flex max-w-full flex-wrap border border-line-strong bg-ink p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer px-2.5 py-1.5 font-mono text-[11px] transition-colors sm:px-3",
            value === o.value
              ? "bg-accent text-accent-ink font-semibold"
              : "text-muted hover:text-paper",
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
export {
  Pagination,
  usePagination,
  type PaginationProps,
} from "@/components/pagination";
