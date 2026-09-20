import type { ResolvedThemeMode, ThemeMode } from "./theme";

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === "system") {
    // `matchMedia` có sẵn trên mọi browser target của backoffice — không cần `?.`.
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  return mode === "dark" ? "dark" : "light";
}

export function applyThemeMode(mode: ThemeMode): ResolvedThemeMode {
  const resolved = resolveThemeMode(mode);
  const doc = document.documentElement;
  doc.setAttribute("data-theme-mode", mode);
  doc.classList.add("disable-transitions");
  doc.classList.toggle("dark", resolved === "dark");
  doc.style.colorScheme = resolved;
  requestAnimationFrame(() => {
    doc.classList.remove("disable-transitions");
  });
  return resolved;
}

export function applyThemePreset(value: string) {
  document.documentElement.setAttribute("data-theme-preset", value);
}

export function subscribeToSystemTheme(onChange: (mode: ResolvedThemeMode) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };

  media.addEventListener("change", listener);

  return () => {
    media.removeEventListener("change", listener);
  };
}
