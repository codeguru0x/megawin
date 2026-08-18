/**
 * Boot script that reads user preference values (theme mode, theme preset,
 * content layout, navbar style) from cookies or localStorage based on the
 * configured persistence mode.
 *
 * Runs early in <head> to apply the correct data attributes before hydration,
 * preventing layout or theme flicker and keeping RootLayout fully static.
 *
 * Script được bơm qua `useServerInsertedHTML` chứ KHÔNG render `<script>` trực
 * tiếp trong JSX: React 19 cảnh báo mọi `<script>` nằm trong component tree
 * ("Encountered a script tag while rendering React component") vì script do
 * React render ở client không bao giờ chạy. `useServerInsertedHTML` chèn thẳng
 * vào SSR stream (ngoài React tree) nên vẫn chạy trước hydration mà không bị
 * cảnh báo. Đây là lý do component phải là `"use client"` dù không có state.
 */
"use client";

import { useRef } from "react";

import { useServerInsertedHTML } from "next/navigation";

import { PREFERENCE_DEFAULTS, PREFERENCE_PERSISTENCE } from "@/lib/preferences/preferences-config";

const persistence = JSON.stringify({
  theme_mode: PREFERENCE_PERSISTENCE.theme_mode,
  theme_preset: PREFERENCE_PERSISTENCE.theme_preset,
  font: PREFERENCE_PERSISTENCE.font,
  content_layout: PREFERENCE_PERSISTENCE.content_layout,
  navbar_style: PREFERENCE_PERSISTENCE.navbar_style,
  sidebar_variant: PREFERENCE_PERSISTENCE.sidebar_variant,
  sidebar_collapsible: PREFERENCE_PERSISTENCE.sidebar_collapsible,
});

const defaults = JSON.stringify({
  theme_mode: PREFERENCE_DEFAULTS.theme_mode,
  theme_preset: PREFERENCE_DEFAULTS.theme_preset,
  font: PREFERENCE_DEFAULTS.font,
  content_layout: PREFERENCE_DEFAULTS.content_layout,
  navbar_style: PREFERENCE_DEFAULTS.navbar_style,
  sidebar_variant: PREFERENCE_DEFAULTS.sidebar_variant,
  sidebar_collapsible: PREFERENCE_DEFAULTS.sidebar_collapsible,
});

// Giá trị đều là hằng số compile-time nên script dựng 1 lần ở module scope.
const BOOT_SCRIPT = `
    (function () {
      try {
        var root = document.documentElement;
        var PERSISTENCE = ${persistence};
        var DEFAULTS = ${defaults};

        function readCookie(name) {
          var match = document.cookie.split("; ").find(function(c) {
            return c.startsWith(name + "=");
          });
          return match ? decodeURIComponent(match.split("=")[1]) : null;
        }

        function readLocal(name) {
          try {
            return window.localStorage.getItem(name);
          } catch (e) {
            return null;
          }
        }

        function readPreference(key, fallback) {
          var mode = PERSISTENCE[key];
          var value = null;

          if (mode === "localStorage") {
            value = readLocal(key);
          }

          if (!value && (mode === "client-cookie" || mode === "server-cookie")) {
            value = readCookie(key);
          }

          if (!value || typeof value !== "string") {
            return fallback;
          }

          return value;
        }

        var rawMode = readPreference("theme_mode", DEFAULTS.theme_mode);
        var rawPreset = readPreference("theme_preset", DEFAULTS.theme_preset);
        var rawFont = readPreference("font", DEFAULTS.font);
        var rawContentLayout = readPreference("content_layout", DEFAULTS.content_layout);
        var rawNavbarStyle = readPreference("navbar_style", DEFAULTS.navbar_style);
        var rawSidebarVariant = readPreference("sidebar_variant", DEFAULTS.sidebar_variant);
        var rawSidebarCollapsible = readPreference("sidebar_collapsible", DEFAULTS.sidebar_collapsible);

        var isValidMode = rawMode === "dark" || rawMode === "light" || rawMode === "system";
        var mode = isValidMode ? rawMode : DEFAULTS.theme_mode;
        var resolvedMode =
          mode === "system" && window.matchMedia
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : mode;
        var preset = rawPreset || DEFAULTS.theme_preset;
        var font = rawFont || DEFAULTS.font;
        var contentLayout = rawContentLayout || DEFAULTS.content_layout;
        var navbarStyle = rawNavbarStyle || DEFAULTS.navbar_style;
        var sidebarVariant = rawSidebarVariant || DEFAULTS.sidebar_variant;
        var sidebarCollapsible = rawSidebarCollapsible || DEFAULTS.sidebar_collapsible;

        root.classList.toggle("dark", resolvedMode === "dark");
        root.setAttribute("data-theme-mode", mode);
        root.setAttribute("data-theme-preset", preset);
        root.setAttribute("data-font", font);
        root.setAttribute("data-content-layout", contentLayout);
        root.setAttribute("data-navbar-style", navbarStyle);
        root.setAttribute("data-sidebar-variant", sidebarVariant);
        root.setAttribute("data-sidebar-collapsible", sidebarCollapsible);

        root.style.colorScheme = resolvedMode === "dark" ? "dark" : "light";

      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;

export function ThemeBootScript() {
  // useServerInsertedHTML gọi callback lại ở MỖI lần Next flush chunk HTML
  // (streaming: mỗi Suspense boundary resolve → 1 lần flush). Không guard thì
  // script bị chèn lại hàng chục lần vào <body> — đã đo thực tế 29 bản trên
  // /dashboard. Ref là state per-request (không phải module scope, vốn sẽ bị
  // chia sẻ giữa các request và làm request thứ 2 mất script).
  const inserted = useRef<boolean>(false);

  useServerInsertedHTML(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không theo được mutation `inserted.current = true` xảy ra trong closure ở dòng dưới nên narrow sai thành literal false; guard này thực tế chặn lần flush thứ 2 trở đi.
    if (inserted.current) {
      return null;
    }
    inserted.current = true;

    // biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration boot script
    return <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />;
  });

  return null;
}
