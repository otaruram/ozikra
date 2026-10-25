"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui";

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  idPrefix?: string;
}

export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20],
  className = "",
  idPrefix = "table",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-line bg-surface/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs",
        className,
      )}
    >
      {/* Left: Summary and Page Size Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] text-muted">
          Showing <span className="font-bold text-paper">{startItem}</span>–
          <span className="font-bold text-paper">{endItem}</span> of{" "}
          <span className="font-bold text-paper">{totalItems}</span> records
        </span>

        <div className="flex items-center gap-1.5 border-l border-line pl-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Rows:
          </span>
          <div className="inline-flex border border-line bg-ink p-0.5">
            {pageSizeOptions.map((opt) => (
              <button
                key={opt}
                id={`${idPrefix}-page-size-${opt}`}
                type="button"
                onClick={() => onPageSizeChange(opt)}
                className={cn(
                  "cursor-pointer px-2 py-0.5 font-mono text-[10.5px] transition-colors",
                  pageSize === opt
                    ? "bg-paper text-ink font-bold"
                    : "text-muted hover:text-paper hover:bg-paper/[0.05]",
                )}
                title={`Show ${opt} rows per page`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Page Navigation */}
      <div className="flex items-center gap-2">
        <button
          id={`${idPrefix}-pagination-prev`}
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(safePage - 1)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1.5 border border-line-strong bg-surface px-2.5 font-mono text-[11px] transition-colors",
            canPrev
              ? "text-paper hover:border-paper hover:bg-paper hover:text-ink active:scale-95"
              : "cursor-not-allowed opacity-35 text-muted",
          )}
          aria-label="Previous page"
        >
          <Icon.Chevron size={12} className="rotate-90" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1 border border-line bg-ink px-3 py-1 font-mono text-[11px]">
          <span className="text-muted">Page</span>
          <span className="font-bold text-paper">{safePage}</span>
          <span className="text-muted">of</span>
          <span className="text-paper">{totalPages}</span>
        </div>

        <button
          id={`${idPrefix}-pagination-next`}
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(safePage + 1)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1.5 border border-line-strong bg-surface px-2.5 font-mono text-[11px] transition-colors",
            canNext
              ? "text-paper hover:border-paper hover:bg-paper hover:text-ink active:scale-95"
              : "cursor-not-allowed opacity-35 text-muted",
          )}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <Icon.Chevron size={12} className="-rotate-90" />
        </button>
      </div>
    </div>
  );
}

/**
 * Hook for managing pagination state and slicing data rows cleanly.
 */
export function usePagination<T>(items: T[] | null | undefined, defaultPageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalItems = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    if (!items) return [];
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    currentPage: safePage,
    pageSize,
    totalItems,
    totalPages,
    paginatedItems,
    setPage: setCurrentPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
  };
}
