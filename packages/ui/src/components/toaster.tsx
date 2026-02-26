"use client";

import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Custom Toaster with professional semantic styling.
 *
 * - Uses sonner as base
 * - Colored left-border accent per type (success/error/warning/info)
 * - Tinted backgrounds with dark mode support
 * - Position: bottom-right (default)
 *
 * Requires importing toast.css in the app's globals.css:
 *   @import "@megawin/ui/styles/toast.css";
 */
function MegawinToaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      richColors={false}
      gap={8}
      icons={{
        success: <CircleCheckIcon className="size-[18px]" />,
        info: <InfoIcon className="size-[18px]" />,
        warning: <TriangleAlertIcon className="size-[18px]" />,
        error: <CircleXIcon className="size-[18px]" />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-lg !shadow-lg !border !py-3.5 !px-4 !gap-3 !items-start",
          title: "!text-sm !font-semibold !leading-snug",
          description: "!text-xs !leading-relaxed !mt-0.5",
          icon: "!mt-0.5 !mr-0",
          actionButton: "!text-xs !font-medium !rounded-md !px-3 !py-1.5",
          closeButton:
            "!border-0 !bg-transparent !opacity-60 hover:!opacity-100 !transition-opacity",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { MegawinToaster };
