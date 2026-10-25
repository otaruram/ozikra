"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

interface ThemeToggleProps {
  id?: string;
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ThemeToggle({
  id = "theme-toggle-btn",
  showLabel = false,
  className = "",
  size = "md",
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Avoid hydration mismatch by rendering a placeholder box with matching dimensions
    return (
      <div
        className={`h-9 w-9 shrink-0 border border-line-strong bg-transparent opacity-40 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      id={id}
      onClick={toggleTheme}
      className={`group relative flex h-9 cursor-pointer items-center justify-center gap-2 border border-line-strong bg-surface/50 px-2.5 transition-all duration-200 hover:border-paper hover:bg-surface hover:text-paper ${
        showLabel ? "px-3" : "w-9"
      } ${className}`}
      aria-label={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
      title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
    >
      <div className="relative flex items-center justify-center">
        {isDark ? (
          <Sun
            size={15}
            className="text-muted transition-transform duration-300 group-hover:rotate-45 group-hover:text-paper"
          />
        ) : (
          <Moon
            size={15}
            className="text-muted transition-transform duration-300 group-hover:-rotate-12 group-hover:text-paper"
          />
        )}
      </div>

      {showLabel && (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-paper">
          {isDark ? "Light" : "Dark"}
        </span>
      )}

      {/* Screen reader notification */}
      <span className="sr-only">
        Current theme: {theme}. Click to switch theme.
      </span>
    </button>
  );
}
