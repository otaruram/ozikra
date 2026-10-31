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
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
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
      className={`group relative flex h-9 cursor-pointer items-center justify-center gap-2 border border-line-strong bg-surface/70 px-2.5 transition-[border-color,background-color,color] duration-150 hover:border-brass hover:bg-surface-2 hover:text-paper ${
        showLabel ? "px-3" : "w-9"
      } ${className}`}
      aria-label={`Ubah ke mode ${isDark ? "Arsip Terang" : "Bunker Gelap"}`}
      title={`Mode Material: ${isDark ? "Arsip Mabesad (Terang)" : "Bunker Kartika (Gelap)"}`}
    >
      <div className="relative flex items-center justify-center">
        {isDark ? (
          <Sun
            size={14}
            className="text-brass transition-transform duration-300 group-hover:rotate-45"
          />
        ) : (
          <Moon
            size={14}
            className="text-accent transition-transform duration-300 group-hover:-rotate-12"
          />
        )}
      </div>

      {showLabel && (
        <span className="font-mono text-[10.5px] font-medium text-muted group-hover:text-paper">
          {isDark ? "Arsip Terang" : "Bunker Gelap"}
        </span>
      )}

      <span className="sr-only">
        Tema aktif: {theme}. Klik untuk mengganti tema.
      </span>
    </button>
  );
}
