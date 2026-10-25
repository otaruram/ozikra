"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "ozik-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Apply theme class to documentElement
  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    if (t === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    }
  }, []);

  useEffect(() => {
    // 1. Read stored preference or default to tactical dark
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    let initial: Theme = "dark";

    if (stored === "light" || stored === "dark") {
      initial = stored;
    }

    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, [applyTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch (err) {
        console.warn("[Theme] Could not persist theme:", err);
      }
    },
    [applyTheme],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback if used outside provider
    return {
      theme: "dark",
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}

/**
 * Inline script to inject in <head> to prevent Flash of Unstyled Content (FOUC).
 * Runs synchronously before React hydration.
 */
export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var theme = (stored === "light" || stored === "dark") ? stored : "dark";
    var root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    }
  } catch (e) {}
})();
`;
