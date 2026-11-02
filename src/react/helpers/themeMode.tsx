import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "auto";

// Event mechanism to sync standalone functions with React Context
type ThemeChangeListener = (mode: ThemeMode) => void;
const listeners = new Set<ThemeChangeListener>();

function notifyThemeChange() {
  syncThemeColor();
  const mode = getCurrentThemeMode();
  listeners.forEach((listener) => listener(mode));
}

function subscribeToThemeChange(listener: ThemeChangeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Background colours the system status/navigation bars pick up in an installed PWA. Keeping the
// <meta name="theme-color"> in step with the active theme makes those bars blend with the app instead
// of showing the old fixed indigo block behind Android's navigation buttons.
const THEME_BAR_COLOR = { dark: "#17181d", light: "#f7f5ef" } as const;

export function syncThemeColor(): void {
  if (typeof document === "undefined") return;
  const dark = document.body.classList.contains("dark");
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", dark ? THEME_BAR_COLOR.dark : THEME_BAR_COLOR.light);
}

function updateTheme(darkPreferred: boolean): void {
  if (darkPreferred) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
  syncThemeColor();
}

let currentMediaQuery: MediaQueryList | null = null;

/**
 * Switch to dark mode by adding the "dark" class to document.body.
 */
export function switchToDarkMode(): void {
  // Clear any auto mode listener if present.
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
    currentMediaQuery = null;
  }
  document.body.classList.add("dark");
  notifyThemeChange();
}

/**
 * Switch to light mode by removing the "dark" class from document.body.
 */
export function switchToLightMode(): void {
  // Clear any auto mode listener if present.
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
    currentMediaQuery = null;
  }
  document.body.classList.remove("dark");
  notifyThemeChange();
}

/**
 * Switch to auto mode. This function immediately applies the user's color scheme preference
 * and listens for system preference changes to update the theme automatically.
 * It uses the onchange property instead of addEventListener to avoid TypeScript issues.
 */
export function switchToAutoMode(): void {
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
  }
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.onchange = (e: MediaQueryListEvent) => {
    updateTheme(e.matches);
  };
  currentMediaQuery = mediaQuery;
  updateTheme(mediaQuery.matches);
  notifyThemeChange();
}

/**
 * Returns the current theme mode:
 * - "auto" if auto mode is enabled,
 * - "dark" if the document body has the "dark" class,
 * - "light" otherwise.
 */
export function getCurrentThemeMode(): ThemeMode {
  if (currentMediaQuery) {
    return "auto";
  }
  return document.body.classList.contains("dark") ? "dark" : "light";
}

// -- React Context & Provider --

interface ThemeModeContextValue {
  mode: ThemeMode;
  switchToDarkMode: () => void;
  switchToLightMode: () => void;
  switchToAutoMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => getCurrentThemeMode());

  useEffect(() => {
    // Subscribe to changes triggered by standalone functions
    const unsubscribe = subscribeToThemeChange((newMode) => {
      setMode(newMode);
    });
    // The page may apply its saved theme before the provider's effect subscribes.
    setMode(getCurrentThemeMode());
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      mode,
      switchToDarkMode,
      switchToLightMode,
      switchToAutoMode,
    }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return context;
}
